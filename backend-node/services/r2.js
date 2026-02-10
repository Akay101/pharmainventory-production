const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

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

const deleteFromR2 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  
  await s3Client.send(command);
};

module.exports = { uploadToR2, deleteFromR2, R2_PUBLIC_URL };
