// Private files on S3 (AWS_PRIVATE_S3_BUCKET, else AWS_S3_BUCKET). Nothing here
// is public: reads go through short-lived signed links handed out after the API
// has checked who is asking.
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET = () => process.env.AWS_PRIVATE_S3_BUCKET || process.env.AWS_S3_BUCKET || "pharmalogy-media-bucket";

let client = null;
const s3 = () => {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) throw new Error("S3 is not configured");
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    });
  }
  return client;
};

const putPrivate = (key, body, contentType) =>
  s3().send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));

const signedUrl = (key, { expiresIn = 300, filename, contentType } = {}) =>
  getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: filename ? `inline; filename="${String(filename).replace(/[^\w.\- ]/g, "_")}"` : undefined,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn }
  );

// A short-lived link that saves the file instead of opening it
const downloadUrl = (key, { expiresIn = 900, filename } = {}) =>
  getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BUCKET(), Key: key, ...(filename ? { ResponseContentDisposition: `attachment; filename="${String(filename).replace(/[^\w.\- ]/g, "_")}"` } : {}) }),
    { expiresIn }
  );

const exists = (key) =>
  s3()
    .send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key }))
    .then(() => true)
    .catch((err) => {
      if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") return false;
      throw err;
    });

const remove = (key) => s3().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));

// Delete every object under `prefix`; returns how many
async function removePrefix(prefix) {
  if (!prefix || prefix.length < 8) throw new Error(`Refusing to delete short prefix "${prefix}"`);
  let deleted = 0;
  let token;
  do {
    const page = await s3().send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await s3().send(new DeleteObjectsCommand({ Bucket: BUCKET(), Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

module.exports = { putPrivate, signedUrl, downloadUrl, exists, remove, removePrefix };
