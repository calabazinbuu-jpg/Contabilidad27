# Engine v5 — ENTERPRISE

15 capas que llevan el motor de ~73% a 95%+ de precisión y lo blindan a nivel producción.

| # | Módulo | Función |
|---|--------|---------|
| 1 | `decision.engine.js` | Cierre determinista: EXECUTE / ASK_USER / CONFIRM / FALLBACK |
| 2 | `adversarial.tests.js` | Dataset adversarial (vaguedad, multi-dominio, typos, inyección) |
| 3 | `score.autotuner.js` | Auto-ajuste de pesos de scoring por error_rate |
| 4 | `ambiguity.deep.js` | Ambigüedad semántica profunda + multi-dominio |
| 5 | `query.splitter.js` | División de consultas híbridas en sub-queries |
| 6 | `sql.semantic.validator.js` | Validación lógica de SQL (cols/joins/agregados) |
| 7 | `knowledge.graph.js` | Grafo de relaciones reales del ERP |
| 8 | `smart.cache.js` | Cache por intent + entidad + rango de fechas |
| 9 | `circuit.breaker.js` | Aislamiento de agentes/módulos defectuosos |
| 10 | (reusa v4 `decision.versioning`) | Versionado de decisiones v5 |
| 11 | `human.loop.js` | Generación de preguntas de aclaración |
| 12 | `observability.js` | Tracer por request, perf por módulo, heatmap |
| 13 | `performance.js` | Embedding cache LRU, lazy eval, fast hash |
| 14 | `security.hardening.js` | SQL injection + prompt injection + sanitización |
| 15 | `self.diagnosis.js` | Auto-diagnóstico y recomendaciones |

## Uso

```js
const { createEngineV5 } = require("./services/v5");

const engine = createEngineV5({
  runQuery: async (sql, params) => db.query(sql, params),
});

const r = await engine.ask("ventas del mes", { sessionId: "u123" });

if (r.decision.action === "EXECUTE") console.log(r.rows);
else if (r.decision.action === "ASK_USER") console.log(r.clarification.ask);
```

## Tests

```bash
node backend/services/v5/__test__/smoke.v5.test.js
```

## Adversarial suite

```js
const report = await engine.runAdversarialSuite();
console.log(report.accuracy, report.passed, "/", report.total);
```

## Self-diagnosis

```js
const d = engine.selfDiagnose();
// { status: "healthy"|"degraded"|"critical", findings, recommendations }
```
