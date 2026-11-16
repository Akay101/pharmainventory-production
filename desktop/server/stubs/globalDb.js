// The global catalogues come from the encrypted offline copy.
let catalog = null;
const setCatalog = (c) => {
  catalog = c;
};

const empty = { kind: null, find: () => ({ sort() { return this; }, hint() { return this; }, limit() { return this; }, skip() { return this; }, maxTimeMS() { return this; }, project() { return this; }, toArray: async () => [], next: async () => null }), findOne: async () => null, estimatedDocumentCount: async () => 0, countDocuments: async () => 0, updateOne: async () => ({ matchedCount: 0 }) };
const collectionOf = (name) => (catalog ? catalog.collection(name) : empty);
const getGlobalDb = () => ({ collection: collectionOf });

const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

module.exports = {
  setCatalog,
  getGlobalDb,
  getGlobalMedicinesCollection: async () => collectionOf("global_medicines"),
  getGlobalDoctorsCollection: async () => collectionOf("global_doctors"),
  getGlobalDistributorsCollection: async () => collectionOf("global_distributors"),
  isGlobalConnected: async () => !!catalog,
  isMedicineDbAvailable: async () => !!catalog && catalog.count("medicines") > 0,
  getCached: (key) => {
    const item = cache.get(key);
    return item && item.expires > Date.now() ? item.data : null;
  },
  setCached: (key, data) => {
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    cache.set(key, { data, expires: Date.now() + CACHE_TTL });
  },
  clearCachePattern: () => cache.clear(),
  initBackgroundGlobalClient: () => null,
  onGlobalConnect: () => {},
};
