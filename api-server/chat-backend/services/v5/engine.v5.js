// =============================================================
//  engine.v5.js — Orquestador ENTERPRISE
//  Envuelve engine.v4 con 15 capas v5:
//   1  Decision Engine final determinista
//   2  Adversarial test runner
//   3  Score auto-tuning
//   4  Ambigüedad semántica profunda
//   5  Query splitter multi-intent
//   6  SQL semantic validator
//   7  Knowledge graph
//   8  Smart cache (intent + entity + dateRange)
//   9  Circuit breaker
//  10  Versionado decisiones (v5 + bump version)
//  11  Human-in-the-loop
//  12  Observabilidad (tracer + heatmap)
//  13  Performance (embedding cache, lazy)
//  14  Security hardening (SQLi + prompt injection)
//  15  Self-diagnosis
// =============================================================
"use strict";

const { createEngineV4 }     = require("../v4/engine.v4");
const { DecisionLog }        = require("../v4/decision.versioning");

const { decide }             = require("./decision.engine");
const ambiguityDeep          = require("./ambiguity.deep");
const querySplitter          = require("./query.splitter");
const sqlSemValidator        = require("./sql.semantic.validator");
const { graph }              = require("./knowledge.graph");
const { SmartCache }         = require("./smart.cache");
const { CircuitBreaker }     = require("./circuit.breaker");
const { buildClarification } = require("./human.loop");
const { Tracer }             = require("./observability");
const { EmbeddingCache }     = require("./performance");
const security               = require("./security.hardening");
const { createAutoTuner }    = require("./score.autotuner");
const selfDiag               = require("./self.diagnosis");

function createEngineV5(opts = {}) {
  const base       = opts.engineV4 || createEngineV4(opts);
  const smartCache = opts.smartCache || new SmartCache(opts.smartCacheOpts || {});
  const breaker    = opts.breaker || new CircuitBreaker(opts.breakerOpts || {});
  const tracer     = opts.tracer  || new Tracer();
  const embCache   = opts.embCache || new EmbeddingCache();
  const tuner      = opts.tuner   || createAutoTuner();
  const log        = opts.decisionLog || new DecisionLog({
    filePath: opts.decisionFile || null, version: "v5",
  });

  const decideOpts = opts.decideOpts || {};

  async function ask(rawText, askOpts = {}) {
    const sessionId = askOpts.sessionId || "_anon";
    const t = tracer.start(askOpts.requestId, rawText);

    // 14) Security hardening: input
    const secSpan = t.span("security.inspect");
    const sec = security.inspect(rawText);
    secSpan.end();
    if (!sec.safe) {
      const trace = t.finish({ blocked: true, reason: "security" });
      return {
        ok: false,
        blocked: true,
        security: sec,
        decision: { action: "FALLBACK", reason: "security_block" },
        traceId: trace.id,
      };
    }
    const cleanText = sec.clean;

    // 4) Deep ambiguity
    const ambSpan = t.span("ambiguity.deep");
    const ambEarly = ambiguityDeep.analyze(cleanText, {});
    ambSpan.end();

    // 5) Query splitting si hay intent híbrido
    if (ambEarly.shouldSplit) {
      const splitSpan = t.span("query.split");
      const multi = await querySplitter.executeMulti(cleanText, base, askOpts);
      splitSpan.end();
      if (multi) {
        const trace = t.finish({ split: true });
        return {
          ok: true,
          split: true,
          subqueries: multi.subqueries,
          results: multi.results,
          ambiguity: ambEarly,
          decision: { action: "EXECUTE", reason: "split_multi_intent" },
          traceId: trace.id,
        };
      }
    }

    // 9) Circuit breaker por intent (chequeo previo)
    // (se setea más abajo con r.parsed.intent — aquí solo logueamos)

    // Pasar a v4
    const v4Span = t.span("engine.v4.ask");
    let r;
    try {
      r = await base.ask(cleanText, askOpts);
    } catch (e) {
      t.error("engine.v4", e);
      v4Span.end();
      const trace = t.finish({ error: true });
      return { ok: false, error: e.message, traceId: trace.id };
    }
    v4Span.end();

    // 4) Re-evaluar ambigüedad ahora con parsed
    const amb = ambiguityDeep.analyze(cleanText, r.parsed || {});

    // 8) Smart cache
    const cacheMeta = {
      intent: r.parsed?.intent,
      table:  r.parsed?.table,
      entities: r.parsed?.entities,
      dateRange: r.parsed?.dateRange,
      sessionId,
      scope: askOpts.scope,
    };
    let cacheHit = false;
    if (r.sql) {
      const cached = smartCache.get(cacheMeta);
      if (cached) {
        r.rows = cached;
        cacheHit = true;
      }
    }

    // 6) SQL semantic validator
    let semantic = null;
    if (r.sql) {
      const semSpan = t.span("sql.semantic");
      semantic = sqlSemValidator.validate({
        sql: r.sql,
        plan: { table: r.parsed?.table },
        schemaColumns: opts.schemaColumns || null,
      });
      semSpan.end();
      if (!semantic.ok) {
        t.error("sql.semantic", { message: semantic.errors.join("; ") });
      }
    }

    // 1) Decision Engine final
    const confidence = r.confidence ?? r.parsed?.global?.confidence ?? 0;
    const decision = decide({
      confidence,
      ambiguity: amb.ambiguity,
      riskLevel: (semantic && !semantic.ok) ? "critical" : (r.riskLevel || "medium"),
      hasSql: !!r.sql,
    }, decideOpts);

    // 11) Human-in-the-loop
    let clarification = null;
    if (decision.action === "ASK_USER") {
      clarification = buildClarification(r.parsed || {}, amb);
    }

    // 9) Circuit breaker registro
    const bkey = `intent:${r.parsed?.intent || "unknown"}`;
    if (breaker.isOpen(bkey)) {
      decision.action = "FALLBACK";
      decision.reason = "circuit_open";
    } else {
      breaker.record(bkey, !!r.ok && !!r.sql && (!semantic || semantic.ok));
    }

    // 3 + 7) Learning loop: registrar resultado
    const tunerKey = r.parsed?.table || r.parsed?.intent || "unknown";
    tuner.record(tunerKey, !(r.ok && r.sql && (!semantic || semantic.ok)));

    // Cache set (solo si pudimos ejecutar)
    if (r.sql && r.rows && !cacheHit && decision.action === "EXECUTE") {
      smartCache.set(cacheMeta, r.rows);
    }

    // 10) Decision log v5
    log.record({
      input: rawText,
      clean: cleanText,
      intent: r.parsed?.intent,
      table: r.parsed?.table,
      sql: r.sql,
      params: r.params,
      confidence,
      ambiguity: amb.ambiguity,
      decision,
      semantic: semantic ? { ok: semantic.ok, warnings: semantic.warnings, errors: semantic.errors } : null,
      cacheHit,
    });

    const trace = t.finish({
      decision: decision.action,
      confidence,
      ambiguity: amb.ambiguity,
    });

    return {
      ok: decision.action === "EXECUTE" && !!r.sql && (!semantic || semantic.ok),
      decision,
      parsed: r.parsed,
      sql: r.sql,
      params: r.params,
      rows: r.rows,
      cacheHit,
      confidence,
      riskLevel: r.riskLevel,
      ambiguity: amb,
      semantic,
      clarification,
      delegated: r.delegated,
      security: sec,
      traceId: trace.id,
    };
  }

  function feedback(payload) {
    if (payload && payload.errorKey) tuner.record(payload.errorKey, !!payload.isError);
    return base.feedback(payload);
  }

  async function runAdversarialSuite() {
    const adv = require("./adversarial.tests");
    return adv.runAdversarial({ ask });
  }

  function selfDiagnose() {
    return selfDiag.diagnose({ tuner, breaker, tracer });
  }

  return {
    ask, feedback,
    runAdversarialSuite, selfDiagnose,
    base, smartCache, breaker, tracer, embCache, tuner, log, graph,
    _v4: base,
  };
}

module.exports = { createEngineV5 };
