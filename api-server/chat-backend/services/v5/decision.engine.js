// =============================================================
//  v5 — Layer 1: Decision Engine FINAL (determinista)
//  Cierre final: EXECUTE | ASK_USER | FALLBACK
// =============================================================
"use strict";

const DEFAULTS = {
  executeMin: 0.90,   // confianza para ejecutar directo
  askMin:     0.75,   // por debajo de esto, preguntar al usuario
  ambiguityMax: 0,    // ambigüedad tolerada para EXECUTE
};

/**
 * decide({ confidence, ambiguity, riskLevel, hasSql }) -> {action, reason}
 *   action: "EXECUTE" | "ASK_USER" | "FALLBACK" | "CONFIRM"
 */
function decide(input, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const confidence = Number(input.confidence ?? 0);
  const ambiguity  = Number(input.ambiguity  ?? 0);
  const risk       = input.riskLevel || "medium";
  const hasSql     = !!input.hasSql;

  if (!hasSql) {
    return { action: "FALLBACK", reason: "no_sql_generated" };
  }
  if (risk === "critical") {
    return { action: "ASK_USER", reason: "critical_risk" };
  }
  if (confidence >= cfg.executeMin && ambiguity <= cfg.ambiguityMax) {
    return { action: "EXECUTE", reason: "high_confidence" };
  }
  if (confidence < cfg.askMin) {
    return { action: "ASK_USER", reason: "low_confidence" };
  }
  // zona media: ejecutar pero pidiendo confirmación suave
  return { action: "CONFIRM", reason: "medium_confidence" };
}

module.exports = { decide, DEFAULTS };
