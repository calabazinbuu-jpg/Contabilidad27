// =============================================================
//  v4 — Layer 3: Validación lógica POST-SQL (pre-ejecución)
// =============================================================
"use strict";

const NUMERIC_COLS = new Set([
  "total","monto","precio","cantidad","saldo","stock","impuesto","subtotal","igv",
]);

function validateSql({ sql, params, plan, schemaColumns }) {
  const errors = [];
  const warnings = [];
  const s = (sql || "").toLowerCase();

  if (!s.trim()) errors.push({ code:"EMPTY_SQL", msg:"SQL vacío" });

  // SUM/AVG over non-numeric col
  const aggMatch = s.match(/\b(sum|avg|min|max)\s*\(\s*([a-z0-9_.*]+)\s*\)/i);
  if (aggMatch) {
    const fn  = aggMatch[1].toUpperCase();
    const col = aggMatch[2].toLowerCase().replace(/^.*\./, "");
    if (col !== "*" && !NUMERIC_COLS.has(col) && (fn === "SUM" || fn === "AVG")) {
      errors.push({ code:"AGG_ON_NON_NUMERIC", msg:`${fn}(${col}) sobre columna no numérica` });
    }
  }

  // JOIN inexistente: si hay JOIN pero plan no la incluye
  if (s.includes(" join ") && !(plan?.joins?.length)) {
    warnings.push({ code:"UNDECLARED_JOIN", msg:"JOIN presente pero no declarado en el plan" });
  }

  // Filtros vacíos peligrosos en UPDATE/DELETE
  if (/^\s*(update|delete)\b/.test(s) && !/\bwhere\b/.test(s)) {
    errors.push({ code:"UNSAFE_NO_WHERE", msg:"UPDATE/DELETE sin WHERE" });
  }

  // Columnas inexistentes
  if (plan?.table && schemaColumns?.[plan.table]) {
    const allowed = new Set(schemaColumns[plan.table].map(c => c.toLowerCase()));
    const cols = [...s.matchAll(/where\s+([a-z0-9_]+)\s*(=|<|>|like|between|in)/g)].map(m=>m[1]);
    for (const c of cols) {
      if (!allowed.has(c)) warnings.push({ code:"UNKNOWN_COLUMN", msg:`columna desconocida: ${c}` });
    }
  }

  // SELECT * sin LIMIT
  if (/select\s+\*/.test(s) && !/\blimit\b/.test(s)) {
    warnings.push({ code:"NO_LIMIT", msg:"SELECT * sin LIMIT" });
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validateSql };
