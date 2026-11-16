const files = require("./files");

const inPrivate = (key) => `private/${key}`;

module.exports = {
  putPrivate: (key, body) => files.write(inPrivate(key), body),
  signedUrl: async (key) => files.urlFor(inPrivate(key)),
  remove: (key) => files.remove(inPrivate(key)),
  removePrefix: (prefix) => files.removePrefix(inPrivate(prefix)),
};
