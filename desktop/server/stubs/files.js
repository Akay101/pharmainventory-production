// Local replacement for cloud file storage: files sit in the app's data folder
// and are served from /files, behind the same device check as the API.
const fs = require("fs");
const path = require("path");

let root = null;
const setRoot = (dir) => {
  root = dir;
  fs.mkdirSync(root, { recursive: true });
};
const getRoot = () => root;

// Keys come from the routes and may include the original file name
function resolve(key) {
  const full = path.resolve(root, String(key));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Invalid file key");
  return full;
}

const write = async (key, body) => {
  const full = resolve(key);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, body);
};
const read = (key) => fs.promises.readFile(resolve(key));
const remove = (key) => fs.promises.rm(resolve(key), { force: true });
const removePrefix = (prefix) => fs.promises.rm(resolve(prefix), { recursive: true, force: true });
const urlFor = (key) => `/files/${String(key).split("/").map(encodeURIComponent).join("/")}`;

module.exports = { setRoot, getRoot, write, read, remove, removePrefix, urlFor };
