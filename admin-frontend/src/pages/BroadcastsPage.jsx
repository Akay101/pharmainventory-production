import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Building2,
  Copy,
  Eye,
  Globe2,
  Loader2,
  Megaphone,
  Monitor,
  Moon,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Sun,
  Trash2,
  User,
  Users,
  X,
  Archive,
  Pin,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError, broadcastAssetUrl } from "../api";
import { useAuth } from "../context/AuthContext";
import BottomDrawer from "../components/BottomDrawer";
import { BroadcastBanner, BroadcastDetail, BroadcastThumb, KIND_META, THEMES, heroStyle, palette } from "../components/broadcast/BroadcastRender";

const inputCls = "w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const areaCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y";
const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1";

const STATE_STYLE = {
  LIVE: "bg-emerald-100 text-emerald-700",
  SCHEDULED: "bg-sky-100 text-sky-700",
  DRAFT: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-rose-100 text-rose-700",
};
const STATES = ["LIVE", "SCHEDULED", "DRAFT", "EXPIRED", "ARCHIVED"];

const QUICK_EMOJI = ["🚀", "✨", "🎉", "🎁", "📢", "🔥", "💊", "⚡", "🧾", "📦", "🤖", "🛠️", "💡", "⭐", "📈", "🔔"];

// In-app pages a button can open
const APP_LINKS = [
  ["/dashboard", "Dashboard"],
  ["/billing", "Billing"],
  ["/purchases", "Purchases"],
  ["/inventory", "Inventory"],
  ["/assistant", "DavaDesk AI"],
  ["/upgrade", "Upgrade / plans"],
  ["/reports", "Reports"],
  ["/restock", "Restock"],
  ["/settings", "Settings"],
  ["/support", "Help & support"],
];

const uid = () => Math.random().toString(36).slice(2, 10);
const toLocalInput = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString();
const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// ---------------------------------------------------------------------------
// Elements the composer can add, with their editable fields

const ALIGN = ["align", "Align", "align"];
const BLOCKS = {
  heading: { label: "Heading", emoji: "🔠", make: () => ({ text: "Section heading", size: "md", align: "left" }), fields: [["text", "Text"], ["size", "Size", "select", [["lg", "Large"], ["md", "Medium"], ["sm", "Small"]]], ALIGN] },
  text: {
    label: "Paragraph",
    emoji: "📝",
    make: () => ({ text: "Write something. Use **bold**, *italic* and [links](/billing).", tone: "default", align: "left" }),
    fields: [["text", "Text (**bold**, *italic*, [label](link))", "textarea"], ["tone", "Style", "select", [["default", "Normal"], ["lead", "Large intro"], ["muted", "Small / muted"]]], ALIGN],
  },
  image: {
    label: "Image",
    emoji: "🖼️",
    make: () => ({ image: null, alt: "", caption: "", fit: "cover", height: "md" }),
    fields: [["image", "Image", "image"], ["caption", "Caption"], ["alt", "Alt text (for screen readers)"], ["height", "Height", "select", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"], ["auto", "Original"]]], ["fit", "Fit", "select", [["cover", "Fill (crop)"], ["contain", "Whole image"]]]],
  },
  gallery: {
    label: "Gallery",
    emoji: "🎞️",
    make: () => ({ images: [], columns: 2 }),
    fields: [["images", "Images", "list", { make: () => ({ image: null, caption: "" }), fields: [["image", "Image", "image"], ["caption", "Caption"]], max: 9 }], ["columns", "Columns", "select", [[2, "2"], [3, "3"]]]],
  },
  callout: {
    label: "Callout",
    emoji: "💬",
    make: () => ({ variant: "new", emoji: "", title: "Heads up", text: "Something worth highlighting." }),
    fields: [["variant", "Style", "select", [["new", "Theme colour"], ["info", "Info (blue)"], ["success", "Success (green)"], ["warning", "Warning (amber)"], ["tip", "Tip (purple)"]]], ["emoji", "Emoji (optional)", "emoji"], ["title", "Title"], ["text", "Text", "textarea"]],
  },
  features: {
    label: "Feature cards",
    emoji: "🧩",
    make: () => ({ columns: 2, items: [{ emoji: "⚡", title: "Faster", text: "What it does for them." }, { emoji: "🤖", title: "Smarter", text: "Another benefit." }] }),
    fields: [["items", "Cards", "list", { make: () => ({ emoji: "✨", title: "Feature", text: "" }), fields: [["emoji", "Emoji", "emoji"], ["title", "Title"], ["text", "Text", "textarea"]], max: 12 }], ["columns", "Columns", "select", [[1, "1"], [2, "2"], [3, "3"]]]],
  },
  steps: {
    label: "Steps",
    emoji: "🪜",
    make: () => ({ items: [{ title: "Open Billing", text: "" }, { title: "Tap the new button", text: "" }] }),
    fields: [["items", "Steps", "list", { make: () => ({ title: "Step", text: "" }), fields: [["title", "Title"], ["text", "Text", "textarea"]], max: 10 }]],
  },
  stats: {
    label: "Big numbers",
    emoji: "📊",
    make: () => ({ items: [{ value: "2x", label: "Faster billing" }, { value: "50%", label: "Off this month" }] }),
    fields: [["items", "Numbers", "list", { make: () => ({ value: "10+", label: "Label" }), fields: [["value", "Value"], ["label", "Label"]], max: 4 }]],
  },
  button: {
    label: "Button",
    emoji: "🔘",
    make: () => ({ label: "Try it now", link: "/billing", style: "primary", align: "left" }),
    fields: [["label", "Label"], ["link", "Link", "link"], ["style", "Style", "select", [["primary", "Solid"], ["secondary", "Soft"], ["outline", "Outline"]]], ALIGN],
  },
  quote: { label: "Quote", emoji: "❝", make: () => ({ text: "This saved us an hour every day.", author: "", role: "" }), fields: [["text", "Quote", "textarea"], ["author", "Who said it"], ["role", "Their role / pharmacy"]] },
  video: { label: "YouTube video", emoji: "▶️", make: () => ({ url: "", caption: "" }), fields: [["url", "YouTube link"], ["caption", "Caption"]] },
  countdown: { label: "Countdown", emoji: "⏳", make: () => ({ target: inDays(14), label: "Launching in" }), fields: [["label", "Label"], ["target", "Counts down to", "datetime"]] },
  badges: { label: "Tags", emoji: "🏷️", make: () => ({ items: ["New", "AI", "Free"] }), fields: [["items", "Tags (comma separated)", "tags"]] },
  divider: { label: "Divider", emoji: "➖", make: () => ({ style: "line" }), fields: [["style", "Style", "select", [["line", "Line"], ["dots", "Dots"], ["space", "Empty space"]]]] },
};

// ---------------------------------------------------------------------------
// Starting points

const base = () => ({
  kind: "ANNOUNCEMENT",
  title: "",
  summary: "",
  emoji: "✨",
  theme: { preset: "sunset", pattern: "glow" },
  banner: { image: null, cta_label: "" },
  cover: null,
  blocks: [],
  cta: { label: "", link: "" },
  display: "BANNER",
  pinned: false,
  eta_label: "",
  audience: { type: "ALL", pharmacy_ids: [], user_ids: [], admins_only: false },
  starts_at: null,
  expires_at: inDays(14),
});
const withIds = (blocks) => blocks.map((b) => ({ id: uid(), ...b }));

const TEMPLATES = [
  { id: "blank", name: "Blank", emoji: "📄", note: "Start from scratch", make: () => base() },
  {
    id: "launch",
    name: "Feature launch",
    emoji: "🚀",
    note: "Announce something new",
    make: () => ({
      ...base(),
      title: "Meet the new Billing scanner",
      summary: "Scan a strip and the bill fills itself. Live for everyone today.",
      emoji: "🚀",
      theme: { preset: "ocean", pattern: "glow" },
      blocks: withIds([
        { type: "text", tone: "lead", text: "We've rebuilt billing around your camera. Point it at a strip and DavaDesk finds the batch, expiry and price for you." },
        { type: "features", columns: 2, items: [{ emoji: "📸", title: "Scan to bill", text: "No typing for most medicines." }, { emoji: "⚡", title: "Twice as fast", text: "Bills in seconds at the counter." }] },
        { type: "steps", items: [{ title: "Open Billing", text: "" }, { title: "Tap Scan", text: "Allow the camera once." }, { title: "Point at the strip", text: "" }] },
      ]),
      cta: { label: "Try it now", link: "/billing" },
    }),
  },
  {
    id: "soon",
    name: "Coming soon",
    emoji: "🛸",
    note: "Tease an upcoming feature",
    make: () => ({
      ...base(),
      kind: "COMING_SOON",
      title: "WhatsApp ordering is on its way",
      summary: "Your customers will soon order refills straight from WhatsApp.",
      emoji: "🛸",
      eta_label: "Launching in December",
      theme: { preset: "violet", pattern: "dots" },
      expires_at: inDays(7),
      blocks: withIds([
        { type: "countdown", target: inDays(30), label: "Launching in" },
        { type: "text", text: "Here's a sneak peek at what we're building for you." },
        { type: "badges", items: ["WhatsApp", "Refills", "Free in all plans"] },
      ]),
    }),
  },
  {
    id: "offer",
    name: "Offer",
    emoji: "🎁",
    note: "Promote a discount or plan",
    make: () => ({
      ...base(),
      kind: "PROMOTION",
      title: "50% off Agentic this month",
      summary: "Unlock DavaDesk AI for your whole team at half price.",
      emoji: "🎁",
      theme: { preset: "sunset", pattern: "glow" },
      display: "SPOTLIGHT",
      expires_at: inDays(10),
      blocks: withIds([
        { type: "stats", items: [{ value: "50%", label: "Off" }, { value: "10", label: "Days left" }] },
        { type: "callout", variant: "new", emoji: "⏰", title: "Ends soon", text: "The offer ends on the date shown on your plan page." },
      ]),
      banner: { image: null, cta_label: "See the offer" },
      cta: { label: "Upgrade now", link: "/upgrade" },
    }),
  },
  {
    id: "notice",
    name: "Service notice",
    emoji: "🛠️",
    note: "Maintenance or an important update",
    make: () => ({
      ...base(),
      title: "Scheduled maintenance on Sunday",
      summary: "DavaDesk will be unavailable from 2 to 3 AM while we upgrade servers.",
      emoji: "🛠️",
      theme: { preset: "midnight", pattern: "grid" },
      expires_at: inDays(4),
      blocks: withIds([{ type: "callout", variant: "warning", title: "What to expect", text: "Billing will pause for about an hour. Anything you save before 2 AM is safe." }]),
    }),
  },
];

// ---------------------------------------------------------------------------
// Image upload (compressed in the browser; GIFs kept as they are)

async function compressImage(file) {
  if (file.type === "image/gif") return file;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file isn't an image we can read"));
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), "image/webp", 0.85));
}
const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

function ImageField({ value, onChange, canWrite }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(value?.url || "");
  const input = useRef(null);
  const src = value?.asset_id ? broadcastAssetUrl(value.asset_id) : value?.url;
  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast.error("Use a PNG, JPEG, WebP or GIF image");
    setBusy(true);
    try {
      const blob = await compressImage(file);
      if (blob.size > 2 * 1024 * 1024) throw new Error("Image is over 2 MB even after compressing; use a smaller one");
      const res = await AdminAPI.uploadBroadcastAsset({ data: await toBase64(blob), name: file.name });
      onChange({ asset_id: res.data.id });
    } catch (err) {
      toast.error(apiError(err, err.message || "Upload failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {src ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <img src={src} alt="" className="h-32 w-full object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1 text-white" title="Remove image">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files?.[0]);
          }}
          className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {busy ? "Uploading…" : "Upload or drop an image"}
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
      {!src && (
        <div className="flex gap-1.5">
          <input className={inputCls} placeholder="…or paste an https:// image link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={() => url.startsWith("https://") ? onChange({ url: url.trim() }) : toast.error("Image links must start with https://")}>
            Use
          </button>
        </div>
      )}
    </div>
  );
}

function EmojiField({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <input className={inputCls} value={value || ""} maxLength={8} onChange={(e) => onChange(e.target.value)} placeholder="Type or pick an emoji" />
      <div className="flex flex-wrap gap-1">
        {QUICK_EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => onChange(e)} className={`h-7 w-7 rounded-lg text-base hover:bg-slate-100 ${value === e ? "bg-brand-50 ring-1 ring-brand-300" : ""}`}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function LinkField({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <input className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="/billing or https://…" />
      <div className="flex flex-wrap gap-1">
        {APP_LINKS.map(([path, name]) => (
          <button key={path} type="button" onClick={() => onChange(path)} className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${value === path ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

// One field of an element (or of an item in a list field)
function Field({ def, value, onChange, canWrite }) {
  const [key, label, type = "text", opts] = def;
  let control;
  if (type === "textarea") control = <textarea rows={3} className={areaCls} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  else if (type === "select")
    control = (
      <select className={inputCls} value={value} onChange={(e) => onChange(typeof opts[0][0] === "number" ? Number(e.target.value) : e.target.value)}>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    );
  else if (type === "align")
    control = (
      <div className="flex gap-1">
        {[["left", AlignLeft], ["center", AlignCenter]].map(([v, Icon]) => (
          <button key={v} type="button" onClick={() => onChange(v)} className={`flex h-9 w-10 items-center justify-center rounded-xl border ${value === v ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500"}`}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    );
  else if (type === "image") control = <ImageField value={value} onChange={onChange} canWrite={canWrite} />;
  else if (type === "emoji") control = <EmojiField value={value} onChange={onChange} />;
  else if (type === "link") control = <LinkField value={value} onChange={onChange} />;
  else if (type === "datetime") control = <input type="datetime-local" className={inputCls} value={toLocalInput(value)} onChange={(e) => onChange(fromLocalInput(e.target.value))} />;
  else if (type === "tags")
    control = <input className={inputCls} value={(value || []).join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((t) => t.trimStart()).filter((t, i, all) => t || i === all.length - 1))} />;
  else if (type === "list") {
    const items = value || [];
    const set = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
    control = (
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="relative rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 pr-9">
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              {opts.fields.map((f) => (
                <div key={f[0]} className={f[2] === "textarea" || f[2] === "image" || f[2] === "emoji" ? "sm:col-span-2" : ""}>
                  <Field def={f} value={it[f[0]]} onChange={(v) => set(i, { [f[0]]: v })} canWrite={canWrite} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {items.length < (opts.max || 10) && (
          <button type="button" onClick={() => onChange([...items, opts.make()])} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-brand-600 hover:bg-brand-50">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
    );
  } else control = <input className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  return (
    <div>
      <span className={labelCls}>{label}</span>
      {control}
    </div>
  );
}

function BlockEditor({ block, index, count, onChange, onMove, onDuplicate, onRemove, canWrite }) {
  const def = BLOCKS[block.type] || { label: block.type, emoji: "❔", fields: [] };
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="text-base">{def.emoji}</span>
          <span className="text-sm font-bold text-slate-800">{def.label}</span>
          <span className="truncate text-xs text-slate-400">{block.text || block.label || block.title || ""}</span>
        </button>
        <div className="flex items-center gap-0.5 text-slate-400">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-30" title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-30" title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDuplicate} className="rounded-lg p-1 hover:bg-slate-100" title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg p-1 hover:bg-rose-50 hover:text-rose-600" title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          {def.fields.map((f) => (
            <Field key={f[0]} def={f} value={block[f[0]]} onChange={(v) => onChange({ ...block, [f[0]]: v })} canWrite={canWrite} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience picker

function AudienceField({ value, onChange }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState({ users: [], pharmacies: [] });
  const [labels, setLabels] = useState({});
  const [count, setCount] = useState(null);
  const box = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setRes({ users: [], pharmacies: [] });
    const t = setTimeout(() => AdminAPI.searchBroadcastAudience(q.trim()).then((r) => setRes(r.data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Names for ids already picked (opening an existing broadcast)
  useEffect(() => {
    const missing = { user_ids: value.user_ids.filter((id) => !labels[id]), pharmacy_ids: value.pharmacy_ids.filter((id) => !labels[id]) };
    if (!missing.user_ids.length && !missing.pharmacy_ids.length) return;
    AdminAPI.resolveBroadcastAudience(missing)
      .then((r) => setLabels((l) => ({ ...l, ...Object.fromEntries([...r.data.users.map((u) => [u.id, u.name || u.email]), ...r.data.pharmacies.map((p) => [p.id, p.name])]) })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.user_ids.join(), value.pharmacy_ids.join()]);

  useEffect(() => {
    const t = setTimeout(() => AdminAPI.countBroadcastAudience(value).then((r) => setCount(r.data.users)).catch(() => setCount(null)), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const key = value.type === "USERS" ? "user_ids" : "pharmacy_ids";
  const add = (id, name) => {
    setLabels((l) => ({ ...l, [id]: name }));
    if (!value[key].includes(id)) onChange({ ...value, [key]: [...value[key], id] });
    setQ("");
    setOpen(false);
  };
  const options = value.type === "USERS" ? res.users.map((u) => [u.id, u.name || u.email, [u.email, u.pharmacy_name, u.role].filter(Boolean).join(" · ")]) : res.pharmacies.map((p) => [p.id, p.name, p.city || p.id]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["ALL", "Everyone", Globe2],
          ["PHARMACIES", "Pharmacies", Building2],
          ["USERS", "Specific users", User],
        ].map(([t, l, Icon]) => (
          <button key={t} type="button" onClick={() => onChange({ ...value, type: t })} className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-bold ${value.type === t ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Icon className="h-4 w-4" />
            {l}
          </button>
        ))}
      </div>
      {value.type !== "ALL" && (
        <div ref={box} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className={`${inputCls} pl-9`} value={q} onFocus={() => setOpen(true)} onChange={(e) => (setQ(e.target.value), setOpen(true))} placeholder={value.type === "USERS" ? "Search name, email or mobile" : "Search pharmacy name or city"} />
          </div>
          {open && options.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              {options.map(([id, name, sub]) => (
                <button key={id} type="button" onClick={() => add(id, name)} className="flex w-full flex-col rounded-lg px-3 py-1.5 text-left hover:bg-slate-50">
                  <span className="text-sm font-semibold text-slate-800">{name}</span>
                  <span className="text-[11px] text-slate-500">{sub}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {value[key].map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-700">
                {labels[id] || id}
                <button type="button" onClick={() => onChange({ ...value, [key]: value[key].filter((x) => x !== id) })} className="rounded-full p-0.5 hover:bg-slate-200">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value.admins_only} onChange={(e) => onChange({ ...value, admins_only: e.target.checked })} className="h-4 w-4 rounded accent-orange-500" />
        Only pharmacy admins (skip staff logins)
      </label>
      <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
        <Users className="h-3.5 w-3.5" /> Reaches {count === null ? "…" : `${count.toLocaleString("en-IN")} user${count === 1 ? "" : "s"}`} today. Users who join later see it too while it's live.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer

function Section({ n, title, hint, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[11px] font-black text-white">{n}</span>
        <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Preview({ draft }) {
  const [mode, setMode] = useState("banner");
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [replay, setReplay] = useState(0); // remount the card to replay its entrance
  const b = { ...draft, title: draft.title || "Your headline", summary: draft.summary || "A one-line overview users see on the banner." };
  const tab = (id, label, Icon) => (
    <button type="button" onClick={() => setMode(id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${mode === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {tab("banner", "Banner", Megaphone)}
          {tab("detail", "Details", Eye)}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMobile(false)} className={`rounded-lg p-1.5 ${!mobile ? "bg-slate-200 text-slate-800" : "text-slate-400"}`} title="Desktop">
            <Monitor className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setMobile(true)} className={`rounded-lg p-1.5 ${mobile ? "bg-slate-200 text-slate-800" : "text-slate-400"}`} title="Phone">
            <Smartphone className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setReplay((n) => n + 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Replay the entrance">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDark(!dark)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Light / dark">
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto rounded-2xl p-4 ${dark ? "bg-slate-950" : "bg-slate-100"}`}>
        <div className={`mx-auto transition-all ${mobile ? "max-w-[380px]" : "max-w-full"}`}>
          {mode === "banner" ? (
            // Mock app screen with the card floating at the top right, as users see it
            <div className={`relative min-h-[460px] overflow-hidden rounded-2xl border ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
              <div className={`flex h-11 items-center gap-2 border-b px-4 ${dark ? "border-slate-800" : "border-slate-100"}`}>
                <span className="h-5 w-5 rounded-md bg-brand-500" />
                {[56, 44, 52, 40].map((w, i) => <span key={i} className={`h-2.5 rounded-full ${dark ? "bg-slate-800" : "bg-slate-100"}`} style={{ width: w }} />)}
              </div>
              <div className="space-y-3 p-4">
                <span className={`block h-4 w-40 rounded-full ${dark ? "bg-slate-800" : "bg-slate-100"}`} />
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((i) => <div key={i} className={`h-24 rounded-xl ${dark ? "bg-slate-800/60" : "bg-slate-50"}`} />)}
                </div>
              </div>
              <div key={replay} className={`absolute top-14 ${mobile ? "inset-x-3" : "right-3 w-[360px] max-w-[calc(100%-24px)]"}`}>
                <BroadcastBanner b={b} dark={dark} assetUrl={broadcastAssetUrl} onExplore={() => setMode("detail")} onClose={() => setTimeout(() => setReplay((n) => n + 1), 600)} />
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl shadow-2xl">
              <BroadcastDetail b={b} assetUrl={broadcastAssetUrl} dark={dark} onLink={(l) => toast.message(`Opens ${l}`)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({ initial, existing, onClose, onSaved }) {
  const { user } = useAuth();
  const canPublish = ["SUPERADMIN", "ADMIN"].includes(user?.role);
  const canWrite = canPublish || user?.role === "OPERATOR";
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setBlocks = (blocks) => set({ blocks });
  const isLive = existing && existing.status === "PUBLISHED";

  const save = async (publish) => {
    setSaving(publish ? "publish" : "save");
    try {
      const body = { ...d, blocks: d.blocks.map((b) => (b.type === "badges" ? { ...b, items: b.items.map((t) => t.trim()).filter(Boolean) } : b)) };
      if (existing) {
        await AdminAPI.updateBroadcast(existing.id, body);
        if (publish && existing.status !== "PUBLISHED") await AdminAPI.publishBroadcast(existing.id);
      } else {
        await AdminAPI.createBroadcast({ ...body, publish });
      }
      toast.success(publish ? (d.starts_at && new Date(d.starts_at) > new Date() ? "Scheduled" : "Broadcast is live") : isLive ? "Changes are live" : "Draft saved");
      onSaved();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save"));
    } finally {
      setSaving(null);
    }
  };

  const addBlock = (type) => setBlocks([...d.blocks, { id: uid(), type, ...BLOCKS[type].make() }]);
  const move = (i, dir) => {
    const next = [...d.blocks];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setBlocks(next);
  };
  const p = palette(d.theme);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" title="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-extrabold text-slate-900">{existing ? `Edit: ${existing.title}` : "New broadcast"}</h2>
          <p className="text-xs text-slate-500">{isLive ? "This broadcast is live; saved changes reach users on their next refresh." : "Users see it on their next visit once published."}</p>
        </div>
        <button type="button" onClick={() => setMobilePreview(!mobilePreview)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 lg:hidden">
          {mobilePreview ? "Edit" : "Preview"}
        </button>
        {!isLive && (
          <button type="button" disabled={!!saving || !canWrite} onClick={() => save(false)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {saving === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
          </button>
        )}
        {canPublish && (
          <button type="button" disabled={!!saving} onClick={() => save(true)} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50">
            {saving === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isLive ? "Save changes" : d.starts_at && new Date(d.starts_at) > new Date() ? "Schedule" : "Publish"}
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className={`w-full space-y-4 overflow-y-auto p-4 lg:w-[52%] lg:max-w-[720px] ${mobilePreview ? "hidden lg:block" : ""}`}>
          <Section n={1} title="Type">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(KIND_META).map(([k, m]) => (
                <button key={k} type="button" onClick={() => set({ kind: k })} className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold ${d.kind === k ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <m.Icon className="h-5 w-5" />
                  {m.label}
                </button>
              ))}
            </div>
            {d.kind === "COMING_SOON" && (
              <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">
                Stays in every user's <b>Coming soon</b> list until you archive it. The expiry date below only ends the banner.
              </p>
            )}
          </Section>

          <Section n={2} title="Banner" hint="What users see first">
            <div>
              <span className={labelCls}>Headline</span>
              <input className={inputCls} maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Meet the new Billing scanner" />
            </div>
            <div>
              <span className={labelCls}>Overview (one or two lines)</span>
              <textarea rows={2} maxLength={300} className={areaCls} value={d.summary} onChange={(e) => set({ summary: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field def={["emoji", "Emoji", "emoji"]} value={d.emoji} onChange={(v) => set({ emoji: v })} />
              <div className="space-y-3">
                <div>
                  <span className={labelCls}>Banner button text</span>
                  <input className={inputCls} maxLength={30} value={d.banner.cta_label} onChange={(e) => set({ banner: { ...d.banner, cta_label: e.target.value } })} placeholder={d.kind === "COMING_SOON" ? "See what's coming" : "Explore"} />
                </div>
                {d.kind === "COMING_SOON" && (
                  <div>
                    <span className={labelCls}>When (label)</span>
                    <input className={inputCls} maxLength={40} value={d.eta_label} onChange={(e) => set({ eta_label: e.target.value })} placeholder="Launching in December" />
                  </div>
                )}
              </div>
            </div>
            <Field def={["image", "Banner picture (right side)", "image"]} value={d.banner.image} onChange={(v) => set({ banner: { ...d.banner, image: v } })} canWrite={canWrite} />
          </Section>

          <Section n={3} title="Look">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {Object.entries(THEMES).map(([k, t]) => (
                <button key={k} type="button" onClick={() => set({ theme: { ...d.theme, preset: k } })} className={`overflow-hidden rounded-xl border-2 text-[11px] font-bold ${d.theme.preset === k ? "border-slate-900" : "border-transparent"}`}>
                  <div className="h-10" style={heroStyle({ preset: k })} />
                  <div className="bg-white py-1 text-slate-600">{t.label}</div>
                </button>
              ))}
              <button type="button" onClick={() => set({ theme: { ...d.theme, preset: "custom", from: d.theme.from || p.from, to: d.theme.to || p.to } })} className={`overflow-hidden rounded-xl border-2 text-[11px] font-bold ${d.theme.preset === "custom" ? "border-slate-900" : "border-transparent"}`}>
                <div className="h-10 bg-[conic-gradient(at_center,_#f97316,_#ec4899,_#6366f1,_#10b981,_#f97316)]" />
                <div className="bg-white py-1 text-slate-600">Custom</div>
              </button>
            </div>
            {d.theme.preset === "custom" && (
              <div className="flex gap-3">
                {["from", "to"].map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input type="color" value={d.theme[k] || "#f97316"} onChange={(e) => set({ theme: { ...d.theme, [k]: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border border-slate-200" />
                    {k === "from" ? "Start" : "End"}
                  </label>
                ))}
              </div>
            )}
            <div>
              <span className={labelCls}>Texture</span>
              <div className="flex flex-wrap gap-1.5">
                {[["glow", "Glow"], ["dots", "Dots"], ["grid", "Grid"], ["stripes", "Stripes"], ["none", "Plain"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set({ theme: { ...d.theme, pattern: v } })} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${d.theme.pattern === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section n={4} title="Details" hint="Shown when users open it">
            <Field def={["cover", "Cover picture (optional; the banner picture is used otherwise)", "image"]} value={d.cover} onChange={(v) => set({ cover: v })} canWrite={canWrite} />
            <div className="space-y-2.5">
              {d.blocks.map((b, i) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  index={i}
                  count={d.blocks.length}
                  canWrite={canWrite}
                  onChange={(nb) => setBlocks(d.blocks.map((x, j) => (j === i ? nb : x)))}
                  onMove={(dir) => move(i, dir)}
                  onDuplicate={() => setBlocks([...d.blocks.slice(0, i + 1), { ...JSON.parse(JSON.stringify(b)), id: uid() }, ...d.blocks.slice(i + 1)])}
                  onRemove={() => setBlocks(d.blocks.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Add an element</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {Object.entries(BLOCKS).map(([type, def]) => (
                  <button key={type} type="button" onClick={() => addBlock(type)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:border-brand-300 hover:text-brand-700">
                    <span>{def.emoji}</span>
                    {def.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={labelCls}>Main button (bottom of details)</span>
                <input className={inputCls} maxLength={40} value={d.cta.label} onChange={(e) => set({ cta: { ...d.cta, label: e.target.value } })} placeholder="Try it now (optional)" />
              </div>
              {d.cta.label && <Field def={["link", "Opens", "link"]} value={d.cta.link} onChange={(v) => set({ cta: { ...d.cta, link: v } })} />}
            </div>
          </Section>

          <Section n={5} title="Audience">
            <AudienceField value={d.audience} onChange={(audience) => set({ audience })} />
          </Section>

          <Section n={6} title="Schedule & display">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={labelCls}>Starts</span>
                <input type="datetime-local" className={inputCls} value={toLocalInput(d.starts_at)} onChange={(e) => set({ starts_at: fromLocalInput(e.target.value) })} />
                <p className="mt-1 text-[11px] text-slate-400">Empty = as soon as it's published</p>
              </div>
              <div>
                <span className={labelCls}>{d.kind === "COMING_SOON" ? "Banner ends (optional)" : "Expires"}</span>
                <input type="datetime-local" className={inputCls} value={toLocalInput(d.expires_at)} onChange={(e) => set({ expires_at: fromLocalInput(e.target.value) })} />
                <div className="mt-1 flex flex-wrap gap-1">
                  {[3, 7, 14, 30].map((n) => (
                    <button key={n} type="button" onClick={() => set({ expires_at: new Date(new Date(d.starts_at || Date.now()).getTime() + n * 864e5).toISOString() })} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
                      {n} days
                    </button>
                  ))}
                  {d.kind === "COMING_SOON" && (
                    <button type="button" onClick={() => set({ expires_at: null })} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
                      No end
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <span className={labelCls}>How it appears</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["BANNER", "Banner", "Banner on top of the app + notifications"],
                  ["SPOTLIGHT", "Spotlight", "Also opens the details once on their next visit"],
                  ["SILENT", "Notifications only", "No banner; just in the bell"],
                ].map(([v, l, hint]) => (
                  <button key={v} type="button" onClick={() => set({ display: v })} className={`rounded-xl border p-2.5 text-left ${d.display === v ? "border-brand-300 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <p className={`text-xs font-extrabold ${d.display === v ? "text-brand-700" : "text-slate-700"}`}>{l}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={d.pinned} onChange={(e) => set({ pinned: e.target.checked })} className="h-4 w-4 rounded accent-orange-500" />
              <Pin className="h-3.5 w-3.5 text-slate-400" /> Pin: show before other banners
            </label>
          </Section>
          <div className="h-6" />
        </div>
        <div className={`min-w-0 flex-1 border-l border-slate-200 bg-white p-4 ${mobilePreview ? "block" : "hidden lg:block"}`}>
          <Preview draft={d} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details drawer: reach, viewers, actions

function Confirm({ open, title, body, action, danger, busy, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-sm text-slate-600">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-500 hover:bg-brand-600"}`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {action}
          </button>
        </div>
      </div>
    </div>
  );
}

const audienceText = (a, targeted) => {
  const who = a.type === "ALL" ? "Everyone" : a.type === "PHARMACIES" ? `${a.pharmacy_ids.length} pharmacy${a.pharmacy_ids.length === 1 ? "" : "ies"}` : `${a.user_ids.length} user${a.user_ids.length === 1 ? "" : "s"}`;
  return `${who}${a.admins_only ? " (admins only)" : ""}${targeted !== undefined ? ` · ${targeted} users` : ""}`;
};

function DetailDrawer({ id, onClose, onEdit, onChanged }) {
  const { user } = useAuth();
  const canPublish = ["SUPERADMIN", "ADMIN"].includes(user?.role);
  const [b, setB] = useState(null);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    AdminAPI.getBroadcast(id)
      .then((r) => setB(r.data))
      .catch((err) => toast.error(apiError(err, "Couldn't load")));
  }, [id]);
  useEffect(() => {
    setB(null);
    load();
  }, [load]);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      const r = await fn();
      toast.success(done);
      setConfirm(null);
      onChanged();
      return r;
    } catch (err) {
      toast.error(apiError(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const actions = {
    publish: { title: "Publish this broadcast?", body: "It goes out to its audience right away (or at its start time).", action: "Publish", fn: () => AdminAPI.publishBroadcast(id), done: "Published", after: load },
    archive: { title: "Archive this broadcast?", body: "Users stop seeing it everywhere, including Coming soon. Its reach stats are kept.", action: "Archive", danger: true, fn: () => AdminAPI.archiveBroadcast(id), done: "Archived", after: load },
    delete: { title: "Delete this broadcast?", body: "The broadcast and its reach stats are removed for good.", action: "Delete", danger: true, fn: () => AdminAPI.deleteBroadcast(id), done: "Deleted", after: onClose },
  };

  const s = b?.stats;
  const tiles = s && [
    ["Targeted", s.targeted, Users, "text-slate-700"],
    ["Seen", s.seen, Eye, "text-emerald-600", pct(s.seen, s.targeted)],
    ["Opened", s.opened, Megaphone, "text-sky-600", pct(s.opened, s.seen)],
    ["Clicked", s.clicked, MousePointerClick, "text-violet-600", pct(s.clicked, s.opened)],
    ["Dismissed", s.dismissed, X, "text-amber-600"],
    ["Cleared", s.cleared, Trash2, "text-rose-600"],
  ];

  return (
    <BottomDrawer isOpen onClose={onClose} title={b?.title || "Broadcast"} subtitle={b ? `${KIND_META[b.kind]?.label} · ${b.state}` : ""} maxWidth="max-w-3xl">
      {!b ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="mx-auto max-w-sm">
            <BroadcastBanner b={b} assetUrl={broadcastAssetUrl} onExplore={() => setPreview(true)} />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {tiles.map(([label, v, Icon, color, p]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Icon className="h-3 w-3" /> {label}
                </div>
                <div className={`mt-0.5 text-xl font-black ${color}`}>{v.toLocaleString("en-IN")}</div>
                {p !== undefined && <div className="text-[10px] font-semibold text-slate-400">{p}%</div>}
              </div>
            ))}
          </div>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
            <p><b>Audience:</b> {audienceText(b.audience, s.targeted)}</p>
            <p><b>Shows as:</b> {b.display === "SPOTLIGHT" ? "Banner + spotlight" : b.display === "SILENT" ? "Notifications only" : "Banner"}{b.pinned ? " · pinned" : ""}</p>
            <p><b>Starts:</b> {fmt(b.starts_at)}</p>
            <p><b>{b.kind === "COMING_SOON" ? "Banner ends" : "Expires"}:</b> {b.expires_at ? fmt(b.expires_at) : "No end"}</p>
            <p><b>Created by:</b> {b.created_by?.name || b.created_by?.email || "—"}</p>
            <p><b>Last change:</b> {fmt(b.updated_at)} by {b.updated_by?.name || b.updated_by?.email || "—"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPreview(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Eye className="h-4 w-4" /> Preview details
            </button>
            {(b.status === "DRAFT" || canPublish) && (
              <button type="button" onClick={() => onEdit(b)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            <button type="button" onClick={() => run(() => AdminAPI.duplicateBroadcast(id), "Copied to a new draft")} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Copy className="h-4 w-4" /> Duplicate
            </button>
            {canPublish && b.status !== "PUBLISHED" && (
              <button type="button" onClick={() => setConfirm("publish")} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-extrabold text-white hover:bg-brand-600">
                <Send className="h-4 w-4" /> Publish
              </button>
            )}
            {canPublish && b.status === "PUBLISHED" && (
              <button type="button" onClick={() => setConfirm("archive")} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">
                <Archive className="h-4 w-4" /> Archive
              </button>
            )}
            {canPublish && b.status !== "PUBLISHED" && (
              <button type="button" onClick={() => setConfirm("delete")} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Recently seen by</h4>
            {b.viewers.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">No one has seen it yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Seen</th>
                      <th className="px-3 py-2">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {b.viewers.map((v) => (
                      <tr key={v.user_id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-slate-800">{v.name}</p>
                          <p className="text-[11px] text-slate-500">{[v.email, v.pharmacy].filter(Boolean).join(" · ")}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{fmt(v.seen_at)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {v.opened_at && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">Opened</span>}
                            {v.clicked_at && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Clicked</span>}
                            {v.cleared_at && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Cleared</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {preview && b && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setPreview(false)} />
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl shadow-2xl">
            <button type="button" onClick={() => setPreview(false)} className="absolute right-3 top-3 z-30 rounded-full bg-white/20 p-1.5 text-white backdrop-blur">
              <X className="h-4 w-4" />
            </button>
            <BroadcastDetail b={b} assetUrl={broadcastAssetUrl} onLink={(l) => toast.message(`Opens ${l}`)} />
          </div>
        </div>
      )}
      {confirm && (
        <Confirm
          open
          {...actions[confirm]}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const a = actions[confirm];
            const ok = await run(a.fn, a.done);
            if (ok) a.after();
          }}
        />
      )}
    </BottomDrawer>
  );
}

// ---------------------------------------------------------------------------
// Page

export default function BroadcastsPage({ activeEnv }) {
  const { user } = useAuth();
  const canWrite = ["SUPERADMIN", "ADMIN", "OPERATOR"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null); // { initial, existing }
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    AdminAPI.getBroadcasts({ kind: kind || undefined, q: q || undefined })
      .then((r) => {
        setRows(r.data.rows);
        setCounts(r.data.counts || {});
      })
      .catch((err) => toast.error(apiError(err, "Couldn't load broadcasts")))
      .finally(() => setLoading(false));
  }, [kind, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, activeEnv, q]);

  const shown = useMemo(() => (state ? rows.filter((r) => r.state === state) : rows), [rows, state]);

  const edit = async (b) => {
    try {
      const full = b.blocks ? b : (await AdminAPI.getBroadcast(b.id)).data;
      const pick = (({ kind, title, summary, emoji, theme, banner, cover, blocks, cta, display, pinned, eta_label, audience, starts_at, expires_at }) => ({ kind, title, summary, emoji, theme, banner, cover, blocks, cta, display, pinned, eta_label, audience, starts_at, expires_at }))(full);
      setOpenId(null);
      setEditing({ existing: full, initial: { ...base(), ...pick, theme: { ...base().theme, ...pick.theme }, banner: { ...base().banner, ...pick.banner }, cta: { ...base().cta, ...pick.cta }, blocks: (pick.blocks || []).map((x) => ({ id: x.id || uid(), ...x })) } });
    } catch (err) {
      toast.error(apiError(err, "Couldn't open it"));
    }
  };

  return (
    <>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <Megaphone className="h-5 w-5 text-brand-500" /> Broadcasts
          </h1>
          <p className="text-sm text-slate-500">Banners, offers and coming-soon features for app users ({activeEnv === "prod" ? "Production" : "Dev"}).</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {canWrite && (
            <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-brand-600">
              <Plus className="h-4 w-4" /> New broadcast
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {["", ...STATES].map((s) => (
            <button key={s || "all"} type="button" onClick={() => setState(s)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${state === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {s ? s[0] + s.slice(1).toLowerCase() : "All"} {s ? `(${counts[s] || 0})` : `(${rows.length})`}
            </button>
          ))}
        </div>
        <select className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(KIND_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className={`${inputCls} pl-9`} placeholder="Search title or overview" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-bold text-slate-700">No broadcasts here yet</p>
          <p className="text-xs text-slate-500">Create one to show a banner to your users.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((b) => (
            <button key={b.id} type="button" onClick={() => setOpenId(b.id)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md">
              <div className="h-1.5" style={heroStyle(b.theme)} />
              <div className="flex gap-3 p-4">
                <BroadcastThumb b={b} assetUrl={broadcastAssetUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATE_STYLE[b.state]}`}>{b.state}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{KIND_META[b.kind]?.short}</span>
                    {b.pinned && <Pin className="h-3 w-3 text-slate-400" />}
                  </div>
                  <p className="mt-1 truncate text-sm font-extrabold text-slate-900">{b.title}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{b.summary}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {audienceText(b.audience)} · {b.kind === "COMING_SOON" && !b.expires_at ? "until archived" : `ends ${fmt(b.expires_at)}`}
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-100 px-4 py-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" /> Seen by {b.stats.seen} of {b.stats.targeted}
                  </span>
                  <span>
                    {b.stats.opened} opened · {b.stats.clicked} clicked
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${pct(b.stats.seen, b.stats.targeted)}%`, ...heroStyle(b.theme) }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>

      <BottomDrawer isOpen={picking} onClose={() => setPicking(false)} title="New broadcast" subtitle="Pick a starting point; you can change everything." maxWidth="max-w-2xl">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const sample = t.make();
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPicking(false);
                  setEditing({ initial: t.make(), existing: null });
                }}
                className="overflow-hidden rounded-2xl border border-slate-200 text-left hover:border-brand-300 hover:shadow-md"
              >
                <div className="flex h-16 items-center px-4 text-3xl" style={heroStyle(sample.theme)}>
                  {t.emoji}
                </div>
                <div className="p-3">
                  <p className="text-sm font-extrabold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.note}</p>
                </div>
              </button>
            );
          })}
        </div>
      </BottomDrawer>

      {openId && <DetailDrawer id={openId} onClose={() => setOpenId(null)} onEdit={edit} onChanged={load} />}
      {editing && (
        <Composer
          initial={editing.initial}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
