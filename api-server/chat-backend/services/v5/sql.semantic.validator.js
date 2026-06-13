// =============================================================
//  v5 — Layer 6: Validación Semántica SQL profunda
//  Coherencia: columnas reales, agregados sobre columnas numéricas,
//  joins correctos según knowledge graph.
// =============================================================
"use strict";

const { graph } = require("./knowledge.graph");

const TEXT_COLS = new Set([
  "nombre", "nombre_cliente", "nombre_producto", "nombre_proveedor",
  "razon_social", "descripcion", "direccion", "email", "ruc", "dni", "codigo",
]);

const NUMERIC_COLS = new Set([
  "total", "subtotal", "monto", "precio", "cantidad", "stock",
  "total_venta", "igv", "importe", "saldo", "debe", "haber",
]);

function validate({ sql, plan = {}, schemaColumns = null }) {
  const errors = [];
  const warnings = [];
  const s = String(sql || "");

  // 1) Agregados sobre columnas no numéricas
  const aggMatches = [...s.matchAll(/\b(SUM|AVG|MIN|MAX)\s*\(\s*([a-zA-Z_][\w.]*)\s*\)/gi)];
  for (const m of aggMatches) {
    const col = m[2].split(".").pop().toLowerCase();
    if (TEXT_COLS.has(col)) {
      errors.push(`Agregado ${m[1]} sobre columna de texto: ${col}`);
    } else if (schemaColumns && !schemaColumns.has(col) && !NUMERIC_COLS.has(col)) {
      warnings.push(`Columna desconocida en agregado: ${col}`);
    }
  }

  // 2) Joins coherentes con knowledge graph
  const joinMatches = [...s.matchAll(/JOIN\s+([a-zA-Z_][\w]*)\s+(?:\w+\s+)?ON\s+([^\s]+)\s*=\s*([^\s]+)/gi)];
  for (const m of joinMatches) {
    const joinTable = m[1].toLowerCase();
    const baseTable = (plan.table || "").toLowerCase();
    if (baseTable && joinTable && !graph.canJoin(baseTable, joinTable)) {
      warnings.push(`Join sin relación conocida: ${baseTable} <-> ${joinTable}`);
    }
  }

  // 3) SELECT * no permitido (forzar columnas explícitas)
  if (/SELECT\s+\*/i.test(s) && /\bJOIN\b/i.test(s)) {
    warnings.push("SELECT * con JOIN puede causar columnas duplicadas");
  }

  // 4) WHERE sin filtros en tablas grandes
  if (!/\bWHERE\b/i.test(s) && !/\bLIMIT\b/i.test(s) && plan.table) {
    warnings.push(`Consulta sin WHERE ni LIMIT en ${plan.table}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validate, TEXT_COLS, NUMERIC_COLS };
