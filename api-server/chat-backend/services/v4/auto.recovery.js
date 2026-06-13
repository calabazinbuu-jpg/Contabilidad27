// =============================================================
//  v4 — Layer 11: Auto-recovery (segundo intento / degrade / clarificación)
// =============================================================
"use strict";

async function recover({ engine, parsed, error, agents }) {
  // 1) Segunda opción de tabla
  const second = parsed.candidates?.[1];
  if (second && second.score > 0) {
    const cloned = { ...parsed, table: second.table, fallback:false };
    try {
      const sqlPack = engine.toSql(cloned);
      if (sqlPack?.sql) return { ok:true, recovered:"second_candidate", parsed: cloned, sqlPack };
    } catch {}
  }
  // 2) Degradar a agente
  try {
    const router = require("./agent.router");
    const delegated = await router.route(parsed, agents || {});
    if (delegated.result) return { ok:true, recovered:"agent_delegate", delegated };
  } catch {}
  // 3) Pedir clarificación
  return {
    ok:false,
    recovered:"ask_clarification",
    question: `No estoy seguro de a qué te refieres. ¿Hablas de "${parsed.candidates?.[0]?.table}" o "${parsed.candidates?.[1]?.table || "otra cosa"}"?`,
    error,
  };
}

module.exports = { recover };
