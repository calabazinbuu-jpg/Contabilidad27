// =============================================================
//  engine.v4.js — Orquestador PRO MAX
//  Envuelve engine.v3 + 14 capas v4:
//   1  Scoring global
//   2  Session memory TTL
//   3  Validación POST-SQL
//   4  Dataset ERP de tests
//   5  Router inteligente de agentes
//   6  Normalizador SQL
//   7  Control de errores DB
//   8  Cache de consultas
//   9  Rate limiting
//  10  Versionado de decisiones
//  11  Auto-recovery
//  12  Telemetría
//  13  Normalización lingüística
//  14  Confianza global + riskLevel
// =============================================================
"use strict";

const { createEngineV3 }   = require("../v3/engine.v3");
const { normalizeText }    = require("./linguistic.normalizer");
const { computeGlobalScore } = require("./global.score");
const sessionMem           = require("./session.memory");
const { validateSql }      = require("./sql.validator");
const { normalizeSql }     = require("./sql.normalizer");
const dbErr                = require("./db.error.handler");
const { QueryCache }       = require("./query.cache");
const { createLimiter }    = require("./rate.limiter");
const { DecisionLog }      = require("./decision.versioning");
const recovery             = require("./auto.recovery");
const { createTelemetry }  = require("./telemetry");
const agentRouter          = require("./agent.router");

function createEngineV4(opts = {}) {
  const base       = opts.engineV3 || createEngineV3(opts);
  const cache      = opts.cache || new QueryCache(opts.cacheOpts || {});
  const limiter    = opts.limiter || createLimiter(opts.rateOpts || {});
  const log        = opts.decisionLog || new DecisionLog({
    filePath: opts.decisionFile || null, version: "v4",
  });
  const telemetry  = opts.telemetry || createTelemetry();
  const agents     = opts.agents || {};
  const autoExec   = opts.runQuery || null; // (sql, params) => Promise<rows>
  const confirmThreshold = opts.confirmThreshold ?? 0.45;

  async function ask(rawText, askOpts = {}) {
    const sessionId = askOpts.sessionId || "_anon";

    // 9) Rate limit
    const rl = limiter.check(sessionId);
    if (!rl.ok) return { ok:false, blocked:true, ...rl };

    // 13) Normalización lingüística
    const cleanText = normalizeText(rawText);

    // 2) Memoria de sesión TTL
    const ctxPrev = sessionMem.get(sessionId);

    // Llamada a v3
    const r = await base.ask(cleanText, { sessionId });
    r.parsed = r.parsed || {};
    r.parsed._normText = cleanText;
    r.parsed._ctxBoost = !!(ctxPrev && ctxPrev.lastTable === r.parsed.table);

    // 1 + 14) Scoring global y confianza
    r.parsed.global = computeGlobalScore(r.parsed);

    // 2) Reset si intent cambió
    sessionMem.resetIfIntentChanged(sessionId, r.parsed.intent);
    sessionMem.set(sessionId, {
      lastIntent: r.parsed.intent,
      lastTable:  r.parsed.table,
    });

    // 5) Router de agentes si v3 hace fallback
    let delegated = r.delegated || null;
    if (r.parsed.fallback || (!r.ok && !r.sql)) {
      const routed = await agentRouter.route(r.parsed, agents);
      delegated = routed;
    }

    // 6) Normalizar SQL
    let sql = r.sql ? normalizeSql(r.sql) : null;
    let params = r.params || [];

    // 3) Validar SQL
    let validation = null;
    if (sql) {
      validation = validateSql({
        sql, params,
        plan: { table: r.parsed.table },
        schemaColumns: base._schema && opts.columns,
      });
    }

    // 11) Auto-recovery si SQL inválido
    if (sql && validation && !validation.ok) {
      const rec = await recovery.recover({
        engine: base, parsed: r.parsed,
        error: { code: "INVALID_SQL", details: validation.errors }, agents,
      });
      if (rec.ok && rec.sqlPack) {
        sql = normalizeSql(rec.sqlPack.sql);
        params = rec.sqlPack.params;
        validation = validateSql({ sql, params, plan: { table: rec.parsed.table } });
        r.parsed = rec.parsed;
      } else if (rec.delegated) {
        delegated = rec.delegated;
        sql = null;
      } else {
        return { ok:false, clarify: rec.question, parsed: r.parsed, validation };
      }
    }

    // 14) Si confianza < threshold, pedir confirmación
    const needsConfirm = r.parsed.global.confidence < confirmThreshold && !askOpts.force;

    // 8) Cache lookup
    let rows = null, cacheHit = false, dbError = null;
    if (sql && autoExec && !needsConfirm) {
      const ck = { sql, params, sessionId, dateRange: r.parsed.dateRange };
      const hit = cache.get(ck);
      if (hit) { rows = hit; cacheHit = true; }
      else {
        // 7) Ejecutar con retry y manejo de errores
        const res = await dbErr.withRetry(() => autoExec(sql, params));
        if (res.ok) { rows = res.data; cache.set(ck, rows); }
        else {
          dbError = res.error;
          // 11) sugerir recovery
          const suggestion = dbErr.suggestFallback(res.error, r.parsed);
          dbError.suggestion = suggestion;
        }
      }
    }

    // 12) Telemetría
    telemetry.trackAsk({
      parsed: r.parsed,
      ok: !!sql && !dbError,
      agent: delegated?.agent,
      errorKind: dbError?.kind,
      cacheHit: autoExec ? cacheHit : undefined,
    });

    // 10) Versionado de decisión
    log.record({
      input: rawText,
      intent: r.parsed.intent,
      table: r.parsed.table,
      sql, params,
      score: r.parsed.global,
      agent: delegated?.agent || null,
      error: dbError || (validation && !validation.ok ? validation.errors : null),
    });

    return {
      ok: !!sql && !dbError,
      parsed: r.parsed,
      sql, params,
      rows, cacheHit,
      validation,
      delegated,
      dbError,
      needsConfirm,
      confidence: r.parsed.global.confidence,
      riskLevel:  r.parsed.global.riskLevel,
    };
  }

  function feedback(payload) { return base.feedback(payload); }

  return {
    ask, feedback,
    base, cache, limiter, log, telemetry,
    _v3: base,
  };
}

module.exports = { createEngineV4 };
