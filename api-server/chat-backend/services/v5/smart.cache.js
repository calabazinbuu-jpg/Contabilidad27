// =============================================================
//  v5 — Layer 8: Smart Cache (por intent + entidad + rango fechas)
// =============================================================
"use strict";

function dateKey(r) {
  if (!r) return "_";
  const f = r.from || r.start || "";
  const t = r.to   || r.end   || "";
  return `${f}|${t}`;
}

class SmartCache {
  constructor(opts = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60_000;
    this.max   = opts.max   ?? 500;
    this.store = new Map();
  }
  _key({ intent, table, entities, dateRange, sessionId, scope }) {
    const ent = Array.isArray(entities) ? entities.slice().sort().join(",") : "";
    const sc  = scope || "global";
    return [intent || "_", table || "_", ent, dateKey(dateRange), sc, sessionId || "_"].join("::");
  }
  get(meta) {
    const k = this._key(meta);
    const v = this.store.get(k);
    if (!v) return null;
    if (Date.now() > v.exp) { this.store.delete(k); return null; }
    v.hits++;
    return v.data;
  }
  set(meta, data, ttlMs) {
    if (this.store.size >= this.max) {
      const oldest = [...this.store.entries()].sort((a, b) => a[1].exp - b[1].exp)[0];
      if (oldest) this.store.delete(oldest[0]);
    }
    const k = this._key(meta);
    this.store.set(k, { data, exp: Date.now() + (ttlMs ?? this.ttlMs), hits: 0 });
  }
  invalidate(filterFn) {
    for (const k of [...this.store.keys()]) {
      const [intent, table] = k.split("::");
      if (filterFn({ key: k, intent, table })) this.store.delete(k);
    }
  }
  stats() {
    const items = [...this.store.values()];
    return {
      size: this.store.size,
      hits: items.reduce((s, x) => s + x.hits, 0),
    };
  }
  clear() { this.store.clear(); }
}

module.exports = { SmartCache };
