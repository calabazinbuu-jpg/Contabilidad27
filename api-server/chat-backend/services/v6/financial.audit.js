"use strict";
/**
 * v6 - Financial Audit
 * Trazabilidad completa por asiento contable: quién, qué, cuándo y por qué.
 * Backend pluggable (in-memory por defecto, o tabla audit_log inyectada).
 */

function createFinancialAudit({ store, logger = console } = {}) {
  const mem = [];
  const writer = store && typeof store.append === "function"
    ? store
    : { append: async (e) => { mem.push(e); }, query: async (filter = {}) => mem.filter(matcher(filter)) };

  function matcher(f) {
    return (e) =>
      (!f.actor || e.actor === f.actor) &&
      (!f.entity || e.entity === f.entity) &&
      (!f.entityId || e.entityId === f.entityId) &&
      (!f.action || e.action === f.action) &&
      (!f.since || e.at >= f.since);
  }

  async function record({ actor, action, entity, entityId, before = null, after = null, reason = "", meta = {} }) {
    if (!actor || !action || !entity) throw new Error("financial.audit: actor, action y entity son requeridos");
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      actor, action, entity, entityId,
      before, after, reason, meta,
      diff: computeDiff(before, after),
    };
    await writer.append(entry);
    logger.info?.(`[AUDIT] ${actor} ${action} ${entity}#${entityId ?? "?"} :: ${reason || "-"}`);
    return entry;
  }

  function computeDiff(a, b) {
    if (!a || !b) return null;
    const diff = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (a[k] !== b[k]) diff[k] = { from: a[k], to: b[k] };
    return diff;
  }

  async function query(filter) {
    if (writer.query) return writer.query(filter);
    return mem.filter(matcher(filter || {}));
  }

  return { record, query };
}

module.exports = { createFinancialAudit };
