// Assistant chat storage.
//
//   assistant_conversations  one per chat; `state` holds open drafts and the
//                            last agent/language so follow-ups stay on track
//   assistant_messages       one per turn, with the UI blocks that were shown
//
// Retention: both collections carry `expires_at` with a TTL index. A chat
// expires 30 days after its last activity; individual messages 30 days after
// they were written.
const { v4: uuidv4 } = require("uuid");

const RETENTION_DAYS = 30;
const DAY = 24 * 3600 * 1000;
const expiry = (from = Date.now()) => new Date(from + RETENTION_DAYS * DAY);

const convos = (db) => db.collection("assistant_conversations");
const msgs = (db) => db.collection("assistant_messages");

async function ensureIndexes(db) {
  await Promise.all([
    convos(db).createIndex({ id: 1 }, { unique: true, name: "id" }),
    convos(db).createIndex({ user_id: 1, pinned: -1, updated_at: -1 }, { name: "user_recent" }),
    convos(db).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
    msgs(db).createIndex({ conversation_id: 1, created_at: 1 }, { name: "conversation" }),
    msgs(db).createIndex({ id: 1 }, { unique: true, name: "id" }),
    msgs(db).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
  ]);
}

async function createConversation(db, user, title = "New chat") {
  const now = new Date();
  const doc = {
    id: uuidv4(),
    user_id: user.id,
    pharmacy_id: user.pharmacy_id,
    title,
    pinned: false,
    state: { drafts: {}, last_agent: null, language: null },
    message_count: 0,
    created_at: now,
    updated_at: now,
    expires_at: expiry(),
  };
  await convos(db).insertOne(doc);
  return doc;
}

const getConversation = (db, user, id) => convos(db).findOne({ id, user_id: user.id }, { projection: { _id: 0 } });

async function listConversations(db, user, { limit = 30, before, search } = {}) {
  const q = { user_id: user.id };
  if (before) q.updated_at = { $lt: new Date(before) };
  if (search) q.title = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const rows = await convos(db)
    .find(q, { projection: { _id: 0, state: 0 } })
    .sort({ pinned: -1, updated_at: -1 })
    .limit(Math.min(100, limit) + 1)
    .toArray();
  return { conversations: rows.slice(0, limit), has_more: rows.length > limit };
}

async function getMessages(db, conversationId, { limit = 200 } = {}) {
  const rows = await msgs(db)
    .find({ conversation_id: conversationId }, { projection: { _id: 0, expires_at: 0 } })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return rows.reverse();
}

async function addMessage(db, conversationId, message) {
  const now = new Date();
  const doc = { id: message.id || uuidv4(), conversation_id: conversationId, created_at: now, expires_at: expiry(), ...message };
  await msgs(db).insertOne(doc);
  await convos(db).updateOne(
    { id: conversationId },
    {
      $set: { updated_at: now, expires_at: expiry(), ...(message.role === "assistant" ? { last_message: String(message.text || "").slice(0, 120) } : {}) },
      $inc: { message_count: 1 },
    }
  );
  return doc;
}

const updateState = (db, conversationId, patch) =>
  convos(db).updateOne({ id: conversationId }, { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`state.${k}`, v])) });

const setDraft = (db, conversationId, draft) => convos(db).updateOne({ id: conversationId }, { $set: { [`state.drafts.${draft.id}`]: draft } });
const removeDraft = (db, conversationId, draftId) => convos(db).updateOne({ id: conversationId }, { $unset: { [`state.drafts.${draftId}`]: "" } });

async function renameConversation(db, user, id, patch) {
  const set = {};
  if (typeof patch.title === "string" && patch.title.trim()) set.title = patch.title.trim().slice(0, 80);
  if (typeof patch.pinned === "boolean") set.pinned = patch.pinned;
  if (!Object.keys(set).length) return false;
  const r = await convos(db).updateOne({ id, user_id: user.id }, { $set: set });
  return r.matchedCount > 0;
}

async function deleteConversation(db, user, id) {
  const r = await convos(db).deleteOne({ id, user_id: user.id });
  if (r.deletedCount) await msgs(db).deleteMany({ conversation_id: id });
  return r.deletedCount > 0;
}

async function deleteAll(db, user) {
  const ids = (await convos(db).find({ user_id: user.id }, { projection: { id: 1 } }).toArray()).map((c) => c.id);
  await convos(db).deleteMany({ user_id: user.id });
  if (ids.length) await msgs(db).deleteMany({ conversation_id: { $in: ids } });
  return ids.length;
}

const setFeedback = (db, conversationIds, messageId, value) =>
  msgs(db).updateOne({ id: messageId, conversation_id: { $in: conversationIds } }, { $set: { feedback: value } });

module.exports = {
  RETENTION_DAYS,
  ensureIndexes,
  createConversation,
  getConversation,
  listConversations,
  getMessages,
  addMessage,
  updateState,
  setDraft,
  removeDraft,
  renameConversation,
  deleteConversation,
  deleteAll,
  setFeedback,
};
