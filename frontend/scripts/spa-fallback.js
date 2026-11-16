// After `craco build`: give every app route its own copy of index.html, so a
// direct link or a refresh on /billing works even when the host has no
// "everything goes to index.html" rewrite. The host (Amplify/S3) redirects
// /billing to /billing/ and serves billing/index.html; the app then routes
// as usual. Routes are read from src/App.js, so new pages are covered too.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const build = path.resolve(root, process.env.BUILD_PATH || "build");
const index = path.join(build, "index.html");
if (!fs.existsSync(index)) {
  console.error("spa-fallback: no build/index.html, skipping");
  process.exit(0);
}

const app = fs.readFileSync(path.join(root, "src", "App.js"), "utf8");
const routes = new Set();
for (const m of app.matchAll(/path="([^"*:]+)"/g)) {
  const p = m[1].replace(/^\/+|\/+$/g, "");
  if (p) routes.add(p);
}

// Search: only these public pages may be indexed. Their copies carry their own
// title, description and canonical in the raw HTML, so crawlers see them
// without running the app. Every other copy, and the root, is noindex.
const ORIGIN = "https://store.davadesk.in";
const SEO = {
  login: {
    title: "Login to DavaDesk – Pharmacy Billing & Management Software",
    description:
      "Sign in to DavaDesk, the pharmacy billing and management software for Indian chemists. New pharmacy? Register and start a 7-day free trial.",
  },
  register: {
    title: "Register Your Pharmacy – 7-Day Free Trial | DavaDesk",
    description:
      "Create your DavaDesk account in minutes. Try GST billing, AI purchase bill scanning, batch-wise stock and expiry tracking free for 7 days, then ₹3,999 a year plus GST.",
  },
  download: {
    title: "Download DavaDesk for Windows and Mac – Offline Pharmacy Billing",
    description:
      "Get the DavaDesk desktop app for Windows and Mac. Keep billing when the internet goes down; every bill syncs to the cloud when you are back online.",
  },
};

const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function headFor(base, route) {
  const seo = SEO[route];
  if (!seo) return base.replace("</head>", '<meta name="robots" content="noindex, follow"/></head>');
  const url = `${ORIGIN}/${route}/`;
  const tags = [
    `<link rel="canonical" href="${url}"/>`,
    '<meta name="robots" content="index, follow, max-image-preview:large"/>',
    '<meta property="og:type" content="website"/>',
    '<meta property="og:site_name" content="DavaDesk"/>',
    `<meta property="og:url" content="${url}"/>`,
    `<meta property="og:title" content="${esc(seo.title)}"/>`,
    `<meta property="og:description" content="${esc(seo.description)}"/>`,
    '<meta property="og:image" content="https://davadesk.in/og-image.png"/>',
    '<meta name="twitter:card" content="summary_large_image"/>',
  ].join("");
  return base
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(seo.description)}"/>`)
    .replace("</head>", `${tags}</head>`);
}

const base = fs.readFileSync(index, "utf8");
let made = 0;
for (const r of routes) {
  const dir = path.join(build, r);
  // never overwrite real files that ship in public/ (assets, intro, guide-audio)
  if (fs.existsSync(path.join(dir, "index.html")) || fs.existsSync(dir + ".html")) continue;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), headFor(base, r));
  made++;
}
// The root is the signed-in app itself: keep it out of search results
fs.writeFileSync(index, headFor(base, ""));
console.log(`spa-fallback: indexable ${Object.keys(SEO).join(", ")}; ${made} route copies of index.html (${[...routes].join(", ")})`);
