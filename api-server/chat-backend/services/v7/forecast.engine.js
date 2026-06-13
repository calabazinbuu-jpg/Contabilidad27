"use strict";
/**
 * v7 - Financial Forecast Engine
 * Predicción ventas/IGV/cashflow + detección de estacionalidad simple.
 */
function n(x) { return Number(x) || 0; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function linearRegression(series) {
  const ys = series.map(n);
  const N = ys.length;
  if (N < 2) return { slope: 0, intercept: mean(ys) };
  const xs = ys.map((_, i) => i);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

function forecast(series, periods = 3) {
  const { slope, intercept } = linearRegression(series);
  return Array.from({ length: periods }, (_, k) => intercept + slope * (series.length + k));
}

/** Detecta seasonality por autocorrelación lag-N. */
function seasonality(series, candidates = [7, 12, 30]) {
  const ys = series.map(n);
  const m = mean(ys);
  function autocorr(lag) {
    let num = 0, den = 0;
    for (let i = 0; i < ys.length; i++) {
      den += (ys[i] - m) ** 2;
      if (i >= lag) num += (ys[i] - m) * (ys[i - lag] - m);
    }
    return den === 0 ? 0 : num / den;
  }
  return candidates.map((lag) => ({ lag, score: autocorr(lag) })).sort((a, b) => b.score - a.score);
}

function cashflowForecast({ ingresosSerie, egresosSerie, saldoInicial = 0, periods = 3 }) {
  const inF = forecast(ingresosSerie, periods);
  const eF = forecast(egresosSerie, periods);
  let saldo = saldoInicial;
  return inF.map((ing, i) => { saldo += ing - eF[i]; return { periodo: i + 1, ingreso: ing, egreso: eF[i], saldo }; });
}

function createForecastEngine() {
  return { forecast, seasonality, cashflowForecast, linearRegression };
}

module.exports = { createForecastEngine, forecast, seasonality, cashflowForecast };
