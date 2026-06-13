"use strict";
/* Smoke tests v7 */
const assert = require("assert");
const v7 = require("..");

function fakeRunner() {
  const log = [];
  return { log, run: async (sql, params = []) => { log.push({ sql, params });
    if (/^EXPLAIN/i.test(sql)) return { rows: [{}] };
    if (/^BEGIN|COMMIT|ROLLBACK|SET\s/i.test(sql)) return { ok: true };
    if (/^SELECT/i.test(sql)) return { rows: [{ x: 1 }], rowCount: 1 };
    return { rowCount: 1 };
  } };
}

(async () => {
  // 1. multi-tenant
  const r1 = fakeRunner();
  const tRun = v7.createTenantRunner({ runQuery: r1.run });
  await v7.withTenant({ id: "T1" }, async () => { await tRun("SELECT * FROM ventas", []); });
  const lastSql = r1.log[r1.log.length - 1].sql;
  assert.ok(/tenant_id\s*=\s*\$1/.test(lastSql), "injects tenant filter: " + lastSql);

  // 2. financial acl
  const acl = v7.createFinancialAcl();
  assert.strictEqual(acl.can({ roles: ["vendedor"] }, "read", { field: "utilidad" }), false);
  assert.strictEqual(acl.can({ roles: ["gerencia"] }, "read", { field: "utilidad" }), true);
  const redacted = acl.redact({ roles: ["vendedor"] }, { nombre: "x", utilidad: 100, igv: 10 }, ["utilidad","igv"]);
  assert.strictEqual(redacted.utilidad, undefined);

  // 3. semantic
  const sem = v7.createSemanticEngine();
  const rw = sem.rewrite("dame la ganancia del mes");
  assert.ok(rw.rewritten.includes("utilidad"), "ganancia→utilidad");
  assert.strictEqual(sem.classify("ventas e iva").intent === "ventas" || sem.classify("ventas e iva").intent === "igv", true);

  // 4. accounting
  const acc = v7.createAccounting();
  const g = acc.generate("venta.creada", { total: 1180, igv: 180 });
  assert.strictEqual(g.balanced, true);
  assert.strictEqual(acc.validate([{debe:100,haber:80}]).balanced, false);

  // 5. compliance
  assert.strictEqual(v7.validateRucPeru("20100070970").ok, true);
  assert.strictEqual(v7.validateRucPeru("12345678901").ok, false);
  assert.strictEqual(v7.validateDniPeru("12345678").ok, true);

  // 6. reconciliation
  const rec = v7.createReconciliation();
  const m = rec.matchOneToOne(
    [{ monto: 100, fecha: "2025-01-01", ref: "A" }],
    [{ monto: 100, fecha: "2025-01-02", ref: "A" }],
    { leftRef: "ref", rightRef: "ref" }
  );
  assert.strictEqual(m.matches.length, 1);

  // 7. forecast
  const fc = v7.forecast([10, 20, 30, 40], 2);
  assert.ok(fc[0] > 40 && fc[1] > fc[0]);
  const cf = v7.cashflowForecast({ ingresosSerie: [100,110,120], egresosSerie: [50,60,70], saldoInicial: 0, periods: 2 });
  assert.strictEqual(cf.length, 2);

  // 8. sql optimizer
  const opt = v7.createSqlOptimizer({ runQuery: fakeRunner().run, slowMs: 0 });
  const issues = opt.analyze("SELECT * FROM ventas WHERE cliente_id = 1");
  assert.ok(issues.length >= 2);
  const rewritten = opt.rewrite("SELECT a FROM t");
  assert.ok(/LIMIT/.test(rewritten));

  // 9. observability
  const tr = v7.createTracer({ slaMs: 1 });
  await tr.withSpan("op", async () => new Promise((r) => setTimeout(r, 5)));
  assert.ok(tr.slaReport().violations >= 1);

  // 10. crypto + tamper log
  const c = v7.createCrypto({ key: "0123456789abcdef0123456789abcdef" });
  const enc = c.encrypt("hola"); assert.strictEqual(c.decrypt(enc), "hola");
  const tl = v7.createTamperProofLog();
  tl.append({ a: 1 }); tl.append({ a: 2 });
  assert.strictEqual(tl.verify().ok, true);
  tl.chain[0].entry.a = 999;
  assert.strictEqual(tl.verify().ok, false);

  // 11. document engine
  const de = v7.createDocumentEngine();
  const html = de.renderHtml("factura", { serie:"F001", correlativo:"1", emisor:{nombre:"X",ruc:"20..."}, cliente:{nombre:"Y"}, items:[{descripcion:"a",cantidad:1,precio:10,total:10}], subtotal:10, igv:1.8, total:11.8 });
  assert.ok(html.includes("Factura F001-1") && html.includes("<td>a</td>"));

  // 12. realtime hub
  const hub = v7.createRealtimeHub();
  let got = null; hub.subscribe("ch1", (m) => { got = m; });
  hub.publish("ch1", { hello: 1 });
  assert.strictEqual(got.event.hello, 1);

  // 13. dashboard engine
  const dash = v7.createDashboardEngine({ intervalMs: 9999 });
  dash.register("ventas", async () => 42);
  await dash.tick();
  assert.strictEqual(dash.snapshot().ventas, 42);

  // 14. agent team
  const team = v7.createAgentTeam({ semantic: sem });
  const route = team.route("dame el igv del mes");
  assert.strictEqual(route, "tributario");

  // 15. self healing
  const dv = require("../../v6").createDataValidator();
  const heal = v7.createSelfHealing({ runQuery: async () => ({}), validator: dv, accounting: acc });
  const fixed = heal.rebalanceEntry([{cuenta:"x",debe:100,haber:0},{cuenta:"y",debe:0,haber:80}]);
  assert.strictEqual(acc.validate(fixed).balanced, true);

  // 16. api ecosystem
  const wh = v7.createOutboundWebhooks({ secret: "s" });
  const sig = wh.sign("body"); assert.strictEqual(sig.length, 64);
  const ver = v7.createApiVersionRouter();
  ver.register("v1", { hello: () => "hi" });
  assert.strictEqual(ver.handle("v1", "hello"), "hi");

  // 17. storage router
  const sr = v7.createStorageRouter({ oltp: async () => "oltp", olap: async () => "olap" });
  assert.strictEqual(await sr.query("SELECT SUM(x) FROM t GROUP BY y"), "olap");
  assert.strictEqual(await sr.query("SELECT * FROM t WHERE id=1"), "oltp");

  // 18. data warehouse versioning
  const wh2 = v7.createDataWarehouse({ runQuery: async () => ({}) });
  wh2.snapshotVersion("venta","1",{ total: 100 });
  wh2.snapshotVersion("venta","1",{ total: 120 });
  assert.strictEqual(wh2.getVersions("venta","1").length, 2);

  // 19. engine.v7 end-to-end
  const r3 = fakeRunner();
  const engine = v7.createEngineV7({ runQuery: r3.run });
  const out = await v7.withTenant({ id: "T2" }, () => engine.handle({ userInput: "ganancia del mes", scope: "T2", actor: "u1", context: { snapshot: { ventasBrutas: 1180, comprasBrutas: 590, costoVentas: 500, gastos: 100 } } }));
  assert.ok(out.semantic && out.agent && out.traceId);
  assert.strictEqual(engine.tamperLog.verify().ok, true);

  console.log("v7 smoke tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
