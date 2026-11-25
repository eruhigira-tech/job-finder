'use strict';
// Tiny in-memory TTL cache with a size cap (oldest entry is evicted first).
// Each web server keeps its own cache, so behind a load balancer you will see
// one MISS per server before the HITs start.

const TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 200; // stops memory growing forever

const store = new Map();
let hits = 0;
let misses = 0;

function get(key) {
  const entry = store.get(key);
  if (!entry) { misses++; return null; }
  if (Date.now() - entry.time > TTL_MS) { store.delete(key); misses++; return null; }
  hits++;
  return entry.value;
}

function set(key, value) {
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
  store.set(key, { value, time: Date.now() });
}

function clear() { store.clear(); hits = 0; misses = 0; }
function stats() { return { size: store.size, hits, misses, ttlSeconds: TTL_MS / 1000 }; }

module.exports = { get, set, clear, stats };
