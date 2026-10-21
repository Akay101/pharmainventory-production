// Who changed what, in the environment's own database.
async function audit(req, action, target, payload = {}) {
  try {
    await req.db.collection("admin_audit_log").insertOne({
      action,
      target,
      payload,
      admin: {
        id: req.adminUser?._id ? String(req.adminUser._id) : null,
        email: req.adminUser?.email || null,
        name: req.adminUser?.name || null,
      },
      env: req.dbEnv,
      ip: req.ip,
      at: new Date(),
    });
  } catch (err) {
    console.warn("[Audit] write failed:", err.message);
  }
}

const actorOf = (req) => ({
  admin_id: req.adminUser?._id ? String(req.adminUser._id) : null,
  admin_email: req.adminUser?.email || null,
});

// Zod parse helper: returns data or sends 400.
const parseBody = (schema, req, res) => {
  const r = schema.safeParse(req.body ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  res.status(400).json({ error: `${issue.path.join(".") || "body"}: ${issue.message}` });
  return null;
};

module.exports = { audit, actorOf, parseBody };
