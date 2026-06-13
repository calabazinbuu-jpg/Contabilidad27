# Engine v4 — PRO MAX (14 capas sobre v3)

Envuelve `engine.v3` y añade control central, telemetría y robustez tipo SAP.

| # | Capa | Archivo |
|---|------|---------|
| 1 | Scoring global de decisión | `global.score.js` |
| 2 | Session memory TTL + reset + compresión | `session.memory.js` |
| 3 | Validación lógica POST-SQL | `sql.validator.js` |
| 4 | Dataset real ERP de tests | `dataset.erp.js` |
| 5 | Router inteligente de agentes por dominio | `agent.router.js` |
| 6 | Normalizador de SQL output | `sql.normalizer.js` |
| 7 | Control de errores DB + retry | `db.error.handler.js` |
| 8 | Cache de consultas (hash+session+rango) | `query.cache.js` |
| 9 | Rate limiting + debounce | `rate.limiter.js` |
| 10 | Versionado de decisiones (audit log) | `decision.versioning.js` |
| 11 | Auto-recovery (2da opción / degrade / clarify) | `auto.recovery.js` |
| 12 | Telemetría/analítica del engine | `telemetry.js` |
| 13 | Normalización lingüística (typos+sinónimos) | `linguistic.normalizer.js` |
| 14 | Confianza global + riskLevel | `global.score.js` |

## Uso

```js
const { createEngineV4 } = require("./services/v4");

const engine = createEngineV4({
  agents: { sales, tax, finance, accounting, inventory, smart },
  runQuery: (sql, params) => db.query(sql, params).then(r => r.rows),
  confirmThreshold: 0.45,
  cacheOpts: { ttlMs: 60_000 },
  rateOpts:  { maxPerSession: 60, windowMs: 60_000, debounceMs: 250 },
  decisionFile: "./logs/decisions.v4.json",
});

const out = await engine.ask("ventas de coca cola en lima Q1 2026", { sessionId: "u1" });
// out: { ok, sql, params, rows, cacheHit, confidence, riskLevel,
//        validation, delegated, dbError, needsConfirm, parsed }
```

## Smoke test

```bash
node backend/services/v4/__test__/smoke.v4.test.js
```
