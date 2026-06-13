// =============================================================
//  v5 — Layer 13: Performance optimization
//  Embedding cache, lazy evaluation, fast hash.
// =============================================================
"use strict";

const crypto = require("crypto");

class EmbeddingCache {
  constructor(opts = {}) {
    this.max = opts.max ?? 1000;
    this.store = new Map();
  }
  _key(text) { return crypto.createHash("sha1").update(String(text)).digest("hex"); }
  get(text) {
    const k = this._key(text);
    const v = this.store.get(k);
    if (!v) return null;
    // LRU touch
    this.store.delete(k); this.store.set(k, v);
    return v;
  }
  set(text, embedding) {
    const k = this._key(text);
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(k, embedding);
  }
  size() { return this.store.size; }
  clear() { this.store.clear(); }
}

function lazy(fn) {
  let computed = false; let value;
  return () => {
    if (!computed) { value = fn(); computed = true; }
    return value;
  };
}

function fastHash(obj) {
  return crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

module.exports = { EmbeddingCache, lazy, fastHash };
