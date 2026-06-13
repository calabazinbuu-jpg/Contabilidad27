// =============================================================
//  v5 — Layer 12: Observabilidad completa
//  Tracing por request, performance por módulo, error heatmap.
// =============================================================
"use strict";

class Tracer {
  constructor() { this.traces = []; this.max = 500; }
  start(requestId, input) {
    const t = {
      id: requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      input,
      t0: Date.now(),
      spans: [],
      errors: [],
    };
    return {
      trace: t,
      span: (name) => {
        const s = { name, t0: Date.now(), t1: 0, ms: 0 };
        t.spans.push(s);
        return {
          end: () => { s.t1 = Date.now(); s.ms = s.t1 - s.t0; },
        };
      },
      error: (mod, err) => t.errors.push({ mod, msg: err?.message || String(err), at: Date.now() }),
      finish: (extra = {}) => {
        t.t1 = Date.now();
        t.ms = t.t1 - t.t0;
        Object.assign(t, extra);
        this._push(t);
        return t;
      },
    };
  }
  _push(t) {
    this.traces.push(t);
    if (this.traces.length > this.max) this.traces.shift();
  }
  heatmap() {
    const map = new Map();
    for (const t of this.traces) {
      for (const e of t.errors) {
        map.set(e.mod, (map.get(e.mod) || 0) + 1);
      }
    }
    return Object.fromEntries(map);
  }
  perfByModule() {
    const acc = new Map();
    for (const t of this.traces) {
      for (const s of t.spans) {
        const a = acc.get(s.name) || { count: 0, totalMs: 0, maxMs: 0 };
        a.count++; a.totalMs += s.ms; a.maxMs = Math.max(a.maxMs, s.ms);
        acc.set(s.name, a);
      }
    }
    const out = {};
    for (const [k, v] of acc.entries()) out[k] = { ...v, avgMs: +(v.totalMs / v.count).toFixed(2) };
    return out;
  }
  recent(n = 20) { return this.traces.slice(-n); }
}

module.exports = { Tracer };
