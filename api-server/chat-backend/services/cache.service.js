// ── Cache LRU simple en memoria ────────────────────────────────
// TTL default: 5 minutos. Máximo 200 entradas.
const TTL  = 5 * 60 * 1000;
const MAX  = 200;
const store = new Map();
let hits = 0, misses = 0;

function get(key) {
  const entry = store.get(key);
  if (!entry) { misses++; return null; }
  if (Date.now() - entry.ts > TTL) { store.delete(key); misses++; return null; }
  hits++;
  // LRU: mover al final
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

function set(key, value) {
  if (store.size >= MAX) {
    // Eliminar entrada más antigua
    store.delete(store.keys().next().value);
  }
  store.set(key, { value, ts: Date.now() });
}

function del(key) { store.delete(key); }

function flush() { store.clear(); hits = 0; misses = 0; }

function stats() {
  return {
    size:    store.size,
    hits,
    misses,
    hit_rate: hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) + "%" : "0%",
  };
}

module.exports = { get, set, del, flush, stats };
