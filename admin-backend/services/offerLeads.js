// 50-50 launch offer: the people who registered on the website form
// (krishna_consultation.offerleads, OFFER_LEADS_MONGO_URL). That database is
// only read here; follow-ups, notes, codes and emails live in the DavaDesk
// database of the environment being viewed (admin_leads, promo_codes), so dev
// and prod each keep their own.
const { MongoClient } = require("mongodb");

const LEAD_PREFIX = "offer:";
const SOURCE = "OFFER_5050";
const CACHE_MS = 60 * 1000;

let client = null;
let connecting = null;
let cache = { at: 0, rows: null };

async function collection() {
  const url = process.env.OFFER_LEADS_MONGO_URL;
  if (!url) {
    const err = new Error("OFFER_LEADS_MONGO_URL is not set, so the 50-50 registrations can't be loaded");
    err.status = 503;
    throw err;
  }
  if (!client) {
    connecting =
      connecting ||
      MongoClient.connect(url, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
        .then((c) => (client = c))
        .finally(() => (connecting = null));
    await connecting;
  }
  return client.db().collection(process.env.OFFER_LEADS_COLLECTION || "offerleads");
}

const clean = (v) => (v === undefined || v === null ? "" : String(v).trim());
// Last 10 digits of an Indian mobile, for matching
const mobileKey = (v) => {
  const d = clean(v).replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};
const emailKey = (v) => clean(v).toLowerCase();

function normalize(doc) {
  const f = doc.formData || {};
  const id = String(doc._id);
  const mobile = clean(f.mobile || f.phone);
  return {
    lead_id: `${LEAD_PREFIX}${id}`,
    source_id: id,
    registration_id: clean(doc.registrationId),
    name: clean(f.name) || "Unnamed",
    email: clean(f.email).toLowerCase(),
    mobile,
    mobile_key: mobileKey(mobile),
    pharmacy_name: clean(f.pharmacy_name || f.store) || "—",
    location: clean(f.location),
    drug_license: clean(f.drug_license),
    current_software: clean(f.current_software),
    problems: clean(f.problems),
    license_photo: /^https:\/\//.test(clean(f.license_photo)) ? clean(f.license_photo) : "",
    website_status: clean(doc.followUpStatus) || null,
    website_notes: clean(doc.followUpNotes) || null,
    created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

/** Every registration, newest first (cached for a minute). */
async function listOfferLeads({ fresh = false } = {}) {
  if (!fresh && cache.rows && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const docs = await (await collection())
    .find({}, { projection: { offerId: 1, registrationId: 1, formData: 1, followUpStatus: 1, followUpNotes: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(5000)
    .toArray();
  cache = { at: Date.now(), rows: docs.map(normalize) };
  return cache.rows;
}

async function getOfferLead(leadId) {
  const id = String(leadId || "").startsWith(LEAD_PREFIX) ? String(leadId).slice(LEAD_PREFIX.length) : String(leadId || "");
  return (await listOfferLeads()).find((l) => l.source_id === id) || (await listOfferLeads({ fresh: true })).find((l) => l.source_id === id) || null;
}

/** Lookup maps for "is this DavaDesk user a 50-50 registrant?" */
async function offerIndex() {
  const rows = await listOfferLeads();
  const byEmail = new Map();
  const byMobile = new Map();
  for (const r of rows) {
    if (r.email) byEmail.set(r.email, r);
    if (r.mobile_key) byMobile.set(r.mobile_key, r);
  }
  return { rows, match: (email, mobile) => byEmail.get(emailKey(email)) || byMobile.get(mobileKey(mobile)) || null };
}

module.exports = { LEAD_PREFIX, SOURCE, listOfferLeads, getOfferLead, offerIndex, emailKey, mobileKey };
