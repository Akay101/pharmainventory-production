// Where the app connects and which key signs its licences. A shipped build is fixed
// to its packaged file; only a test build may be pointed elsewhere.
const packaged = require("../app-config.json");

module.exports = !packaged.hardened && process.env.DAVADESK_TEST_CONFIG ? { ...packaged, ...JSON.parse(process.env.DAVADESK_TEST_CONFIG) } : packaged;
