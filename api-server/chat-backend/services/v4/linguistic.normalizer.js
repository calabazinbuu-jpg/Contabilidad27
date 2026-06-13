// =============================================================
//  v4 — Layer 13: Normalización lingüística
//  Limpia texto, corrige typos comunes y aplica sinónimos ES.
// =============================================================
"use strict";

const SYNONYMS = {
  "proveedors": "proveedores",
  "proveedoress": "proveedores",
  "provedor": "proveedor",
  "provedores": "proveedores",
  "clientess": "clientes",
  "klientes": "clientes",
  "facturass": "facturas",
  "factrua": "factura",
  "factruas": "facturas",
  "ventass": "ventas",
  "vntas": "ventas",
  "comprass": "compras",
  "compraz": "compras",
  "stok": "stock",
  "stoc": "stock",
  "inventari": "inventario",
  "inventarios": "inventario",
  "igvvv": "igv",
  "iggv": "igv",
  "i.g.v": "igv",
  "i.g.v.": "igv",
  "iva": "igv",
  "imp": "impuesto",
  "imps": "impuestos",
  "mes pasado": "mes_pasado",
  "este mes": "mes_actual",
  "año pasado": "anio_pasado",
  "ano pasado": "anio_pasado",
  "utilidad": "utilidad",
  "ganancia": "utilidad",
  "ganancias": "utilidad",
  "ingreso": "ventas",
  "ingresos": "ventas",
  "egreso": "compras",
  "egresos": "compras",
};

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dedupRepeatedChars(s) {
  // "proveedoressss" -> "proveedoress" (cap repeats at 2)
  return s.replace(/(.)\1{2,}/g, "$1$1");
}

function applySynonyms(s) {
  // multi-word first
  for (const [k, v] of Object.entries(SYNONYMS)) {
    if (k.includes(" ")) {
      const re = new RegExp("\\b" + k.replace(/[.]/g, "\\.") + "\\b", "g");
      s = s.replace(re, v);
    }
  }
  // single tokens
  s = s.split(/\s+/).map(tok => {
    const clean = tok.replace(/[^\wáéíóúñ.]/gi, "");
    return SYNONYMS[clean] || tok;
  }).join(" ");
  return s;
}

function normalizeText(raw) {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();
  s = stripAccents(s);
  s = dedupRepeatedChars(s);
  s = s.replace(/\s+/g, " ");
  s = applySynonyms(s);
  return s;
}

module.exports = { normalizeText, SYNONYMS };
