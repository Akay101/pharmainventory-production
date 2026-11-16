// The backend reaches MongoDB only through `mongoose.connection.db`, plus
// sessions and ObjectId. Here those lead to the local store.
const { EventEmitter } = require("events");
const { newObjectId, Session } = require("../docdb");

const connection = Object.assign(new EventEmitter(), {
  db: null,
  name: "davadesk-local",
  readyState: 1,
  getClient: () => ({ db: () => connection.db }),
  asPromise: async () => connection,
  close: async () => {},
});

class ObjectId {
  constructor(id) {
    return id === undefined ? newObjectId() : String(id);
  }
  static isValid(id) {
    return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
  }
}

class Schema {
  constructor() {
    this.Types = Schema.Types;
  }
  index() {
    return this;
  }
  pre() {
    return this;
  }
}
Schema.Types = { Mixed: Object, ObjectId };

// Only the AI scan queue uses a model, and scanning needs the internet
const model = () => require("./onlineOnly");

module.exports = {
  connection,
  Schema,
  model,
  Types: { ObjectId },
  connect: async () => connection,
  startSession: async () => new Session(connection.db),
  mongo: {
    MongoClient: class {
      constructor() {
        throw new Error("No remote database in the desktop app");
      }
    },
  },
};
