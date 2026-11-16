// Builds the React app for the desktop package: same-origin API, online-only
// buttons hidden, and no scripts or fonts fetched from the internet at startup.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const frontend = path.join(__dirname, "..", "..", "frontend");
const out = path.join(__dirname, "..", "web");

fs.rmSync(out, { recursive: true, force: true });
execSync("npx craco build", {
  cwd: frontend,
  stdio: "inherit",
  env: { ...process.env, CI: "false", REACT_APP_BACKEND_URL: "", REACT_APP_DESKTOP: "true", BUILD_PATH: out, GENERATE_SOURCEMAP: "false" },
});

const file = path.join(out, "index.html");
const before = fs.readFileSync(file, "utf8");
const scripts = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const html = before
  // Analytics, payments, and the helper for the old visual editor
  .replace(scripts, (tag) => (/posthog|cashfree|emergent\.sh|cdn\.tailwindcss/i.test(tag) ? "" : tag))
  // Google Fonts: the system font stands in when offline, so don't wait on it
  .replace(/<link\b[^>]*(fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/gi, "");

const left = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
if (left.length) throw new Error(`index.html still loads from the internet: ${left.join(", ")}`);
fs.writeFileSync(file, html);

// The fonts ship inside the app, so it looks the same with no internet
const fontDir = path.join(out, "fonts");
fs.mkdirSync(fontDir, { recursive: true });
const SUBSET = /-(latin|latin-ext)-wght-normal\.woff2$/;
let faces = "";
for (const [pkg, family] of [["inter", "Inter"], ["manrope", "Manrope"], ["jetbrains-mono", "JetBrains Mono"]]) {
  const dir = path.join(__dirname, "..", "node_modules", "@fontsource-variable", pkg);
  const css = fs.readFileSync(path.join(dir, "index.css"), "utf8");
  for (const face of css.match(/@font-face\s*{[^}]*}/g)) {
    const m = face.match(/url\(\.\/files\/([^)]+)\)/);
    if (!m || !SUBSET.test(m[1])) continue;
    fs.copyFileSync(path.join(dir, "files", m[1]), path.join(fontDir, m[1]));
    faces += face.replace(/font-family:[^;]+;/, `font-family: '${family}';`).replace(/url\(\.\/files\//, "url(/fonts/") + "\n";
  }
}
const cssDir = path.join(out, "static", "css");
for (const name of fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"))) {
  const cssFile = path.join(cssDir, name);
  const css = fs.readFileSync(cssFile, "utf8");
  fs.writeFileSync(cssFile, css.replace(/@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\);?/g, ""));
}
fs.writeFileSync(path.join(fontDir, "fonts.css"), faces);
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("</head>", '<link rel="stylesheet" href="/fonts/fonts.css"></head>'));
fs.rmSync(path.join(out, ".DS_Store"), { force: true });
console.log("Desktop web build ready:", out);
