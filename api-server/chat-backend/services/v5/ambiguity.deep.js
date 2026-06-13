// =============================================================
//  v5 — Layer 4: Ambigüedad Semántica Profunda
//  Detecta intención doble, contexto mixto, multi-dominio.
// =============================================================
"use strict";

const DOMAIN_KEYWORDS = {
  ventas:       ["venta", "vendido", "vender", "ingreso", "boleta"],
  facturas:     ["factura", "facturacion", "comprobante", "igv", "ruc"],
  clientes:     ["cliente", "comprador", "consumidor"],
  proveedores:  ["proveedor", "supplier"],
  productos:    ["producto", "articulo", "item", "sku"],
  inventario:   ["inventario", "stock", "almacen", "existencia"],
  compras:      ["compra", "comprado", "adquisicion"],
  contabilidad: ["asiento", "diario", "balance", "contable"],
  tesoreria:    ["caja", "banco", "tesoreria", "flujo"],
};

function detectDomains(text) {
  const t = String(text || "").toLowerCase();
  const hits = [];
  for (const [dom, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const k of kws) {
      if (t.includes(k)) { hits.push(dom); break; }
    }
  }
  return Array.from(new Set(hits));
}

function detectVaguePhrases(text) {
  const t = String(text || "").toLowerCase().trim();
  const VAGUE = [
    "todo", "dame todo", "lo de siempre", "eso del mes pasado",
    "hazlo bien", "resumen completo", "como siempre", "lo mismo",
  ];
  return VAGUE.some(v => t === v || t.includes(v));
}

/**
 * analyze(text, parsed) -> { ambiguity: 0..1, domains, vague, mixedIntent, hybridQuery, shouldSplit }
 */
function analyze(text, parsed = {}) {
  const domains = detectDomains(text);
  const vague   = detectVaguePhrases(text);

  const mixedIntent = (parsed.candidates || []).length >= 2 &&
                      Math.abs((parsed.candidates[0]?.score || 0) - (parsed.candidates[1]?.score || 0)) < 1;

  const hybridQuery = domains.length >= 2;
  const shouldSplit = hybridQuery && /\b(y|e|con|mas|también)\b/i.test(text);

  let ambiguity = 0;
  if (vague)          ambiguity += 0.6;
  if (mixedIntent)    ambiguity += 0.25;
  if (hybridQuery)    ambiguity += 0.20 * (domains.length - 1);
  ambiguity = Math.min(1, ambiguity);

  return { ambiguity: +ambiguity.toFixed(3), domains, vague, mixedIntent, hybridQuery, shouldSplit };
}

module.exports = { analyze, detectDomains, detectVaguePhrases, DOMAIN_KEYWORDS };
