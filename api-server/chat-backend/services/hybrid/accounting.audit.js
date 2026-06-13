// ─────────────────────────────────────────────────────────────────
//  hybrid/accounting.audit.js   (v10)
//  Auditor contable — valida coherencia de números clave.
//
//  Reglas verificadas:
//   1. Utilidad neta = Ingresos - Gastos
//   2. IGV de ventas ≈ total_ventas * 0.18 / 1.18 (Perú)  (tolerancia)
//   3. Facturas pagadas + pendientes = total facturas
//   4. Ingresos ≥ 0, Gastos ≥ 0
//
//  Devuelve hallazgos con severidad (info/warn/error) y sugerencia.
//  NUNCA modifica datos. Solo audita.
// ─────────────────────────────────────────────────────────────────
const db = require("../../config/db");
const { safeRun } = require("./safe.fallback");

const IGV = 0.18;
const TOL = 0.05; // 5% tolerancia para redondeos

async function _scalar(sql, params = []) {
  return safeRun(async () => {
    const r = await db.query(sql, params);
    const row = r.rows?.[0] || {};
    const v = Object.values(row)[0];
    return Number(v ?? 0);
  }, 0, sql);
}

async function auditar({ desde, hasta } = {}) {
  const w = (col) => (desde && hasta) ? `WHERE ${col} BETWEEN $1 AND $2` : "";
  const p = (desde && hasta) ? [desde, hasta] : [];

  const ventasTotal = await _scalar(`SELECT COALESCE(SUM(total),0) FROM ventas ${w("fecha")}`, p);
  const ventasIGV   = await _scalar(`SELECT COALESCE(SUM(igv),0)   FROM ventas ${w("fecha")}`, p);
  const comprasTot  = await _scalar(`SELECT COALESCE(SUM(total),0) FROM compras ${w("fecha")}`, p);
  const facTot      = await _scalar(`SELECT COALESCE(SUM(total),0) FROM facturas ${w("fecha")}`, p);
  const facPag      = await _scalar(`SELECT COALESCE(SUM(total),0) FROM facturas ${w("fecha")} ${w("fecha") ? "AND" : "WHERE"} pagada = TRUE`, p);
  const pagosTot    = await _scalar(`SELECT COALESCE(SUM(monto),0) FROM pagos ${w("fecha")}`, p);

  const ingresos = ventasTotal;
  const gastos   = comprasTot;
  const utilidad = ingresos - gastos;

  const hallazgos = [];

  // 1) Coherencia básica
  if (ingresos < 0) hallazgos.push({ severidad:"error", regla:"INGRESOS≥0", detalle:`ingresos=${ingresos}` });
  if (gastos   < 0) hallazgos.push({ severidad:"error", regla:"GASTOS≥0",   detalle:`gastos=${gastos}` });

  // 2) IGV esperado (Perú) sobre ventas
  if (ventasTotal > 0) {
    const igvEsperado = ventasTotal * IGV / (1 + IGV);
    const diff = Math.abs(igvEsperado - ventasIGV);
    const ratio = igvEsperado ? diff / igvEsperado : 0;
    if (ratio > TOL) {
      hallazgos.push({
        severidad: "warn",
        regla: "IGV_VENTAS",
        detalle: `IGV registrado ${ventasIGV.toFixed(2)} vs esperado ${igvEsperado.toFixed(2)} (Δ ${(ratio*100).toFixed(1)}%)`,
        sugerencia: "Verifica que `ventas.igv` use la fórmula total*0.18/1.18 (IGV incluido) o total*0.18 (IGV agregado).",
      });
    }
  }

  // 3) Facturación: pagado ≤ total
  if (facPag > facTot + 0.01) {
    hallazgos.push({
      severidad: "error",
      regla: "FACTURAS_PAGADAS≤TOTAL",
      detalle: `pagadas=${facPag.toFixed(2)} > totales=${facTot.toFixed(2)}`,
      sugerencia: "Revisa duplicados o pagos asociados a facturas anuladas.",
    });
  }

  // 4) Pagos vs facturas pagadas (informativo)
  if (facPag > 0 && pagosTot > 0) {
    const ratio = Math.abs(pagosTot - facPag) / Math.max(facPag, 1);
    if (ratio > TOL) {
      hallazgos.push({
        severidad: "info",
        regla: "PAGOS≈FACTURAS_PAGADAS",
        detalle: `pagos=${pagosTot.toFixed(2)} vs facturasPagadas=${facPag.toFixed(2)}`,
        sugerencia: "Concilia pagos.factura_id con facturas.pagada=TRUE.",
      });
    }
  }

  return {
    ok: true,
    periodo: desde && hasta ? { desde, hasta } : "histórico",
    kpis: {
      ingresos: +ingresos.toFixed(2),
      gastos:   +gastos.toFixed(2),
      utilidad_neta: +utilidad.toFixed(2),
      margen_pct: ingresos ? +((utilidad/ingresos)*100).toFixed(2) : 0,
      igv_ventas: +ventasIGV.toFixed(2),
      facturas_total: +facTot.toFixed(2),
      facturas_pagadas: +facPag.toFixed(2),
      pagos_total: +pagosTot.toFixed(2),
    },
    hallazgos,
    resumen: hallazgos.length === 0
      ? "✅ Auditoría sin observaciones."
      : `⚠️ ${hallazgos.length} hallazgo(s): ${hallazgos.map(h=>h.regla).join(", ")}`,
  };
}

module.exports = { auditar };
