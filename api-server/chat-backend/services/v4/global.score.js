// =============================================================
//  v4 — Layer 1: Scoring global de decisión
//   finalScore = intent + entity + table + context - ambiguity
// =============================================================
"use strict";

function computeGlobalScore(parsed) {
  const intentConf = parsed.intent && parsed.intent !== "UNKNOWN" ? 0.25 : 0.05;
  const entityConf = Math.min(0.25, (parsed.entities?.length || 0) * 0.08);
  const tableScore = parsed.candidates?.[0]?.score
    ? Math.min(0.35, parsed.candidates[0].score / 20)
    : 0;
  const ctxScore   = parsed._ctxBoost ? 0.10 : 0;
  const ambPenalty = parsed.fallback ? 0.35 : 0;
  const raw = intentConf + entityConf + tableScore + ctxScore - ambPenalty;
  const confidence = Math.max(0, Math.min(1, raw));
  const riskLevel  = confidence >= 0.75 ? "low"
                  : confidence >= 0.45 ? "medium" : "high";
  return {
    confidence: +confidence.toFixed(3),
    riskLevel,
    parts: {
      intentConf, entityConf, tableScore, ctxScore, ambPenalty,
    },
  };
}

module.exports = { computeGlobalScore };
