// =============================================================
//  v4 — Layer 4: Dataset de tests reales ERP
// =============================================================
"use strict";

const DATASET = [
  { input: "lista de proveedores",            expected: "proveedores" },
  { input: "ver proveedores",                 expected: "proveedores" },
  { input: "mostrar proveedores activos",     expected: "proveedores" },
  { input: "ventas del mes",                  expected: "ventas" },
  { input: "ventas de coca cola en lima",     expected: "ventas" },
  { input: "total ventas Q1 2026",            expected: "ventas" },
  { input: "compras del proveedor X",         expected: "compras" },
  { input: "facturas pendientes",             expected: "facturas" },
  { input: "stock de productos",              expected: "inventario" },
  { input: "inventario actual",               expected: "inventario" },
  { input: "clientes morosos",                expected: "clientes" },
  { input: "pagos de abril",                  expected: "pagos" },
  // Fallback / specialized agents:
  { input: "utilidad del trimestre",          expectedAgent: "financial" },
  { input: "calcula el IGV de abril",         expectedAgent: "tax" },
  { input: "reporte contable",                expectedAgent: "accounting" },
];

async function runDataset(engine) {
  const results = [];
  for (const c of DATASET) {
    const r = await engine.ask(c.input, { sessionId: "ds-"+Math.random() });
    const okTable = c.expected ? (r.parsed?.table === c.expected) : null;
    const okAgent = c.expectedAgent ? (r.delegated?.agent === c.expectedAgent) : null;
    results.push({
      input: c.input,
      expected: c.expected || c.expectedAgent,
      got: r.parsed?.table || r.delegated?.agent || null,
      pass: okTable ?? okAgent ?? false,
      confidence: r.parsed?.global?.confidence,
    });
  }
  const passed = results.filter(r=>r.pass).length;
  return { total: results.length, passed, rate: +(passed/results.length).toFixed(2), results };
}

module.exports = { DATASET, runDataset };
