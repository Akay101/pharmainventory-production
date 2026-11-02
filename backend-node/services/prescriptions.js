// Prescriptions attached to bills that sell Schedule H1 medicines. The file is
// in the private S3 bucket and its details in MongoDB; the pharmacy's signed-in
// users open it through a signed link that lasts minutes. An upload not linked
// to a bill within a day is swept by the cron job (purgeUnlinked).
const { v4: uuidv4 } = require("uuid");
const s3 = require("./s3");
const { h1Lines } = require("../utils/scheduleH1");

const COLLECTION = "bill_prescriptions";
const MAX_BYTES = 5 * 1024 * 1024;
const UNLINKED_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_SECONDS = 5 * 60;
const EXT = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const prefixOf = (pharmacyId) => `prescriptions/${pharmacyId}/`;

// Type from the file's own bytes, not its name or the browser's claim
function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.slice(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0x89 && buf.slice(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

const meta = (doc) =>
  doc && { id: doc.id, name: doc.name, mime: doc.mime, size: doc.size, uploaded_at: doc.created_at, uploaded_by_name: doc.uploaded_by_name || "" };

async function savePrescription(db, user, file) {
  if (!file?.buffer?.length) return { error: "Attach the prescription (PDF or photo)" };
  if (file.buffer.length > MAX_BYTES) return { error: "Prescription file is over 5 MB" };
  const mime = sniffMime(file.buffer);
  if (!mime) return { error: "Prescription must be a PDF or a photo (JPG, PNG, WebP)" };
  const id = uuidv4();
  const s3_key = `${prefixOf(user.pharmacy_id)}${id}.${EXT[mime]}`;
  await s3.putPrivate(s3_key, file.buffer, mime);
  const doc = {
    id,
    pharmacy_id: user.pharmacy_id,
    bill_id: null,
    name: String(file.originalname || "prescription").slice(0, 120),
    mime,
    size: file.buffer.length,
    s3_key,
    uploaded_by: user.id,
    uploaded_by_name: user.name || "",
    created_at: new Date().toISOString(),
    unlinked_until: new Date(Date.now() + UNLINKED_TTL_MS),
  };
  await db.collection(COLLECTION).insertOne(doc);
  return { prescription: meta(doc) };
}

const findOne = (db, pharmacyId, id) =>
  id ? db.collection(COLLECTION).findOne({ id: String(id), pharmacy_id: pharmacyId }, { projection: { data: 0, _id: 0 } }) : null;

// Before a bill is saved: which lines are Schedule H1, and the prescription
// that covers them. { status, body } when one is needed and missing.
async function checkBillPrescription(db, pharmacyId, items, prescriptionId, billId = null) {
  const h1 = await h1Lines(db, pharmacyId, items || []);
  if (!h1.length) return { h1, prescription: null };
  const doc = await findOne(db, pharmacyId, prescriptionId);
  if (!doc || (doc.bill_id && doc.bill_id !== billId)) {
    return {
      error: {
        status: 400,
        body: {
          code: "PRESCRIPTION_REQUIRED",
          detail: `Attach the prescription: ${h1.join(", ")} ${h1.length > 1 ? "are" : "is a"} Schedule H1 medicine${h1.length > 1 ? "s" : ""}`,
          schedule_h1_items: h1,
        },
      },
    };
  }
  return { h1, prescription: meta(doc) };
}

const linkToBill = (db, pharmacyId, prescriptionId, billId) =>
  db.collection(COLLECTION).updateOne({ id: prescriptionId, pharmacy_id: pharmacyId }, { $set: { bill_id: billId }, $unset: { unlinked_until: "", expires_at: "" } });

// A signed link to the file, for this pharmacy's users only. Files uploaded
// before prescriptions moved to S3 are moved on first open.
async function accessLink(db, pharmacyId, id) {
  const doc = await db.collection(COLLECTION).findOne({ id: String(id), pharmacy_id: pharmacyId });
  if (!doc) return null;
  if (!doc.s3_key && doc.data) {
    doc.s3_key = `${prefixOf(pharmacyId)}${doc.id}.${EXT[doc.mime] || "bin"}`;
    await s3.putPrivate(doc.s3_key, Buffer.from(doc.data.buffer || doc.data), doc.mime);
    await db.collection(COLLECTION).updateOne({ id: doc.id, pharmacy_id: pharmacyId }, { $set: { s3_key: doc.s3_key }, $unset: { data: "" } });
  }
  if (!doc.s3_key) return null;
  const url = await s3.signedUrl(doc.s3_key, { expiresIn: LINK_SECONDS, filename: doc.name, contentType: doc.mime });
  return { url, name: doc.name, mime: doc.mime, expires_in: LINK_SECONDS };
}

async function removeDocs(db, docs) {
  for (const doc of docs) {
    if (doc.s3_key) await s3.remove(doc.s3_key);
    await db.collection(COLLECTION).deleteOne({ _id: doc._id });
  }
  return docs.length;
}

const removeById = async (db, pharmacyId, id) =>
  removeDocs(db, await db.collection(COLLECTION).find({ id, pharmacy_id: pharmacyId }, { projection: { data: 0 } }).toArray());

const removeForBill = async (db, pharmacyId, billId) =>
  removeDocs(db, await db.collection(COLLECTION).find({ bill_id: billId, pharmacy_id: pharmacyId }, { projection: { data: 0 } }).toArray());

// Uploads never saved with a bill
const purgeUnlinked = async (db) =>
  removeDocs(db, await db.collection(COLLECTION).find({ unlinked_until: { $lte: new Date() } }, { projection: { data: 0 } }).limit(200).toArray());

// An offboarded pharmacy's files
const removePharmacyFiles = (pharmacyId) => s3.removePrefix(prefixOf(pharmacyId));

module.exports = {
  COLLECTION,
  MAX_BYTES,
  sniffMime,
  savePrescription,
  findOne,
  checkBillPrescription,
  linkToBill,
  accessLink,
  removeById,
  removeForBill,
  purgeUnlinked,
  removePharmacyFiles,
  meta,
};
