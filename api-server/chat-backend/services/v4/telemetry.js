// =============================================================
//  v4 — Layer 12: Telemetría / analítica del engine
// =============================================================
"use strict";

function createTelemetry() {
  const counters = {
    totalAsks: 0,
    byTable: {},
    byIntent: {},
    byAgent: {},
    failures: { total: 0, byKind: {} },
    fallbacks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    confidence: { sum: 0, count: 0, low: 0, medium: 0, high: 0 },
  };

  function trackAsk({ parsed, ok, agent, errorKind, cacheHit }) {
    counters.totalAsks++;
    if (parsed?.table) counters.byTable[parsed.table] = (counters.byTable[parsed.table]||0)+1;
    if (parsed?.intent) counters.byIntent[parsed.intent] = (counters.byIntent[parsed.intent]||0)+1;
    if (agent) counters.byAgent[agent] = (counters.byAgent[agent]||0)+1;
    if (parsed?.fallback) counters.fallbacks++;
    if (!ok) {
      counters.failures.total++;
      const k = errorKind || "UNKNOWN";
      counters.failures.byKind[k] = (counters.failures.byKind[k]||0)+1;
    }
    if (cacheHit === true) counters.cacheHits++;
    if (cacheHit === false) counters.cacheMisses++;
    const c = parsed?.global?.confidence;
    if (typeof c === "number") {
      counters.confidence.sum += c;
      counters.confidence.count++;
      const r = parsed.global.riskLevel;
      if (r === "low") counters.confidence.high++;     // low risk == high confidence
      else if (r === "medium") counters.confidence.medium++;
      else counters.confidence.low++;
    }
  }

  function snapshot() {
    const avg = counters.confidence.count
      ? counters.confidence.sum / counters.confidence.count : 0;
    const fallbackRate = counters.totalAsks
      ? counters.fallbacks / counters.totalAsks : 0;
    return {
      ...counters,
      averageConfidence: +avg.toFixed(3),
      fallbackRate: +fallbackRate.toFixed(3),
    };
  }

  function reset() {
    counters.totalAsks = 0;
    counters.byTable = {}; counters.byIntent = {}; counters.byAgent = {};
    counters.failures = { total: 0, byKind: {} };
    counters.fallbacks = 0; counters.cacheHits = 0; counters.cacheMisses = 0;
    counters.confidence = { sum:0, count:0, low:0, medium:0, high:0 };
  }

  return { trackAsk, snapshot, reset, _counters: counters };
}

module.exports = { createTelemetry };
