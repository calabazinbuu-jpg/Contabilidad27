// =============================================================
//  v3 — Layer 1: Normalización de Intención
//  Convierte frases humanas en intención estándar:
//    SELECT_LIST, AGG_COUNT, AGG_SUM, AGG_AVG, AGG_MAX, AGG_MIN,
//    TAX_REPORT, PROFIT_CALC, COMPARE, RANKING, GREETING, HELP, UNKNOWN
// =============================================================
"use strict";

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ").trim();
}

const INTENT_PATTERNS = [
  { intent: "TAX_REPORT",  kws: ["igv","iva","impuesto","tributo","sunat"] },
  { intent: "PROFIT_CALC", kws: ["utilidad","ganancia","ganancias","margen","rentabilidad","beneficio","profit"] },
  { intent: "COMPARE",     kws: ["compara","comparar","comparativo","vs","versus","contra","diferencia"] },
  { intent: "RANKING",     kws: ["top","mejor","mejores","peor","peores","ranking","mayor","mayores","menor","menores"] },
  { intent: "AGG_AVG",     kws: ["promedio","media","average","ticket promedio"] },
  { intent: "AGG_MAX",     kws: ["maximo","mas alto","mayor","pico","tope","record"] },
  { intent: "AGG_MIN",     kws: ["minimo","mas bajo","menor","piso"] },
  { intent: "AGG_COUNT",   kws: ["cuantas","cuantos","numero de","cantidad de","conteo","count"] },
  { intent: "AGG_SUM",     kws: ["cuanto vendi","cuanto compre","total de","suma","sumar","sumatoria","monto total","importe total","cuanto facture","cuanto gaste"] },
  { intent: "SELECT_LIST", kws: ["ver","lista","listar","listado","mostrar","muestrame","muestra","dame","ensename","enseña","traeme","traer"] },
  { intent: "GREETING",    kws: ["hola","buenas","buenos dias","buenas tardes","buenas noches","que tal","saludos"] },
  { intent: "HELP",        kws: ["ayuda","ayudame","help","que puedes hacer","que sabes hacer"] },
];

function hasKw(t, kws) {
  const padded = " " + t + " ";
  return kws.some(k => padded.includes(" " + k + " ") || padded.includes(k));
}

function normalizeIntent(rawText) {
  const t = norm(rawText);
  const matches = [];
  for (const p of INTENT_PATTERNS) {
    if (hasKw(t, p.kws)) matches.push(p.intent);
  }
  // Prioridad por orden del array
  const intent = matches[0] || "UNKNOWN";
  return {
    intent,
    text: t,
    allMatches: matches,
  };
}

module.exports = { normalizeIntent, norm };
