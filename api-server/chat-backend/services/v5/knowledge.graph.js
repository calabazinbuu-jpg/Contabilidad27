// =============================================================
//  v5 — Layer 7: Knowledge Graph (relaciones reales del ERP)
// =============================================================
"use strict";

// edges: tabla -> tabla (vía columna)
const EDGES = [
  ["ventas",       "clientes",     "cliente_id"],
  ["ventas",       "productos",    "producto_id"],
  ["ventas",       "facturas",     "venta_id"],
  ["facturas",     "clientes",     "cliente_id"],
  ["compras",      "proveedores",  "proveedor_id"],
  ["compras",      "productos",    "producto_id"],
  ["inventario",   "productos",    "producto_id"],
  ["movimientos",  "productos",    "producto_id"],
  ["asientos",     "cuentas",      "cuenta_id"],
  ["pagos",        "facturas",     "factura_id"],
  ["pagos",        "clientes",     "cliente_id"],
];

class KnowledgeGraph {
  constructor(edges = EDGES) {
    this.adj = new Map();
    for (const [a, b, col] of edges) {
      this._add(a, b, col);
      this._add(b, a, col);
    }
  }
  _add(a, b, col) {
    if (!this.adj.has(a)) this.adj.set(a, new Map());
    this.adj.get(a).set(b, col);
  }
  canJoin(a, b) {
    a = String(a || "").toLowerCase();
    b = String(b || "").toLowerCase();
    return a === b || (this.adj.get(a)?.has(b) ?? false);
  }
  joinColumn(a, b) {
    return this.adj.get(a)?.get(b) || null;
  }
  /** path entre dos tablas (BFS). */
  path(from, to) {
    if (from === to) return [from];
    const q = [[from]]; const seen = new Set([from]);
    while (q.length) {
      const p = q.shift();
      const last = p[p.length - 1];
      const neigh = this.adj.get(last);
      if (!neigh) continue;
      for (const n of neigh.keys()) {
        if (seen.has(n)) continue;
        const np = [...p, n];
        if (n === to) return np;
        seen.add(n); q.push(np);
      }
    }
    return null;
  }
  related(a) { return Array.from(this.adj.get(a)?.keys() || []); }
}

const graph = new KnowledgeGraph();

module.exports = { KnowledgeGraph, graph, EDGES };
