# v6 - Capa Enterprise Avanzada

Extiende v5 con consistencia transaccional, event-driven, memoria por cliente,
KPI engine, executor seguro de SQL, validación de datos, auditoría financiera
y queue/batching.

## Módulos

| Módulo | Propósito |
|--------|-----------|
| `transaction.manager` | Simula + ejecuta atómico con rollback inteligente |
| `event.bus` | Dispara eventos (`venta.creada` → inventario, contabilidad, IGV) |
| `longterm.memory` | Memoria semántica por cliente/empresa |
| `kpi.engine` | Utilidad, margen bruto, IGV neto, proyecciones |
| `tool.executor` | Ejecutor seguro de SQL con guardas |
| `data.validator` | Duplicados, faltantes, asientos descuadrados |
| `financial.audit` | Trazabilidad por asiento contable |
| `queue.system` | Cola in-process + batcher de queries |
| `engine.v6` | Orquesta todo encima de v5 |

## Uso

```js
const { createEngineV6 } = require("./services/v6");
const engineV5 = require("./services/v5").createEngineV5({ engineV4, runQuery });
const engine = createEngineV6({
  engineV5,
  runQuery,
  domainHandlers: {
    onSaleUpdateInventory: async ({ result }) => { /* ... */ },
    onSalePostAccounting:  async ({ result }) => { /* ... */ },
    onSaleCalcTax:         async ({ result }) => { /* ... */ },
  },
});

const out = await engine.handle({
  userInput: "ventas del mes",
  scope: "empresa:42",
  actor: "user:7",
});
```

## Transacción atómica

```js
await engine.tx.runAtomic([
  { sql: "UPDATE stock SET qty = qty - $1 WHERE id = $2", params: [2, 10] },
  { sql: "INSERT INTO ventas(total) VALUES ($1)",          params: [199.9] },
], { simulateFirst: true });
```

## KPI

```js
const snap = engine.kpi.snapshot({
  ventasBrutas: 11800, comprasBrutas: 5900, costoVentas: 5000, gastos: 800,
});
// snap.igv.igvNetoPorPagar, snap.margen.porcentaje, snap.neto.utilidad
```
