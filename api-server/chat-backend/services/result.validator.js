// ─────────────────────────────────────────────────────────────────
// result.validator.js — Validación de coherencia de resultados
// Si SUM=0 pero la tabla tiene registros, devuelve una pista para
// que el caller reintente o aclare.
// ─────────────────────────────────────────────────────────────────
const db = require("../config/db");

async function countSafe(tabla) {
  try { const r = await db.query(`SELECT COUNT(*)::int n FROM ${tabla}`); return r.rows[0].n; }
  catch { return null; }
}

function pareceVacio(rows) {
  if (!rows || !rows.length) return true;
  if (rows.length === 1) {
    const v = rows[0];
    const vals = Object.values(v);
    if (vals.every(x => x === 0 || x === null || x === "0" || x === "0.00")) return true;
  }
  return false;
}

async function validar({ rows, tablasReferidas = [] }) {
  if (!pareceVacio(rows)) return { ok: true };
  const evidencia = [];
  for (const t of tablasReferidas) {
    const n = await countSafe(t);
    if (n != null && n > 0) evidencia.push(`${t} tiene ${n} registros`);
  }
  return {
    ok: false,
    motivo: evidencia.length
      ? `Resultado vacío pero ${evidencia.join(", ")}. Revisa filtros (fechas, empresa_id, estado).`
      : `Resultado vacío y no hay datos en tablas relacionadas.`,
    evidencia,
  };
}

function extraerTablas(sql) {
  const out = new Set();
  for (const m of String(sql || "").matchAll(/\b(?:from|join)\s+([a-zA-Z_][\w]*)/gi)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

module.exports = { validar, extraerTablas, pareceVacio };
