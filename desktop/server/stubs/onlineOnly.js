// Stands in for a library that only online features use. Loading and configuring
// it is harmless; actually calling it answers "needs internet".
const fail = () => {
  throw Object.assign(new Error("This feature needs internet."), { status: 503, onlineOnly: true });
};

const stand = new Proxy(function () {}, {
  get: (target, key) => {
    if (key === "__esModule") return false;
    if (key === "then") return undefined;
    if (key === Symbol.toPrimitive) return () => "";
    return stand;
  },
  set: () => true,
  apply: fail,
  construct: () => stand,
});

module.exports = stand;
