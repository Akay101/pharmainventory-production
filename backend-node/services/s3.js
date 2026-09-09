const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const region = process.env.AWS_REGION || 'us-east-1';

const s3Client = new S3Client({
  region: region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'pharmalogy-bills';
const S3_PUBLIC_URL = process.env.AWS_PUBLIC_URL
  ? process.env.AWS_PUBLIC_URL.replace(/\/$/, '')
  : `https://${S3_BUCKET}.s3.${region}.amazonaws.com`;

// Default presigned URL expiration (7 days = 604800 seconds max for AWS S3 SigV4)
const PRESIGNED_EXPIRES_IN = parseInt(process.env.AWS_PRESIGNED_EXPIRES_IN || '604800', 10);

/**
 * Extracts clean object key from key or full URL
 */
const extractKey = (keyOrUrl) => {
  if (!keyOrUrl) return '';
  if (typeof keyOrUrl !== 'string') return keyOrUrl;
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    try {
      const urlObj = new URL(keyOrUrl);
      return urlObj.pathname.replace(/^\//, '');
    } catch (e) {
      return keyOrUrl;
    }
  }
  return keyOrUrl;
};

/**
 * Generates a presigned GET URL for an S3 object key or URL
 */
const getPresignedUrl = async (keyOrUrl, expiresIn = PRESIGNED_EXPIRES_IN) => {
  const key = extractKey(keyOrUrl);
  if (!key) return '';

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Uploads object to S3 and returns a secure presigned GET URL
 */
const uploadToS3 = async (key, body, contentType, expiresIn = PRESIGNED_EXPIRES_IN) => {
  const cleanKey = extractKey(key);
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: cleanKey,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);
  
  // Return presigned GET URL for secure viewing
  return await getPresignedUrl(cleanKey, expiresIn);
};

/**
 * Downloads object from S3 as Buffer
 */
const downloadFromS3 = async (keyOrUrl) => {
  const key = extractKey(keyOrUrl);
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
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

/**
 * Deletes object from S3
 */
const deleteFromS3 = async (keyOrUrl) => {
  const key = extractKey(keyOrUrl);
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
};

module.exports = {
  uploadToS3,
  downloadFromS3,
  deleteFromS3,
  getPresignedUrl,
  extractKey,
  S3_PUBLIC_URL,
  // Backward compatibility aliases
  uploadToR2: uploadToS3,
  downloadFromR2: downloadFromS3,
  deleteFromR2: deleteFromS3,
  R2_PUBLIC_URL: S3_PUBLIC_URL,
};
