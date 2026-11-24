const store = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 200;       // stops memory growing forever

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > TTL_MS) { store.delete(key); return null; }
  return entry.value;
}

function set(key, value) {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
  store.set(key, { value, time: Date.now() });
}

module.exports = { get, set };
