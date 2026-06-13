# v7 - Capa Perfect Enterprise

Añade sobre v6 las 19 capacidades enterprise solicitadas.

## Módulos

| # | Módulo | Propósito |
|---|--------|-----------|
| 1  | `multi.tenant`         | Aislamiento por tenant (columna o schema) |
| 2  | `distributed.bus`      | Bus distribuido (Redis Streams/Kafka via driver) |
| 3  | `dashboard.engine`     | KPIs en vivo + streaming de cambios |
| 4  | `financial.acl`        | RBAC por módulo y por campo (IGV, utilidad, margen) |
| 5  | `data.warehouse`       | ETL, SCD Type 2, snapshots diarios, versioning |
| 6  | `semantic.engine`      | Sinónimos, normalización, intent clustering, rewriting |
| 7  | `sql.optimizer`        | Index advisor, slow log, rewrite heurístico |
| 8  | `accounting.engine`    | Partida doble (debe = haber), asientos automáticos |
| 9  | `reconciliation.engine`| Conciliación bancaria, pagos↔facturas |
| 10 | `forecast.engine`      | Forecast lineal, estacionalidad, cashflow |
| 11 | `compliance.engine`    | RUC/DNI Perú, validación de factura electrónica |
| 12 | `observability.pro`    | Tracer estilo OpenTelemetry, SLA, heatmap |
| 13 | `agent.team`           | Agentes contable, tributario, financiero, inventario |
| 14 | `document.engine`      | Plantillas dinámicas (factura, libro diario) |
| 15 | `realtime.hub`         | Pub/sub WebSocket-friendly |
| 16 | `storage.router`       | Router OLTP/OLAP + cold storage gzip |
| 17 | `advanced.security`    | Field-RBAC, AES-256-GCM, audit hash-chained |
| 18 | `self.healing`         | Reparación de totales, rebalanceo de asientos, safeRun |
| 19 | `api.ecosystem`        | Versionado API, integraciones externas, webhooks salientes |

## Uso mínimo

```js
const { createEngineV6 } = require("./services/v6");
const { createEngineV7, withTenant } = require("./services/v7");

const engineV6 = createEngineV6({ runQuery });
const engine   = createEngineV7({ engineV6, runQuery, country: "PE" });

await withTenant({ id: "empresa-42" }, async () => {
  const out = await engine.handle({
    userInput: "ganancia del mes",
    user: { roles: ["gerencia"] },
    scope: "empresa-42",
    actor: "user-7",
    context: { snapshot: { ventasBrutas: 11800, comprasBrutas: 5900, costoVentas: 5000, gastos: 800 } },
  });
});
```

## Partida doble

```js
const a = engine.accounting.generate("venta.creada", { total: 1180, igv: 180 });
// a.balanced === true; a.asiento === [{cuenta:"1212_cobrar",...}, ...]
```

## Compliance SUNAT

```js
engine.compliance.validateRuc("20123456789");
engine.compliance.validateInvoice({ serie:"F001", correlativo:"123", emisor:{ruc:"20..."}, items:[...] });
```

## Tamper-proof audit

```js
engine.tamperLog.append({ actor:"u1", action:"update" });
engine.tamperLog.verify(); // { ok:true, length:N }
```
