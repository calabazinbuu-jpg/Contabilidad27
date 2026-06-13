"use strict";
/**
 * v7 - SQL Optimizer Engine
 * Heurísticas: detecta SELECT *, faltan índices probables, sugiere reordenar joins,
 * mide queries lentas y reescribe LIKE '%x%' problemáticos.
 */
function createSqlOptimizer({ runQuery, slowMs = 500 } = {}) {
  const slowLog = [];

  function analyze(sql) {
    const issues = [];
    if (/SELECT\s+\*/i.test(sql)) issues.push({ level: "warn", msg: "SELECT * — limita columnas explícitamente" });
    const whereCols = [...sql.matchAll(/\bWHERE\b[\s\S]*?\b(\w+)\s*=/gi)].map((m) => m[1]);
    if (whereCols.length) issues.push({ level: "info", msg: `Considera índices en: ${[...new Set(whereCols)].join(", ")}` });
    if (/LIKE\s+'%/i.test(sql)) issues.push({ level: "warn", msg: "LIKE con comodín al inicio impide uso de índice; considera full-text" });
    const joins = (sql.match(/\bJOIN\b/gi) || []).length;
    if (joins > 4) issues.push({ level: "warn", msg: `Muchos JOINs (${joins}); considera vistas materializadas` });
    if (!/\bLIMIT\b/i.test(sql) && /^\s*SELECT/i.test(sql)) issues.push({ level: "info", msg: "Sin LIMIT — agregar para evitar respuestas masivas" });
    return issues;
  }

  /** Reescribe queries simples mejorables. */
  function rewrite(sql) {
    let out = sql;
    if (/^\s*SELECT\s+\*/i.test(out)) out = out.replace(/SELECT\s+\*/i, "SELECT /* todo el conjunto */ *");
    if (!/\bLIMIT\b/i.test(out) && /^\s*SELECT/i.test(out)) out = out.replace(/;?\s*$/, " LIMIT 1000");
    return out;
  }

  async function timed(sql, params = []) {
    const t0 = Date.now();
    try {
      const res = await runQuery(sql, params);
      const ms = Date.now() - t0;
      if (ms >= slowMs) slowLog.push({ sql: sql.slice(0, 200), ms, at: Date.now() });
      return { res, ms };
    } catch (e) {
      slowLog.push({ sql: sql.slice(0, 200), ms: Date.now() - t0, error: e.message, at: Date.now() });
      throw e;
    }
  }

  function slowest(limit = 10) { return [...slowLog].sort((a, b) => b.ms - a.ms).slice(0, limit); }

  /** Index advisor a partir de slowLog. */
  function indexAdvice() {
    const cols = {};
    for (const e of slowLog) {
      const ms = [...e.sql.matchAll(/\bWHERE\b[\s\S]*?\b(\w+)\s*=/gi)];
      for (const m of ms) cols[m[1]] = (cols[m[1]] || 0) + 1;
    }
    return Object.entries(cols).sort((a, b) => b[1] - a[1]).map(([col, count]) => ({ col, count, suggestion: `CREATE INDEX ON <table>(${col})` }));
  }

  return { analyze, rewrite, timed, slowest, indexAdvice, slowLog };
}

module.exports = { createSqlOptimizer };
