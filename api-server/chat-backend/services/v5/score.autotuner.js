// =============================================================
//  v5 — Layer 3 + 7: Scoring Auto-Tuning (Learning loop real)
//  Ajusta pesos según error_rate por tabla/intent.
// =============================================================
"use strict";

const DEFAULT_WEIGHTS = {
  intent:   0.25,
  entity:   0.25,
  table:    0.35,
  context:  0.10,
  keywords: 0.20,
  conflict: 0.15,
};

function createAutoTuner(initial = {}) {
  let weights = { ...DEFAULT_WEIGHTS, ...initial };
  const stats = new Map(); // key -> {total, errors}

  function record(key, isError) {
    const s = stats.get(key) || { total: 0, errors: 0 };
    s.total++;
    if (isError) s.errors++;
    stats.set(key, s);
  }

  function errorRate(key) {
    const s = stats.get(key);
    if (!s || s.total < 5) return 0;
    return s.errors / s.total;
  }

  /**
   * Ajusta pesos automáticamente. Si error_rate(table) > threshold,
   * sube peso de keywords y baja peso de conflicts.
   */
  function tune(opts = {}) {
    const threshold = opts.threshold ?? 0.20;
    const delta     = opts.delta ?? 0.02;
    const changes = [];

    for (const [key, s] of stats.entries()) {
      const rate = s.total ? s.errors / s.total : 0;
      if (s.total < 5) continue;
      if (rate > threshold) {
        weights.keywords = clamp(weights.keywords + delta);
        weights.conflict = clamp(weights.conflict - delta * 0.5);
        changes.push({ key, errorRate: +rate.toFixed(3), action: "boost_keywords" });
      } else if (rate < threshold / 3) {
        weights.keywords = clamp(weights.keywords - delta * 0.5);
        changes.push({ key, errorRate: +rate.toFixed(3), action: "relax_keywords" });
      }
    }
    return { weights: { ...weights }, changes };
  }

  function get() { return { ...weights }; }
  function reset() { weights = { ...DEFAULT_WEIGHTS, ...initial }; stats.clear(); }
  function snapshot() {
    const out = {};
    for (const [k, v] of stats.entries()) out[k] = { ...v, rate: +(v.errors / Math.max(1, v.total)).toFixed(3) };
    return { weights: { ...weights }, stats: out };
  }

  return { record, errorRate, tune, get, reset, snapshot };
}

function clamp(x, min = 0.01, max = 1.0) { return Math.max(min, Math.min(max, x)); }

module.exports = { createAutoTuner, DEFAULT_WEIGHTS };
