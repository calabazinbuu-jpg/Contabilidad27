// =============================================================
//  v3 — Layer 3: Memoria de Contexto Conversacional
//  Mantiene lastIntent, lastTable, lastFilters, lastDateRange,
//  lastEntities por sessionId.
// =============================================================
"use strict";

const STORE = new Map(); // sessionId → ctx
const TTL_MS = 1000 * 60 * 30; // 30 min

function _clean() {
  const now = Date.now();
  for (const [k, v] of STORE) if (now - v._ts > TTL_MS) STORE.delete(k);
}

function getContext(sessionId) {
  _clean();
  if (!sessionId) return _empty();
  return STORE.get(sessionId) || _empty();
}

function _empty() {
  return {
    lastIntent: null,
    lastTable: null,
    lastFilters: {},
    lastDateRange: null,
    lastEntities: [],
    history: [],
    _ts: Date.now(),
  };
}

function updateContext(sessionId, patch) {
  if (!sessionId) return;
  const cur = STORE.get(sessionId) || _empty();
  const next = { ...cur, ...patch, _ts: Date.now() };
  next.history = [...(cur.history || []), { ...patch, ts: Date.now() }].slice(-10);
  STORE.set(sessionId, next);
  return next;
}

function clearContext(sessionId) {
  STORE.delete(sessionId);
}

/**
 * Aplica contexto a un parsed query incompleto.
 * Si faltan filtros / fecha / tabla, los hereda del contexto previo.
 */
function applyContext(parsed, ctx) {
  if (!ctx) return parsed;
  const out = { ...parsed, filters: { ...(parsed.filters || {}) } };
  let used = [];
  if (!out.table && ctx.lastTable)       { out.table = ctx.lastTable; used.push("table"); }
  if (!out.dateRange && ctx.lastDateRange){ out.dateRange = ctx.lastDateRange; used.push("dateRange"); }
  if (ctx.lastFilters) {
    for (const [k, v] of Object.entries(ctx.lastFilters)) {
      if (out.filters[k] === undefined) { out.filters[k] = v; used.push("filter:"+k); }
    }
  }
  if ((!out.entities || out.entities.length === 0) && ctx.lastEntities?.length) {
    out.entities = ctx.lastEntities; used.push("entities");
  }
  out._contextUsed = used;
  return out;
}

module.exports = { getContext, updateContext, clearContext, applyContext };
