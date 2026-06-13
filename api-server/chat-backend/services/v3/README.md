# Engine V3 — Capas PRO

Este módulo añade 10 capas sobre el engine anterior, sin romper nada existente.
Todo vive en `backend/services/v3/` y se importa así:

```js
const { createEngineV3 } = require("./services/v3");

const engine = createEngineV3({
  // catálogos opcionales para extracción de entidades
  catalog: {
    products:  ["Coca Cola","Inca Kola","Pan Bimbo"],
    clients:   ["Acme SAC","Comercial Lima"],
    providers: ["Distribuidora Andina","Backus"],
  },
  // archivo para persistir feedback de auto-aprendizaje
  learningFile: "./data/learning.json",
  // registro de agentes para fallback
  agents: {
    "financial.agent": require("../agents/financial.agent"),
    "ventas.agent":    require("../agents/ventas.agent"),
    // ...
  },
});

// Uso:
const r = await engine.ask("ventas de coca cola del primer trimestre en Lima", { sessionId: "u1" });
// r = { ok, parsed:{intent,table,entities,dateRange,filters,explain}, sql, params, error?, delegated? }
```

## Capas

| # | Archivo                       | Capa                              |
|---|-------------------------------|-----------------------------------|
| 1 | `intent.normalizer.js`        | Normalización de intención        |
| 2 | `ambiguity.detector.js`       | Control de ambigüedad             |
| 3 | `context.memory.js`           | Memoria de contexto               |
| 4 | `entity.extractor.js`         | Detector de entidades             |
| 5 | `date.normalizer.pro.js`      | Fechas avanzadas (Q1, YTD, …)     |
| 6 | `filter.builder.js`           | Filtros estructurados             |
| 7 | `sql.security.js`             | Seguridad SQL (whitelist)         |
| 8 | `explainability.js`           | Explainability formal             |
| 9 | `agent.fallback.js`           | Fallback inteligente a agentes    |
| 10| `learning.feedback.js`        | Auto-mejora / feedback loop       |

## API

- `engine.parse(text, { sessionId })` → estructura parsed (sin ejecutar SQL)
- `engine.plan(parsed)` → plan estructurado
- `engine.toSql(parsed)` → `{ sql, params }` parametrizado y validado
- `engine.ask(text, { sessionId })` → flujo completo (parse → sql / fallback)
- `engine.feedback({ input, wrongTable, correctTable, wrongIntent, correctIntent })`

## Salidas

### Ambigua
```json
{
  "ok": false,
  "parsed": {
    "fallback": true,
    "motivo": "AMBIGUOUS_QUERY",
    "candidates": [
      { "table": "ventas", "score": 6.2 },
      { "table": "facturas", "score": 6.0 }
    ]
  }
}
```

### OK
```json
{
  "ok": true,
  "parsed": {
    "intent": "SELECT_LIST",
    "table": "ventas",
    "entities": [{ "type":"PRODUCT","value":"Coca Cola" },{ "type":"CITY","value":"lima" }],
    "dateRange": { "tipo":"Q1_2026", "desdeYmd":"2026-01-01", "hastaYmd":"2026-03-31" },
    "filters": { "date":{...}, "producto":"coca cola", "ciudad":"lima" },
    "explain": {
      "table":"ventas","score":7.2,"decision":"SELECT_LIST",
      "why":["keyword match: ventas (+3)","intent SELECT_LIST (+2)","entity PRODUCT=coca cola (+1)","priority boost (+1.6)"]
    }
  },
  "sql": "SELECT * FROM \"ventas\" WHERE \"fecha\" BETWEEN $1 AND $2 AND \"producto\" = $3 AND \"ciudad\" = $4 ORDER BY \"fecha\" DESC LIMIT 100",
  "params": ["2026-01-01","2026-03-31","coca cola","lima"]
}
```
