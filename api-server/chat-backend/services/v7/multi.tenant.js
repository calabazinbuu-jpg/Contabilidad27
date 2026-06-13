"use strict";
/**
 * v7 - Multi-Tenant
 * Aislamiento total por tenant: contexto por request + helper de SQL con
 * filtro automático tenant_id y soporte de schema-per-tenant opcional.
 */
const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();

function withTenant(tenant, fn) {
  if (!tenant || !tenant.id) throw new Error("multi.tenant: tenant.id required");
  return als.run({ ...tenant }, fn);
}
function currentTenant() { return als.getStore() || null; }
function requireTenant() {
  const t = currentTenant();
  if (!t) throw new Error("multi.tenant: no tenant in context");
  return t;
}

/** Devuelve runQuery envuelto que añade WHERE tenant_id=$N o usa SET search_path. */
function createTenantRunner({ runQuery, mode = "column", tenantColumn = "tenant_id" } = {}) {
  if (typeof runQuery !== "function") throw new Error("multi.tenant: runQuery required");
  return async function run(sql, params = []) {
    const t = currentTenant();
    if (!t) return runQuery(sql, params);
    if (mode === "schema") {
      await runQuery(`SET search_path TO "tenant_${t.id}", public`);
      return runQuery(sql, params);
    }
    // column mode: inject filter on SELECT/UPDATE/DELETE if not present
    if (/\b(SELECT|UPDATE|DELETE)\b/i.test(sql) && !new RegExp(`\\b${tenantColumn}\\b`).test(sql)) {
      const sep = /\bWHERE\b/i.test(sql) ? " AND " : " WHERE ";
      const idx = params.length + 1;
      sql = sql.replace(/(;?\s*)$/, (m) => `${sep}${tenantColumn} = $${idx}${m}`);
      params = [...params, t.id];
    }
    return runQuery(sql, params);
  };
}

module.exports = { withTenant, currentTenant, requireTenant, createTenantRunner };
