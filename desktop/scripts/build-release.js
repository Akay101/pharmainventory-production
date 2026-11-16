// Builds the installers for one channel. Usage: build-release.js <dev|production> <mac|win|all>
// RELEASE_VERSION sets the version; GitHub Actions gives each build a new number.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const [channel = "dev", platform = "all"] = process.argv.slice(2);
const configFile = path.join("config", `${channel}.json`);
if (!fs.existsSync(path.join(root, configFile))) throw new Error(`No configuration for channel "${channel}"`);
const config = JSON.parse(fs.readFileSync(path.join(root, configFile), "utf8"));

const pkg = require("../package.json");
const version = process.env.RELEASE_VERSION || pkg.version;
const output = `dist-${channel}`;
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

run("node scripts/write-config.js", { DAVADESK_BUILD_CONFIG: configFile });
run("node scripts/prepare-backend.js");
run("node scripts/prepare-web.js");

const common = `--publish never -c.directories.output=${output} -c.extraMetadata.version=${version} -c.publish.provider=generic -c.publish.url=${config.cloudUrl}/api/desktop/releases`;
try {
  if (platform === "mac" || platform === "all") run(`npx electron-builder --mac --x64 --arm64 ${common}`);
  if (platform === "win" || platform === "all") {
    // Only a Windows machine can write the icon and details into the .exe
    const onWindows = process.platform === "win32";
    run(`npx electron-builder --win --x64 ${common}${onWindows ? " -c.win.signAndEditExecutable=true" : ""}`);
  }
} finally {
  // A plain `npm run dist` must never pick up this channel by accident
  run("node scripts/write-config.js");
}
console.log(`Built ${version} for ${channel} in ${output}`);
