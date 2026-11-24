// tiny in-memory cache with expiry
const store = new Map();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;

function get(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { store.delete(key); return null; }
  return hit.value;
}
function set(key, value) {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
  store.set(key, { value, expires: Date.now() + TTL_MS });
}
module.exports = { get, set };
