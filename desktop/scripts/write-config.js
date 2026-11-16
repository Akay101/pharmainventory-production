// Bakes the connection settings into the package. A real release uses
// config/production.json. Set DAVADESK_BUILD_CONFIG to build a test copy.
const fs = require("fs");
const path = require("path");

const source = process.env.DAVADESK_BUILD_CONFIG || path.join(__dirname, "..", "config", "production.json");
fs.copyFileSync(source, path.join(__dirname, "..", "app-config.json"));
console.log("Config:", source);
