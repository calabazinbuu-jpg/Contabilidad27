"use strict";
/**
 * v6 - Data Validation Layer
 * Detección de datos incorrectos, duplicados, inconsistencias contables.
 */

function isNullish(v) { return v === null || v === undefined || v === ""; }

function findDuplicates(rows, keys) {
  const seen = new Map();
  const dupes = [];
  for (const row of rows) {
    const k = keys.map((f) => String(row?.[f] ?? "")).join("|");
    if (seen.has(k)) dupes.push({ key: k, rows: [seen.get(k), row] });
    else seen.set(k, row);
  }
  return dupes;
}

function findMissingFields(rows, requiredFields) {
  const issues = [];
  rows.forEach((row, i) => {
    const missing = requiredFields.filter((f) => isNullish(row?.[f]));
    if (missing.length) issues.push({ index: i, row, missing });
  });
  return issues;
}

function findNegativeAmounts(rows, fields) {
  const issues = [];
  rows.forEach((row, i) => {
    for (const f of fields) {
      const v = Number(row?.[f]);
      if (!Number.isNaN(v) && v < 0) issues.push({ index: i, field: f, value: v });
    }
  });
  return issues;
}

/** Verifica que sum(debe) === sum(haber) por asiento contable. */
function findUnbalancedEntries(rows, { groupField = "asiento_id", debitField = "debe", creditField = "haber", tolerance = 0.01 } = {}) {
  const groups = new Map();
  for (const r of rows) {
    const k = r?.[groupField];
    if (!groups.has(k)) groups.set(k, { debit: 0, credit: 0, rows: [] });
    const g = groups.get(k);
    g.debit += Number(r?.[debitField]) || 0;
    g.credit += Number(r?.[creditField]) || 0;
    g.rows.push(r);
  }
  const issues = [];
  for (const [k, g] of groups.entries()) {
    if (Math.abs(g.debit - g.credit) > tolerance) {
      issues.push({ asiento: k, debit: g.debit, credit: g.credit, diff: g.debit - g.credit });
    }
  }
  return issues;
}

/** ventas.total debería ser ~= sum(detalle.cantidad * detalle.precio). */
function findInconsistentTotals(parents, details, { parentId = "id", totalField = "total", detailParent = "venta_id", qtyField = "cantidad", priceField = "precio", tolerance = 0.01 } = {}) {
  const sums = new Map();
  for (const d of details) {
    const k = d?.[detailParent];
    sums.set(k, (sums.get(k) || 0) + (Number(d?.[qtyField]) || 0) * (Number(d?.[priceField]) || 0));
  }
  const issues = [];
  for (const p of parents) {
    const expected = sums.get(p?.[parentId]) || 0;
    const actual = Number(p?.[totalField]) || 0;
    if (Math.abs(expected - actual) > tolerance) {
      issues.push({ id: p?.[parentId], expected, actual, diff: actual - expected });
    }
  }
  return issues;
}

function createDataValidator() {
  return { findDuplicates, findMissingFields, findNegativeAmounts, findUnbalancedEntries, findInconsistentTotals };
}

module.exports = { createDataValidator, findDuplicates, findMissingFields, findNegativeAmounts, findUnbalancedEntries, findInconsistentTotals };
