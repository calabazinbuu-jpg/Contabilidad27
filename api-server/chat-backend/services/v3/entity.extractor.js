// =============================================================
//  v3 — Layer 4: Detector de Entidades (PRODUCT/CLIENT/PROVIDER/
//  CITY/DATE/AMOUNT). Extrae objetos reales mencionados.
//  El catálogo (productos, clientes, proveedores, ciudades) se
//  puede pasar al construir el extractor o cargar desde la BD.
// =============================================================
"use strict";

const { norm } = require("./intent.normalizer");

const DEFAULT_CITIES = [
  "lima","arequipa","cusco","trujillo","piura","chiclayo","iquitos","tacna",
  "huancayo","ayacucho","puno","ica","callao","tumbes","chimbote","cajamarca",
];

function buildExtractor({ products = [], clients = [], providers = [], cities = DEFAULT_CITIES } = {}) {
  const norms = {
    products:  products.map(p => ({ raw: p, n: norm(p) })),
    clients:   clients.map(p => ({ raw: p, n: norm(p) })),
    providers: providers.map(p => ({ raw: p, n: norm(p) })),
    cities:    cities.map(p => ({ raw: p, n: norm(p) })),
  };
  return function extract(rawText) {
    const t = " " + norm(rawText) + " ";
    const entities = [];
    const seen = new Set();
    const push = (type, value, raw) => {
      const k = type + ":" + value;
      if (seen.has(k)) return;
      seen.add(k);
      entities.push({ type, value: raw || value });
    };

    for (const { raw, n } of norms.products)  if (n && t.includes(" "+n+" ")) push("PRODUCT",  n, raw);
    for (const { raw, n } of norms.clients)   if (n && t.includes(" "+n+" ")) push("CLIENT",   n, raw);
    for (const { raw, n } of norms.providers) if (n && t.includes(" "+n+" ")) push("PROVIDER", n, raw);
    for (const { raw, n } of norms.cities)    if (n && t.includes(" "+n+" ")) push("CITY",     n, raw);

    // AMOUNT (números con o sin moneda)
    const amounts = rawText.match(/(?:s\/\.?\s*|us\$\s*|\$)?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?/gi) || [];
    for (const a of amounts) {
      const num = parseFloat(a.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
      if (!isNaN(num) && num > 0) push("AMOUNT", String(num), num);
    }
    return entities;
  };
}

module.exports = { buildExtractor, DEFAULT_CITIES };
