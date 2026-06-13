// =============================================================
//  Smoke test v4 — verifica las 14 capas mínimas
// =============================================================
"use strict";

const { createEngineV4 } = require("../engine.v4");
const { runDataset }     = require("../dataset.erp");
const { normalizeText }  = require("../linguistic.normalizer");

(async () => {
  const fakeAgents = {
    finance: { handle: async () => ({ msg:"financial agent" }) },
    tax:     { handle: async () => ({ msg:"tax agent" }) },
    accounting: { handle: async () => ({ msg:"accounting agent" }) },
    smart:   { handle: async () => ({ msg:"smart agent" }) },
  };
  const engine = createEngineV4({
    agents: fakeAgents,
    runQuery: async (sql) => [{ ok:true, sql }],
    rateOpts: { maxPerSession: 1000, windowMs: 60_000, debounceMs: 0 },
  });


  // Capa 13: normalización lingüística
  console.log("[13] norm:", normalizeText("Proveedoressss del MES PASADO"));

  // Capa 1 + 14: scoring global
  const r1 = await engine.ask("lista de proveedores", { sessionId: "s1" });
  console.log("[1+14] proveedores:", r1.parsed.table, "conf=", r1.confidence, "risk=", r1.riskLevel);

  // Capa 2: memoria de sesión TTL
  const r2 = await engine.ask("ahora muéstrame los activos", { sessionId: "s1" });
  console.log("[2] ctx table:", r2.parsed.table);

  // Capa 3 + 6: SQL validation + normalizer
  console.log("[6] SQL normalizado:", r1.sql);
  console.log("[3] validation:", r1.validation);

  // Capa 5: agent router
  const r3 = await engine.ask("calcula el IGV de abril", { sessionId: "s2" });
  console.log("[5] delegated agent:", r3.delegated?.agent);

  // Capa 8: cache
  const r4a = await engine.ask("lista de proveedores", { sessionId: "s3" });
  const r4b = await engine.ask("lista de proveedores", { sessionId: "s3" });
  console.log("[8] cacheHit second time:", r4b.cacheHit);

  // Capa 9: rate limit
  const lim = require("../rate.limiter").createLimiter({ maxPerSession: 2, windowMs: 1000, debounceMs: 0 });
  console.log("[9] rl:", lim.check("x"), lim.check("x"), lim.check("x"));

  // Capa 4: dataset
  const ds = await runDataset(engine);
  console.log("[4] dataset rate:", ds.rate, `(${ds.passed}/${ds.total})`);

  // Capa 12: telemetría
  console.log("[12] telemetry:", engine.telemetry.snapshot());

  // Capa 10: decisión log
  console.log("[10] decisions logged:", engine.log.recent(1).length);

  console.log("\n✅ v4 smoke OK");
})().catch(e => { console.error("❌", e); process.exit(1); });
