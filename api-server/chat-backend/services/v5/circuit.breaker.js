// =============================================================
//  v5 — Layer 9: Circuit Breaker por agente/módulo
// =============================================================
"use strict";

class CircuitBreaker {
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? 0.5;   // 50% errores
    this.minSamples = opts.minSamples ?? 10;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
    this.state = new Map(); // key -> {total, errors, openedAt}
  }

  _bucket(key) {
    if (!this.state.has(key)) this.state.set(key, { total: 0, errors: 0, openedAt: 0 });
    return this.state.get(key);
  }

  record(key, ok) {
    const b = this._bucket(key);
    b.total++;
    if (!ok) b.errors++;
    if (b.total >= this.minSamples && (b.errors / b.total) > this.threshold) {
      if (!b.openedAt) b.openedAt = Date.now();
    }
  }

  isOpen(key) {
    const b = this._bucket(key);
    if (!b.openedAt) return false;
    if (Date.now() - b.openedAt > this.cooldownMs) {
      // half-open: reset contadores
      b.total = 0; b.errors = 0; b.openedAt = 0;
      return false;
    }
    return true;
  }

  reset(key) {
    if (key) this.state.delete(key);
    else this.state.clear();
  }

  snapshot() {
    const out = {};
    for (const [k, v] of this.state.entries()) {
      out[k] = { ...v, open: this.isOpen(k), rate: v.total ? +(v.errors / v.total).toFixed(3) : 0 };
    }
    return out;
  }
}

module.exports = { CircuitBreaker };
