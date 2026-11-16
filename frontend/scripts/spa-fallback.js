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

const html = fs.readFileSync(index);
let made = 0;
for (const r of routes) {
  const dir = path.join(build, r);
  // never overwrite real files that ship in public/ (assets, intro, guide-audio)
  if (fs.existsSync(path.join(dir, "index.html")) || fs.existsSync(dir + ".html")) continue;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  made++;
}
console.log(`spa-fallback: ${made} route copies of index.html (${[...routes].join(", ")})`);
