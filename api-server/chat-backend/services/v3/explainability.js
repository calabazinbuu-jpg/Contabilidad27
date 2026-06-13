// =============================================================
//  v3 — Layer 8: Explainability formal
//  Estructura los "why" en una traza profesional para debugging.
// =============================================================
"use strict";

function newTrace() {
  const reasons = [];
  return {
    add(kind, msg, weight = 0) { reasons.push({ kind, msg, weight }); },
    addKeyword(kw, w)  { reasons.push({ kind:"keyword",  msg:`keyword match: ${kw}`, weight:w }); },
    addIntent(intent,w){ reasons.push({ kind:"intent",   msg:`intent ${intent}`, weight:w }); },
    addEntity(e,w)     { reasons.push({ kind:"entity",   msg:`entity ${e.type}=${e.value}`, weight:w }); },
    addContext(field,w){ reasons.push({ kind:"context",  msg:`context boost: ${field}`, weight:w }); },
    addPriority(p)     { reasons.push({ kind:"priority", msg:`priority boost`, weight:p }); },
    addAmbiguity(info) { reasons.push({ kind:"ambiguity", msg:`ambiguous (ratio=${info.ratio?.toFixed?.(2)})`, weight:0 }); },
    serialize() {
      return reasons.map(r => `${r.msg}${r.weight ? ` (+${r.weight})` : ""}`);
    },
    raw() { return reasons.slice(); },
  };
}

function explainDecision({ table, score, intent, trace, fallback = false, motivo = null }) {
  const out = {
    table,
    score: Number((score || 0).toFixed(2)),
    decision: intent || "UNKNOWN",
    fallback,
  };
  if (motivo) out.motivo = motivo;
  out.why = trace ? trace.serialize() : [];
  return out;
}

module.exports = { newTrace, explainDecision };
