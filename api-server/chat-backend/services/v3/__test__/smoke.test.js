// Smoke test rápido — `node smoke.test.js`
"use strict";
const { createEngineV3 } = require("../engine.v3");

(async () => {
  const engine = createEngineV3({
    catalog: {
      products:  ["Coca Cola","Inca Kola"],
      clients:   ["Acme SAC"],
      providers: ["Distribuidora Andina"],
    },
  });

  const cases = [
    "ver proveedores",
    "lista proveedores",
    "mostrar proveedores",
    "ventas productos",                // ambigua
    "ventas de Coca Cola en Lima del primer trimestre 2026",
    "cuánto vendí el mes pasado",
    "IGV del mes",
    "utilidad del año",
    "últimos 7 días de compras",
    "ytd ventas",
  ];

  for (const q of cases) {
    const r = await engine.ask(q, { sessionId: "test" });
    console.log("\nQ:", q);
    console.log(JSON.stringify(r, null, 2));
  }
})();
