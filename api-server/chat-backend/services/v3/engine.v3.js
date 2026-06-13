// =============================================================
//  engine.v3.js — Orquestador PRO
//  Integra las 10 capas:
//   1) Normalización de intención
//   2) Ambigüedad
//   3) Memoria de contexto
//   4) Detección de entidades
//   5) Normalizador de fechas avanzado
//   6) Filtros estructurados
//   7) Seguridad SQL
//   8) Explainability
//   9) Fallback a agentes
//  10) Auto-aprendizaje
// =============================================================
"use strict";

const { normalizeIntent, norm } = require("./intent.normalizer");
const { detectAmbiguity }       = require("./ambiguity.detector");
const ctxMem                    = require("./context.memory");
const { buildExtractor }        = require("./entity.extractor");
const { normalizeDate }         = require("./date.normalizer.pro");
const { buildFilters }          = require("./filter.builder");
const { makeGuard }             = require("./sql.security");
const { newTrace, explainDecision } = require("./explainability");
const fallback                  = require("./agent.fallback");
const { createLearning }        = require("./learning.feedback");

// ── Diccionario por tabla (puede venir del schema real) ──
const DEFAULT_SCHEMA = {
  facturas:    { priority: 10, dateCol:"fecha", strong:["factura","facturas","comprobante","boleta"] },
  proveedores: { priority: 10, strong:["proveedor","proveedores","suplidor"] },
  clientes:    { priority: 9,  strong:["cliente","clientes","comprador"] },
  pagos:       { priority: 7,  dateCol:"fecha", strong:["pago","pagos","cobro"] },
  ventas:      { priority: 8,  dateCol:"fecha", strong:["venta","ventas","vendi","vendido","ingreso"] },
  compras:     { priority: 7,  dateCol:"fecha", strong:["compra","compras","gasto","egreso"] },
  productos:   { priority: 6,  strong:["producto","productos","item","sku","articulo"] },
  inventario:  { priority: 6,  dateCol:"fecha", strong:["inventario","stock","existencia","almacen"] },
};

const DEFAULT_COLUMNS = {
  facturas:    ["id","fecha","cliente","total","impuesto","serie","numero"],
  proveedores: ["id","razon_social","ruc","ciudad","saldo","telefono"],
  clientes:    ["id","nombre","ruc","ciudad","saldo","telefono","correo"],
  pagos:       ["id","fecha","cliente","proveedor","monto","metodo"],
  ventas:      ["id","fecha","cliente","producto","ciudad","total","cantidad"],
  compras:     ["id","fecha","proveedor","producto","ciudad","total","cantidad"],
  productos:   ["id","nombre","sku","precio","stock"],
  inventario:  ["id","fecha","producto","cantidad","tipo"],
};

const INTENT_TO_AGG = {
  AGG_COUNT: { fn: "COUNT", col: "*" },
  AGG_SUM:   { fn: "SUM" },
  AGG_AVG:   { fn: "AVG" },
  AGG_MAX:   { fn: "MAX" },
  AGG_MIN:   { fn: "MIN" },
};

function createEngineV3(opts = {}) {
  const schema   = opts.schema   || DEFAULT_SCHEMA;
  const columns  = opts.columns  || DEFAULT_COLUMNS;
  const catalog  = opts.catalog  || {};
  const learning = opts.learning || createLearning({ filePath: opts.learningFile || null });
  const extract  = buildExtractor(catalog);
  const guard    = makeGuard({
    allowedTables: Object.keys(schema),
    allowedColumns: columns,
  });

  function scoreTables(text, intent, entities, ctx) {
    const t = " " + text + " ";
    const out = [];
    for (const [table, def] of Object.entries(schema)) {
      const trace = newTrace();
      let score = 0;
      for (const kw of (def.strong || [])) {
        if (t.includes(" " + kw + " ")) { score += 3; trace.addKeyword(kw, 3); }
        const lb = learning.getKeywordBoost(table, kw);
        if (lb) { score += lb; trace.add("learning", `kw boost ${kw}`, lb); }
      }
      // intent boost
      const iB = (intent && intent !== "UNKNOWN") ? 2 : 0;
      if (iB) { score += iB; trace.addIntent(intent, iB); }
      const ilb = learning.getIntentBoost(intent);
      if (ilb) { score += ilb; trace.add("learning", `intent boost ${intent}`, ilb); }
      // entity boost
      for (const e of entities) { score += 1; trace.addEntity(e, 1); }
      // context boost
      if (ctx?.lastTable === table) { score += 1; trace.addContext("lastTable", 1); }
      // priority
      const pri = (def.priority || 0) / 5;
      score += pri; trace.addPriority(pri);
      const lp = learning.getPriorityBoost(table);
      if (lp) { score += lp; trace.add("learning", `priority delta`, lp); }
      out.push({ table, score, trace });
    }
    return out.sort((a,b)=>b.score-a.score);
  }

  async function parse(rawText, { sessionId } = {}) {
    // 1) intent
    const { intent, text } = normalizeIntent(rawText);
    // 3) context
    const ctx = ctxMem.getContext(sessionId);
    // 4) entities
    const entities = extract(rawText);
    // 5) dates
    const dateRange = normalizeDate(rawText);

    // scoring
    const scored = scoreTables(text, intent, entities, ctx);
    // 2) ambiguity
    const amb = detectAmbiguity(scored);

    let parsed = {
      input: rawText,
      intent,
      entities,
      dateRange,
      candidates: scored.slice(0,3).map(c => ({ table: c.table, score: +c.score.toFixed(2) })),
    };

    if (amb.fallback) {
      learning.recordFallback(rawText, amb.motivo);
      parsed.table = null;
      parsed.fallback = true;
      parsed.motivo = amb.motivo;
      parsed.explain = explainDecision({
        table: null, score: 0, intent, fallback:true, motivo: amb.motivo,
        trace: scored[0]?.trace,
      });
    } else {
      const winner = amb.winner;
      parsed.table = winner.table;
      parsed.explain = explainDecision({
        table: winner.table, score: winner.score, intent, trace: winner.trace,
      });
    }

    // Apply context if still missing pieces
    parsed = ctxMem.applyContext(parsed, ctx);

    // 6) filters
    parsed.filters = buildFilters({
      table: parsed.table,
      entities: parsed.entities,
      dateRange: parsed.dateRange,
    });

    // Persist context for next turn
    if (sessionId && parsed.table) {
      ctxMem.updateContext(sessionId, {
        lastIntent: intent,
        lastTable: parsed.table,
        lastFilters: parsed.filters,
        lastDateRange: parsed.dateRange,
        lastEntities: parsed.entities,
      });
    }

    return parsed;
  }

  function plan(parsed) {
    if (!parsed.table) return null;
    const def = schema[parsed.table] || {};
    const agg = INTENT_TO_AGG[parsed.intent] || null;
    if (agg && !agg.col && def.totalCol) agg.col = def.totalCol;
    const planObj = {
      table: parsed.table,
      columns: ["*"],
      filters: parsed.filters,
      dateCol: def.dateCol || "fecha",
      orderBy: def.dateCol ? { col: def.dateCol, dir: "DESC" } : null,
      limit: 100,
      agg,
    };
    return planObj;
  }

  function toSql(parsed) {
    const p = plan(parsed);
    if (!p) return null;
    return guard.buildSafeSql(p);
  }

  async function ask(rawText, opts2 = {}) {
    const parsed = await parse(rawText, opts2);
    if (parsed.fallback) {
      const delegated = await fallback.delegate(
        { intent: parsed.intent, table: parsed.table, parsed },
        opts.agents || {}
      );
      return { ok: false, parsed, delegated };
    }
    let sqlPack = null, error = null;
    try { sqlPack = toSql(parsed); }
    catch (e) { error = { code: e.code || "SQL_ERROR", message: e.message }; }
    return { ok: !!sqlPack, parsed, sql: sqlPack?.sql, params: sqlPack?.params, error };
  }

  function feedback(payload) {
    learning.recordFeedback(payload);
    return { ok: true, snapshot: learning.snapshot() };
  }

  return { parse, plan, toSql, ask, feedback, learning, guard, _schema: schema };
}

module.exports = { createEngineV3 };
