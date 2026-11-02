// Uploads the built installers to the public download folder on Cloudflare R2, using
// the credentials in backend-node/.env. Run only after `npm run dist`, and with the
// production API already live, because a published app signs in against it.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const backend = path.join(__dirname, "..", "..", "backend-node");
require(path.join(backend, "node_modules", "dotenv")).config({ path: path.join(backend, ".env") });
const { S3Client, PutObjectCommand } = require(path.join(backend, "node_modules", "@aws-sdk", "client-s3"));

const { version } = require("../package.json");
const dist = path.join(__dirname, "..", "dist");
const FILES = {
  [`DavaDesk-${version}-Windows-Setup.exe`]: "DavaDesk-Windows-Setup.exe",
  [`DavaDesk-${version}-mac-arm64.dmg`]: "DavaDesk-Mac-Apple-Silicon.dmg",
  [`DavaDesk-${version}-mac-x64.dmg`]: "DavaDesk-Mac-Intel.dmg",
};

(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app-config.json"), "utf8"));
  if (!config.hardened) throw new Error("dist was built with a test configuration. Run npm run dist first.");
  const client = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    region: "auto",
  });
  for (const [from, to] of Object.entries(FILES)) {
    const body = fs.readFileSync(path.join(dist, from));
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `desktop/latest/${to}`,
        Body: body,
        ContentType: "application/octet-stream",
        ContentDisposition: `attachment; filename="${to}"`,
        CacheControl: "public, max-age=300",
      })
    );
    console.log(`Uploaded ${to} (${Math.round(body.length / 1048576)} MB) sha256 ${crypto.createHash("sha256").update(body).digest("hex")}`);
  }
  console.log(`Set REACT_APP_DESKTOP_DOWNLOAD_URL=${String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "")}/desktop/latest`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
