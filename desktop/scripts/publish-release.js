// Uploads a build to the release folder in the private S3 bucket. The API hands out
// short links to these files. Usage: publish-release.js <folder> <dev|production> <version>
// Reads the bucket and keys from the environment. latest.json goes last, so apps only
// hear about a version once all of its files are in place.
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const [folder, channel, version] = process.argv.slice(2);
if (!folder || !channel || !version) throw new Error("Usage: publish-release.js <folder> <channel> <version>");
const bucket = process.env.AWS_PRIVATE_S3_BUCKET || process.env.AWS_S3_BUCKET;
if (!bucket) throw new Error("No S3 bucket configured");
const release = JSON.parse(fs.readFileSync(path.join(folder, "release.json"), "utf8"));

const client = new S3Client({ region: process.env.AWS_REGION || "ap-south-1", credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
const put = (name, body) => client.send(new PutObjectCommand({ Bucket: bucket, Key: `desktop/${channel}/${name}`, Body: body, ServerSideEncryption: "AES256", ContentType: name.endsWith(".json") ? "application/json" : name.endsWith(".yml") ? "text/yaml" : "application/octet-stream" }));

// Stable names for the download page
const ALIASES = [
  [/-mac-x64\.dmg$/, "DavaDesk-Mac-Intel.dmg"],
  [/-mac-arm64\.dmg$/, "DavaDesk-Mac-Apple-Silicon.dmg"],
  [/-Windows-Setup\.exe$/, "DavaDesk-Windows-Setup.exe"],
];

(async () => {
  const names = fs.readdirSync(folder).filter((n) => /\.(dmg|zip|exe|blockmap)$/.test(n));
  if (!ALIASES.every(([pattern]) => names.some((n) => pattern.test(n)))) throw new Error(`Installers missing from ${folder}: ${names.join(", ")}`);
  for (const name of names) {
    const body = fs.readFileSync(path.join(folder, name));
    await put(name, body);
    const alias = ALIASES.find(([pattern]) => pattern.test(name));
    if (alias) await put(alias[1], body);
    console.log(`Uploaded ${name} (${Math.round(body.length / 1048576)} MB)`);
  }
  for (const name of fs.readdirSync(folder).filter((n) => /^latest.*\.yml$/.test(n))) await put(name, fs.readFileSync(path.join(folder, name)));
  await put("latest.json", JSON.stringify({ version, min_version: release.min_version, published_at: new Date().toISOString(), commit: process.env.RELEASE_COMMIT || null }));
  console.log(`Published ${version} to desktop/${channel}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
