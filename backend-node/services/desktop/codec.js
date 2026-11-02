// JSON for documents crossing to and from the desktop app, keeping dates and ids.
const mongoose = require("mongoose");

const isObjectIdText = (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);

// Device ids are hex strings; here they become the ObjectIds MongoDB stores
const toId = (key) => (isObjectIdText(key) ? new mongoose.Types.ObjectId(key) : key);
const fromId = (id) => (id && typeof id === "object" && id.toHexString ? id.toHexString() : id);

function outgoing(value) {
  if (value instanceof Date) return { $date: value.getTime() };
  if (value && typeof value === "object" && value.toHexString) return value.toHexString();
  if (Buffer.isBuffer(value)) return { $bin: value.toString("base64") };
  if (Array.isArray(value)) return value.map(outgoing);
  if (value && typeof value === "object") {
    if (value._bsontype === "Decimal128" || value._bsontype === "Long" || value._bsontype === "Double") return Number(value.toString());
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, outgoing(v)]));
  }
  return value;
}

// Rejects operator-style keys, so nothing pushed can act as a MongoDB command
function incoming(value) {
  if (Array.isArray(value)) return value.map(incoming);
  if (value && typeof value === "object") {
    if (typeof value.$date === "number") return new Date(value.$date);
    if (typeof value.$bin === "string") return Buffer.from(value.$bin, "base64");
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("$")) throw Object.assign(new Error(`Field not allowed: ${k}`), { status: 400 });
      out[k] = incoming(v);
    }
    return out;
  }
  return value;
}

module.exports = { toId, fromId, outgoing, incoming };
