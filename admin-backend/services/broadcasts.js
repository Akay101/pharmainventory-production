// Broadcast content: validation of what the composer sends, and audience
// helpers. The main API reads the same documents (backend-node/routes/
// broadcasts.js) and the apps render them with BroadcastRender.jsx, so field
// names here are the contract between the three.
const { z } = require("zod");

const KINDS = ["ANNOUNCEMENT", "PROMOTION", "COMING_SOON"];
const THEMES = ["sunset", "ocean", "violet", "emerald", "midnight", "gold", "rose", "brand", "custom"];
const PATTERNS = ["none", "dots", "grid", "stripes", "glow"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const str = (max, min = 0) => z.string().trim().min(min).max(max);
const optStr = (max) => z.string().trim().max(max).optional().default("");

// In-app route ("/billing") or an https page
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^\/[A-Za-z0-9/_\-?=&#.%]*$/.test(v) || isHttps(v), "Use an in-app path like /billing or an https:// link");
function isHttps(v) {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

// An uploaded asset or an https image
const image = z
  .object({ asset_id: z.string().regex(UUID).optional(), url: z.string().trim().max(1000).optional() })
  .refine((v) => (v.asset_id ? true : v.url ? isHttps(v.url) : false), "Upload an image or give an https:// link");
const optImage = image.nullable().optional().default(null);

const align = z.enum(["left", "center"]).optional().default("left");

const BLOCKS = {
  heading: z.object({ text: str(160, 1), size: z.enum(["lg", "md", "sm"]).default("md"), align }),
  text: z.object({ text: str(4000, 1), tone: z.enum(["default", "lead", "muted"]).default("default"), align }),
  image: z.object({ image, alt: optStr(160), caption: optStr(200), fit: z.enum(["cover", "contain"]).default("cover"), height: z.enum(["sm", "md", "lg", "auto"]).default("md") }),
  gallery: z.object({ images: z.array(z.object({ image, caption: optStr(120) })).min(1).max(9), columns: z.union([z.literal(2), z.literal(3)]).default(2) }),
  callout: z.object({ variant: z.enum(["info", "success", "warning", "tip", "new"]).default("info"), emoji: optStr(8), title: optStr(120), text: str(1000, 1) }),
  features: z.object({ items: z.array(z.object({ emoji: optStr(8), title: str(100, 1), text: optStr(300) })).min(1).max(12), columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2) }),
  steps: z.object({ items: z.array(z.object({ title: str(100, 1), text: optStr(300) })).min(1).max(10) }),
  stats: z.object({ items: z.array(z.object({ value: str(20, 1), label: str(60, 1) })).min(1).max(4) }),
  button: z.object({ label: str(40, 1), link: link.refine((v) => v !== "", "A button needs a link"), style: z.enum(["primary", "secondary", "outline"]).default("primary"), align }),
  quote: z.object({ text: str(600, 1), author: optStr(80), role: optStr(80) }),
  video: z.object({ url: str(300, 1).refine((v) => !!youtubeId(v), "Paste a YouTube link"), caption: optStr(200) }),
  countdown: z.object({ target: z.string().datetime(), label: optStr(80) }),
  badges: z.object({ items: z.array(str(30, 1)).min(1).max(12) }),
  divider: z.object({ style: z.enum(["line", "dots", "space"]).default("line") }),
};
const BLOCK_TYPES = Object.keys(BLOCKS);

function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") id = u.searchParams.get("v") || u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/)?.[2];
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

const block = z
  .object({ id: z.string().max(40).optional(), type: z.enum(BLOCK_TYPES) })
  .passthrough()
  .transform((b, ctx) => {
    const r = BLOCKS[b.type].safeParse(b);
    if (!r.success) {
      r.error.issues.forEach((i) => ctx.addIssue({ ...i, path: [b.type, ...i.path] }));
      return z.NEVER;
    }
    return { id: b.id || Math.random().toString(36).slice(2, 10), type: b.type, ...r.data };
  });

const theme = z
  .object({
    preset: z.enum(THEMES).default("sunset"),
    from: z.string().regex(HEX).optional(),
    to: z.string().regex(HEX).optional(),
    pattern: z.enum(PATTERNS).default("glow"),
  })
  .superRefine((t, ctx) => {
    if (t.preset === "custom" && (!t.from || !t.to)) ctx.addIssue({ code: "custom", path: ["from"], message: "Pick both colours for a custom theme" });
  });

const iso = z.string().datetime();

const broadcastSchema = z
  .object({
    kind: z.enum(KINDS),
    title: str(120, 3),
    summary: str(300, 3),
    emoji: optStr(8),
    theme: theme.default({ preset: "sunset", pattern: "glow" }),
    // Picture on the right of the banner, and the modal's cover
    banner: z.object({ image: optImage, cta_label: optStr(30) }).default({ image: null, cta_label: "" }),
    cover: optImage,
    blocks: z.array(block).max(60).default([]),
    // Main button at the bottom of the details modal
    cta: z.object({ label: optStr(40), link: link.optional().default("") }).default({ label: "", link: "" }),
    // BANNER: banner + notifications; SPOTLIGHT: also opens the details once on next visit
    display: z.enum(["BANNER", "SPOTLIGHT", "SILENT"]).default("BANNER"),
    pinned: z.boolean().default(false),
    eta_label: optStr(40), // "Launching in December"
    audience: z
      .object({
        type: z.enum(["ALL", "PHARMACIES", "USERS"]),
        pharmacy_ids: z.array(z.string().max(80)).max(5000).default([]),
        user_ids: z.array(z.string().max(80)).max(5000).default([]),
        admins_only: z.boolean().default(false),
      })
      .superRefine((a, ctx) => {
        if (a.type === "PHARMACIES" && !a.pharmacy_ids.length) ctx.addIssue({ code: "custom", path: ["pharmacy_ids"], message: "Pick at least one pharmacy" });
        if (a.type === "USERS" && !a.user_ids.length) ctx.addIssue({ code: "custom", path: ["user_ids"], message: "Pick at least one user" });
      }),
    starts_at: iso.nullable().optional().default(null),
    expires_at: iso.nullable().optional().default(null),
  })
  .superRefine((d, ctx) => {
    if (d.cta.label && !d.cta.link) ctx.addIssue({ code: "custom", path: ["cta", "link"], message: "The button needs a link" });
    // Updates and offers must end; coming-soon items stay until archived
    if (d.kind !== "COMING_SOON" && !d.expires_at) ctx.addIssue({ code: "custom", path: ["expires_at"], message: "Set an expiry date" });
    const start = d.starts_at ? new Date(d.starts_at) : new Date();
    if (d.expires_at && new Date(d.expires_at) <= start) ctx.addIssue({ code: "custom", path: ["expires_at"], message: "Expiry must be after the start" });
  });

// Asset ids a broadcast uses, kept on the document so unused uploads can be removed
function assetIdsOf(d) {
  const ids = new Set();
  const add = (img) => img?.asset_id && ids.add(img.asset_id);
  add(d.banner?.image);
  add(d.cover);
  for (const b of d.blocks || []) {
    if (b.type === "image") add(b.image);
    if (b.type === "gallery") b.images.forEach((i) => add(i.image));
  }
  return [...ids];
}

// Mongo filter over `users` for an audience
function audienceUserFilter(a) {
  const f = a.type === "PHARMACIES" ? { pharmacy_id: { $in: a.pharmacy_ids } } : a.type === "USERS" ? { id: { $in: a.user_ids } } : {};
  if (a.admins_only) f.role = "ADMIN";
  return f;
}

// DRAFT / SCHEDULED / LIVE / EXPIRED / ARCHIVED
function statusOf(b, now = new Date()) {
  if (b.status === "DRAFT" || b.status === "ARCHIVED") return b.status;
  if (b.starts_at && new Date(b.starts_at) > now) return "SCHEDULED";
  if (b.kind !== "COMING_SOON" && b.expires_at && new Date(b.expires_at) <= now) return "EXPIRED";
  return "LIVE";
}

// Image uploads: checked by their bytes, not the declared type
const IMAGE_MAGIC = [
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", (b) => b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a"],
  ["image/webp", (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"],
];
const sniffImage = (buf) => IMAGE_MAGIC.find(([, test]) => buf.length > 12 && test(buf))?.[0] || null;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;

module.exports = { KINDS, BLOCK_TYPES, broadcastSchema, assetIdsOf, audienceUserFilter, statusOf, sniffImage, MAX_ASSET_BYTES, youtubeId };
