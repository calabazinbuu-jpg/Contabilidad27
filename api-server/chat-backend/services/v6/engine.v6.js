"use strict";
/**
 * v6 - Engine
 * Capa que combina v5 (decisión + seguridad) con:
 *  - Transactional consistency
 *  - Event Bus
 *  - Long-term memory
 *  - KPI engine
 *  - Safe SQL executor
 *  - Data validation
 *  - Financial audit
 *  - Queue / batching
 */

const { createTransactionManager } = require("./transaction.manager");
const { createEventBus, attachErpDomain } = require("./event.bus");
const { createLongTermMemory } = require("./longterm.memory");
const { createKpiEngine } = require("./kpi.engine");
const { createToolExecutor } = require("./tool.executor");
const { createDataValidator } = require("./data.validator");
const { createFinancialAudit } = require("./financial.audit");
const { createQueue, createBatcher } = require("./queue.system");

function createEngineV6({
  engineV5,         // motor v5 ya inicializado (opcional)
  runQuery,         // función SQL real
  ltmStore,         // store opcional persistente
  auditStore,       // store opcional para auditoría
  igvRate = 0.18,
  maxRowsAffected = 5000,
  domainHandlers = {},
} = {}) {
  if (typeof runQuery !== "function") throw new Error("engine.v6: runQuery required");

  const tx = createTransactionManager({ runQuery });
  const bus = createEventBus();
  attachErpDomain(bus, domainHandlers);
  const ltm = createLongTermMemory({ store: ltmStore });
  const kpi = createKpiEngine({ igvRate });
  const audit = createFinancialAudit({ store: auditStore });
  const executor = createToolExecutor({
    runQuery,
    maxRowsAffected,
    afterExecute: async ({ sql, kind, affected }) => {
      if (kind === "write") {
        await audit.record({ actor: "system", action: "sql.write", entity: "db", reason: sql.slice(0, 120), meta: { affected } });
      }
    },
  });
  const validator = createDataValidator();
  const queue = createQueue({ name: "erp.jobs" });
  const batcher = createBatcher({ runQuery });

  /** Orquestación end-to-end: decisión v5 + ejecución segura + eventos + auditoría. */
  async function handle({ userInput, scope = "default", actor = "anon", context = {} }) {
    // 1. Decisión via v5 si está presente
    let decision;
    if (engineV5?.decide) {
      decision = await engineV5.decide({ userInput, context });
    } else {
      decision = { action: "EXECUTE", sql: null, confidence: 1, reason: "v5 not provided" };
    }

    // 2. Memoria a largo plazo: recuperar contexto previo
    const recalled = await ltm.recall(scope, userInput, { limit: 3 });

    // 3. Si no hay SQL, registrar y devolver decisión
    if (!decision.sql) {
      await ltm.record(scope, { query: userInput, intent: decision.intent, action: decision.action });
      await audit.record({ actor, action: "decision.only", entity: "engine.v6", reason: userInput, meta: { action: decision.action } });
      return { ...decision, recalled };
    }

    // 4. Ejecutar mediante executor seguro
    const exec = await executor.execute(decision.sql, decision.params || [], { simulateFirst: true });

    // 5. Auditoría + memoria
    await audit.record({
      actor, action: "query.handle", entity: "engine.v6",
      entityId: decision.intent || "n/a",
      reason: userInput, meta: { confidence: decision.confidence, ok: exec.ok },
    });
    await ltm.record(scope, { query: userInput, intent: decision.intent, action: decision.action, ok: exec.ok });

    // 6. Emitir eventos de dominio si aplica
    if (exec.ok && decision.domainEvent) {
      bus.emit(decision.domainEvent, { actor, scope, decision, result: exec.rows });
    }

    return { ...decision, execution: exec, recalled };
  }

  return {
    handle,
    tx, bus, ltm, kpi, executor, validator, audit, queue, batcher,
  };
}

module.exports = { createEngineV6 };
