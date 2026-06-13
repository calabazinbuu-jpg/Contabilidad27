// =============================================================
//  v5 — Layer 11: Human-in-the-Loop
//  Genera pregunta de aclaración cuando ambigüedad alta.
// =============================================================
"use strict";

function buildClarification(parsed, ambResult) {
  const cands = (parsed.candidates || []).slice(0, 3).map(c => c.table || c.name).filter(Boolean);

  if (ambResult?.vague) {
    return {
      ask: "¿Qué información necesitas exactamente? (ej. ventas del mes, stock bajo, facturas pendientes)",
      options: ["ventas del mes", "facturas pendientes", "stock bajo", "top clientes"],
      reason: "vague_input",
    };
  }
  if (ambResult?.hybridQuery && ambResult.domains?.length >= 2) {
    return {
      ask: `Tu consulta mezcla varios dominios (${ambResult.domains.join(", ")}). ¿Cuál priorizamos?`,
      options: ambResult.domains,
      reason: "multi_domain",
    };
  }
  if (cands.length >= 2) {
    return {
      ask: `¿Te refieres a ${cands.slice(0, 2).join(" o ")}?`,
      options: cands,
      reason: "tie_score",
    };
  }
  return {
    ask: "No estoy seguro de tu consulta. ¿Puedes reformularla?",
    options: [],
    reason: "low_confidence",
  };
}

module.exports = { buildClarification };
