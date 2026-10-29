const { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  region: 'auto',
});

const R2_BUCKET = process.env.R2_BUCKET || 'pharmalogy-bills';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

const uploadToR2 = async (key, body, contentType) => {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  
  await s3Client.send(command);
  return `${R2_PUBLIC_URL}/${key}`;
};

const downloadFromR2 = async (key) => {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  
  const response = await s3Client.send(command);
  
  const streamToBuffer = (stream) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

  return await streamToBuffer(response.Body);
};

const deleteFromR2 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  
  await s3Client.send(command);
};

// Delete every object whose key starts with `prefix`; returns how many
const deletePrefixFromR2 = async (prefix) => {
  if (!prefix || prefix.length < 8) throw new Error(`Refusing to delete short prefix "${prefix}"`);
  let deleted = 0;
  let token;
  do {
    const page = await s3Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await s3Client.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
};

module.exports = { uploadToR2, downloadFromR2, deleteFromR2, deletePrefixFromR2, R2_PUBLIC_URL };
