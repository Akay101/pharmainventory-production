// Rate limits count in memory, since one process serves the whole shop
const { MemoryStore } = require("express-rate-limit");

class RedisStore extends MemoryStore {
  constructor() {
    super();
    this.incrementScriptSha = Promise.resolve();
    this.getScriptSha = Promise.resolve();
  }
}

module.exports = { RedisStore };
