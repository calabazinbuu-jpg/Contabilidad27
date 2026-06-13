"use strict";
/* Smoke tests v6 - sin framework, ejecutable con `node smoke.v6.test.js` */

const assert = require("assert");
const {
  createEngineV6,
  createTransactionManager,
  createEventBus,
  createLongTermMemory,
  createKpiEngine,
  createToolExecutor,
  createDataValidator,
  createFinancialAudit,
  createQueue,
  createBatcher,
} = require("..");

function fakeRunner() {
  const log = [];
  return {
    log,
    run: async (sql, params = []) => {
      log.push({ sql, params });
      if (/^EXPLAIN/i.test(sql)) return { rows: [{ plan: "ok" }] };
      if (/^BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { ok: true };
      if (/^SELECT/i.test(sql)) return { rows: [{ x: 1 }], rowCount: 1 };
      if (/^INSERT|UPDATE|DELETE/i.test(sql)) return { rowCount: 1 };
      return { rows: [] };
    },
  };
}

(async () => {
  // 1. Transaction manager
  const r1 = fakeRunner();
  const tx = createTransactionManager({ runQuery: r1.run });
  const txRes = await tx.runAtomic(
    [{ sql: "UPDATE t SET a=1 WHERE id=$1", params: [1] }, { sql: "INSERT INTO t(a) VALUES($1)", params: [2] }],
    { simulateFirst: true }
  );
  assert.strictEqual(txRes.ok, true, "tx atomic should succeed");
  assert.ok(r1.log.some((e) => e.sql === "COMMIT"));

  // 2. Event bus
  const bus = createEventBus();
  let calls = 0;
  bus.on("venta.creada", async () => { calls++; }, { name: "inv" });
  bus.on("venta.creada", async () => { calls++; }, { name: "acc" });
  const ev = await bus.emit("venta.creada", { id: 1 });
  assert.strictEqual(ev.dispatched, 2);
  assert.strictEqual(calls, 2);

  // 3. Long term memory
  const ltm = createLongTermMemory();
  await ltm.record("emp:1", { query: "ventas del mes", intent: "ventas" });
  await ltm.record("emp:1", { query: "ventas de junio", intent: "ventas" });
  const recalled = await ltm.recall("emp:1", "ventas mes", { minScore: 0.1 });
  assert.ok(recalled.length >= 1, "should recall similar");
  const prefs = await ltm.preferences("emp:1");
  assert.strictEqual(prefs[0].intent, "ventas");

  // 4. KPI engine
  const kpi = createKpiEngine();
  const igv = kpi.igvBreakdown({ ventasBrutas: 1180, comprasBrutas: 590 });
  assert.ok(Math.abs(igv.igvVentas - 180) < 0.01, "IGV ventas ~180");
  assert.ok(Math.abs(igv.igvNetoPorPagar - 90) < 0.01, "IGV neto ~90");
  const proj = kpi.linearProjection([10, 20, 30, 40], 2);
  assert.ok(proj[0] > 40, "projection should grow");

  // 5. Tool executor
  const r2 = fakeRunner();
  const exec = createToolExecutor({ runQuery: r2.run, maxRowsAffected: 100 });
  const wr = await exec.execute("UPDATE t SET a=1", [], { simulateFirst: true });
  assert.strictEqual(wr.ok, true);
  const ddl = await exec.execute("DROP TABLE t", []);
  assert.strictEqual(ddl.ok, false, "DDL must be blocked by default");

  // 6. Data validator
  const dv = createDataValidator();
  const dupes = dv.findDuplicates([{ id: 1 }, { id: 1 }, { id: 2 }], ["id"]);
  assert.strictEqual(dupes.length, 1);
  const unb = dv.findUnbalancedEntries([
    { asiento_id: "A1", debe: 100, haber: 100 },
    { asiento_id: "A2", debe: 100, haber: 80 },
  ]);
  assert.strictEqual(unb.length, 1);
  const inc = dv.findInconsistentTotals(
    [{ id: 1, total: 100 }, { id: 2, total: 50 }],
    [{ venta_id: 1, cantidad: 2, precio: 50 }, { venta_id: 2, cantidad: 1, precio: 40 }]
  );
  assert.strictEqual(inc.length, 1);

  // 7. Financial audit
  const audit = createFinancialAudit();
  await audit.record({ actor: "u1", action: "update", entity: "venta", entityId: "v9", before: { total: 100 }, after: { total: 120 }, reason: "ajuste" });
  const q = await audit.query({ entity: "venta" });
  assert.strictEqual(q.length, 1);
  assert.deepStrictEqual(q[0].diff.total, { from: 100, to: 120 });

  // 8. Queue + batcher
  const queue = createQueue({ concurrency: 2 });
  let done = 0;
  queue.process("ping", async () => { done++; });
  for (let i = 0; i < 5; i++) queue.add("ping", { i });
  await queue.drain();
  assert.strictEqual(done, 5);

  const r3 = fakeRunner();
  const batch = createBatcher({ runQuery: r3.run, windowMs: 10 });
  const results = await Promise.all([
    batch.enqueue("SELECT 1", []),
    batch.enqueue("SELECT 1", []),
    batch.enqueue("SELECT 1", []),
  ]);
  assert.strictEqual(results.length, 3);

  // 9. End-to-end engine.v6 (sin v5)
  const r4 = fakeRunner();
  const engine = createEngineV6({ runQuery: r4.run });
  const out = await engine.handle({ userInput: "ventas del mes", scope: "emp:1", actor: "u1" });
  assert.ok(out.action);
  const auditEntries = await engine.audit.query({});
  assert.ok(auditEntries.length >= 1);

  console.log("v6 smoke tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
