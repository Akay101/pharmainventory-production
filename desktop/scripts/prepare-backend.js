// Copies the backend's code into desktop/backend for packaging. Only the listed
// folders are copied, so .env files and other secrets can never ship in the app.
const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "..", "backend-node");
const target = path.join(__dirname, "..", "backend");
const FOLDERS = ["routes", "services", "utils", "middleware", "models", "assets"];

fs.rmSync(target, { recursive: true, force: true });
for (const folder of FOLDERS) {
  fs.cpSync(path.join(source, folder), path.join(target, folder), {
    recursive: true,
    filter: (file) => !path.basename(file).startsWith(".env"),
  });
}
console.log(`Copied backend (${FOLDERS.join(", ")}) to ${target}`);
