// =============================================================
//  v4 — Layer 8: Cache de consultas (hash + sessionId + rango)
// =============================================================
"use strict";

const crypto = require("crypto");

class QueryCache {
  constructor({ ttlMs = 60_000, max = 500 } = {}) {
    this.ttlMs = ttlMs; this.max = max;
    this.store = new Map(); // key -> { data, expiresAt }
  }
  _key({ sql, params, sessionId, dateRange }) {
    const payload = JSON.stringify({ sql, params, sessionId: sessionId||null, dateRange: dateRange||null });
    return crypto.createHash("sha1").update(payload).digest("hex");
  }
  get(input) {
    const k = this._key(input);
    const v = this.store.get(k);
    if (!v) return null;
    if (v.expiresAt < Date.now()) { this.store.delete(k); return null; }
    return v.data;
  }
  set(input, data) {
    const k = this._key(input);
    if (this.store.size >= this.max) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
    this.store.set(k, { data, expiresAt: Date.now() + this.ttlMs });
    return k;
  }
  clear() { this.store.clear(); }
  size() { return this.store.size; }
}

module.exports = { QueryCache };
