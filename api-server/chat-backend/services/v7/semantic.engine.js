"use strict";
/**
 * v7 - Semantic Query Engine
 * Sinónimos financieros, normalización, intent clustering, query rewriting.
 */
const SYNONYMS = {
  utilidad: ["ganancia","beneficio","profit","resultado"],
  ventas: ["facturacion","ingresos","ingreso bruto","sales"],
  compras: ["adquisiciones","gastos compras","purchases"],
  igv: ["iva","impuesto","tax"],
  clientes: ["customers","compradores"],
  proveedores: ["suppliers","vendors","acreedores"],
  cuentas_por_pagar: ["debe","cxp","pagar","deudas"],
  cuentas_por_cobrar: ["cxc","cobrar","por cobrar"],
  margen: ["margin","ganancia bruta"],
  inventario: ["stock","existencias","almacen"],
};

function createSemanticEngine({ extra = {} } = {}) {
  const map = { ...SYNONYMS, ...extra };
  const reverse = new Map();
  for (const [canon, syns] of Object.entries(map)) {
    reverse.set(canon, canon);
    for (const s of syns) reverse.set(s.toLowerCase(), canon);
  }

  function normalize(text) {
    return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  }

  function rewrite(text) {
    const tokens = normalize(text);
    const rewritten = tokens.map((t) => reverse.get(t) || t);
    return { tokens, rewritten, query: rewritten.join(" ") };
  }

  /** Cluster por intent dominante. */
  function classify(text) {
    const { rewritten } = rewrite(text);
    const counts = {};
    for (const t of rewritten) if (Object.prototype.hasOwnProperty.call(map, t)) counts[t] = (counts[t] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { intent: top[0]?.[0] || "unknown", scores: counts };
  }

  /** Agrupa queries similares por intent. */
  function cluster(queries) {
    const groups = new Map();
    for (const q of queries) {
      const { intent } = classify(q);
      if (!groups.has(intent)) groups.set(intent, []);
      groups.get(intent).push(q);
    }
    return Object.fromEntries(groups);
  }

  return { normalize, rewrite, classify, cluster, synonyms: map };
}

module.exports = { createSemanticEngine, SYNONYMS };
