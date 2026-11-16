const files = require("./files");

const uploadToR2 = async (key, body) => {
  await files.write(key, body);
  return files.urlFor(key);
};

module.exports = {
  uploadToR2,
  downloadFromR2: files.read,
  deleteFromR2: files.remove,
  deletePrefixFromR2: files.removePrefix,
  R2_PUBLIC_URL: "/files",
};
