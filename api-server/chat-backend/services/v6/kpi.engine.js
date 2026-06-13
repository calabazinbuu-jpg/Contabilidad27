"use strict";
/**
 * v6 - KPI Engine
 * Cálculo de utilidad real, margen bruto, IGV neto, proyecciones.
 * Asume tasa IGV Perú por defecto (18%); configurable.
 */

const DEFAULT_IGV_RATE = 0.18;

function n(x) { return Number(x) || 0; }

function grossMargin({ ventasNetas, costoVentas }) {
  const v = n(ventasNetas), c = n(costoVentas);
  if (v === 0) return { absoluto: 0, porcentaje: 0 };
  return { absoluto: v - c, porcentaje: ((v - c) / v) * 100 };
}

function netProfit({ ventasNetas, costoVentas, gastos = 0, impuestos = 0 }) {
  const utilidad = n(ventasNetas) - n(costoVentas) - n(gastos) - n(impuestos);
  return { utilidad, margenNeto: ventasNetas ? (utilidad / n(ventasNetas)) * 100 : 0 };
}

function igvBreakdown({ ventasBrutas, comprasBrutas, rate = DEFAULT_IGV_RATE }) {
  const ventasNetas = n(ventasBrutas) / (1 + rate);
  const igvVentas = n(ventasBrutas) - ventasNetas;
  const comprasNetas = n(comprasBrutas) / (1 + rate);
  const igvCompras = n(comprasBrutas) - comprasNetas;
  return {
    ventasNetas,
    comprasNetas,
    igvVentas,
    igvCompras,
    igvNetoPorPagar: igvVentas - igvCompras,
    rate,
  };
}

/** Proyección lineal simple basada en últimos N puntos. */
function linearProjection(series, periodsAhead = 1) {
  const ys = series.map(n);
  const N = ys.length;
  if (N === 0) return Array(periodsAhead).fill(0);
  if (N === 1) return Array(periodsAhead).fill(ys[0]);
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / N;
  const meanY = ys.reduce((a, b) => a + b, 0) / N;
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) { num += (xs[i] - meanX) * (ys[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return Array.from({ length: periodsAhead }, (_, k) => intercept + slope * (N + k));
}

function rotacionInventario({ costoVentas, inventarioPromedio }) {
  const inv = n(inventarioPromedio);
  return inv === 0 ? 0 : n(costoVentas) / inv;
}

function diasCobro({ cuentasPorCobrar, ventasNetas, dias = 30 }) {
  return ventasNetas === 0 ? 0 : (n(cuentasPorCobrar) / n(ventasNetas)) * dias;
}

function createKpiEngine({ igvRate = DEFAULT_IGV_RATE } = {}) {
  return {
    grossMargin,
    netProfit,
    igvBreakdown: (input) => igvBreakdown({ rate: igvRate, ...input }),
    linearProjection,
    rotacionInventario,
    diasCobro,
    /** Snapshot completo a partir de un set de inputs. */
    snapshot(input) {
      const igv = igvBreakdown({ rate: igvRate, ventasBrutas: input.ventasBrutas, comprasBrutas: input.comprasBrutas });
      const margen = grossMargin({ ventasNetas: igv.ventasNetas, costoVentas: input.costoVentas });
      const neto = netProfit({ ventasNetas: igv.ventasNetas, costoVentas: input.costoVentas, gastos: input.gastos, impuestos: igv.igvNetoPorPagar });
      return { igv, margen, neto };
    },
  };
}

module.exports = { createKpiEngine, grossMargin, netProfit, igvBreakdown, linearProjection };
