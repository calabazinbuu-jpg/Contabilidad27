"use strict";
/**
 * v7 - Engine
 * Orquesta todas las capas v7 sobre v6 (que ya envuelve v5/v4).
 */
const { createTenantRunner, withTenant, requireTenant } = require("./multi.tenant");
const { createDistributedBus } = require("./distributed.bus");
const { createDashboardEngine } = require("./dashboard.engine");
const { createFinancialAcl } = require("./financial.acl");
const { createDataWarehouse } = require("./data.warehouse");
const { createSemanticEngine } = require("./semantic.engine");
const { createSqlOptimizer } = require("./sql.optimizer");
const { createAccounting } = require("./accounting.engine");
const { createReconciliation } = require("./reconciliation.engine");
const { createForecastEngine } = require("./forecast.engine");
const { createComplianceEngine } = require("./compliance.engine");
const { createTracer } = require("./observability.pro");
const { createAgentTeam } = require("./agent.team");
const { createDocumentEngine } = require("./document.engine");
const { createRealtimeHub } = require("./realtime.hub");
const { createStorageRouter } = require("./storage.router");
const { createFieldSecurity, createCrypto, createTamperProofLog } = require("./advanced.security");
const { createSelfHealing } = require("./self.healing");
const { createApiVersionRouter, createIntegrationHub, createOutboundWebhooks } = require("./api.ecosystem");

function createEngineV7({
  engineV6,
  runQuery,
  busDriver,
  encryptionKey = "0123456789abcdef0123456789abcdef",
  country = "PE",
  domainHandlers = {},
  oltp, olap, cold,
} = {}) {
  if (typeof runQuery !== "function") throw new Error("engine.v7: runQuery required");

  const tenantRun = createTenantRunner({ runQuery, mode: "column" });
  const semantic = createSemanticEngine();
  const optimizer = createSqlOptimizer({ runQuery });
  const accounting = createAccounting();
  const reconciliation = createReconciliation();
  const forecast = createForecastEngine();
  const compliance = createComplianceEngine({ country });
  const tracer = createTracer();
  const acl = createFinancialAcl();
  const fieldSec = createFieldSecurity({ acl });
  const cryptor = createCrypto({ key: encryptionKey });
  const tamperLog = createTamperProofLog();
  const warehouse = createDataWarehouse({ runQuery });
  const docs = createDocumentEngine();
  const realtime = createRealtimeHub();
  const storage = createStorageRouter({ oltp: oltp || runQuery, olap, cold });
  const bus = createDistributedBus({ backend: busDriver ? "custom" : "memory", driver: busDriver });
  const apiRouter = createApiVersionRouter();
  const integrations = createIntegrationHub();
  const webhooks = createOutboundWebhooks();
  const dashboard = createDashboardEngine({ kpi: engineV6?.kpi });
  const team = createAgentTeam({ semantic, kpi: engineV6?.kpi, accounting, compliance });
  const healer = createSelfHealing({ runQuery, validator: engineV6?.validator, accounting });

  // Cadena de auditoría a prueba de manipulación + dispatch de webhooks al emitir
  Object.entries(domainHandlers).forEach(([ev, fn]) => bus.on(ev, fn));

  async function handle({ userInput, user, scope = "default", actor = "anon", context = {} }) {
    return tracer.withSpan("engine.v7.handle", async (span) => {
      // Reescribe semánticamente
      const sem = semantic.rewrite(userInput);
      span.addEvent("semantic.rewrite", sem);

      // Auditoría tamper-proof
      tamperLog.append({ actor, query: userInput, traceId: tracer.currentTraceId() });

      // Delegar a v6 si está presente
      let v6out;
      if (engineV6?.handle) v6out = await engineV6.handle({ userInput: sem.query, scope, actor, context });

      // Agente especializado
      const agentRes = await team.dispatch(sem.query, context);

      // Streaming en tiempo real
      realtime.publish(`tenant:${scope}`, { type: "query", input: userInput, agent: agentRes.agent });

      return { semantic: sem, v6: v6out, agent: agentRes, traceId: tracer.currentTraceId() };
    }, { actor, scope });
  }

  return {
    handle,
    tenantRun, withTenant, requireTenant,
    semantic, optimizer, accounting, reconciliation, forecast, compliance,
    tracer, acl, fieldSec, cryptor, tamperLog,
    warehouse, docs, realtime, storage, bus, dashboard, team, healer,
    api: { router: apiRouter, integrations, webhooks },
  };
}

module.exports = { createEngineV7 };
