// Photos attached in the assistant chat.
// The prepared images live in Redis for an hour per chat so follow-ups
// ("iska bill bana do") can still use them; the chat history keeps only
// small thumbnails.
const sharp = require("sharp");
const { connection: redis } = require("../ai/queue");
const { prepareImages } = require("../ai/imagePrep");

const TTL_S = 3600;
const key = (conversationId) => `asst:img:${conversationId}`;

async function withTimeout(p, ms = 2000) {
  let t;
  try {
    return await Promise.race([p, new Promise((_, rej) => (t = setTimeout(() => rej(new Error("timeout")), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

// Validates and shrinks uploads; returns images for the AI plus thumbnails
async function prepare(files) {
  // Invoice preset keeps small table text legible; packs read fine at it too
  let images;
  try {
    images = await prepareImages(files.map((f) => f.buffer), "bill");
  } catch (err) {
    throw Object.assign(new Error(err.message || "One of the files is not a readable image"), { status: 422 });
  }
  const thumbs = await Promise.all(
    images.map(async (img) => `data:image/jpeg;base64,${(await sharp(img.data).resize(360, 360, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer()).toString("base64")}`)
  );
  return { images, thumbs };
}

async function remember(conversationId, images) {
  try {
    await withTimeout(redis.set(key(conversationId), JSON.stringify(images.map((i) => i.data.toString("base64"))), "EX", TTL_S));
  } catch (err) {
    console.warn("[assistant attachments] couldn't cache photos:", err.message);
  }
}

async function recall(conversationId) {
  try {
    const raw = await withTimeout(redis.get(key(conversationId)));
    return raw ? JSON.parse(raw).map((b64) => ({ data: Buffer.from(b64, "base64"), mimeType: "image/jpeg" })) : [];
  } catch {
    return [];
  }
}

module.exports = { prepare, remember, recall };
