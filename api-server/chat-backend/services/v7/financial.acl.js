"use strict";
/**
 * v7 - Role-Based Financial Security
 * Permisos granulares por módulo contable y por campo sensible (IGV, utilidad).
 */
const DEFAULT_ROLES = {
  admin:      { modules: ["*"], fields: ["*"] },
  contador:   { modules: ["contabilidad","ventas","compras","tesoreria","impuestos"], fields: ["igv","utilidad","margen","costo"] },
  vendedor:   { modules: ["ventas","clientes"], fields: [] },
  cajero:     { modules: ["tesoreria","ventas"], fields: [] },
  gerencia:   { modules: ["*"], fields: ["utilidad","margen","igv"] },
};

function createFinancialAcl({ roles = DEFAULT_ROLES } = {}) {
  function rolesOf(user) { return user?.roles || (user?.role ? [user.role] : []); }

  function can(user, action, { module, field } = {}) {
    const rs = rolesOf(user);
    if (rs.length === 0) return false;
    for (const r of rs) {
      const def = roles[r]; if (!def) continue;
      const moduleOk = !module || def.modules.includes("*") || def.modules.includes(module);
      const fieldOk  = !field  || def.fields.includes("*")  || def.fields.includes(field);
      if (moduleOk && fieldOk) return true;
    }
    return false;
  }

  /** Quita campos sensibles que el rol no puede ver. */
  function redact(user, row, sensitiveFields) {
    if (!row || typeof row !== "object") return row;
    const out = { ...row };
    for (const f of sensitiveFields) {
      if (!can(user, "read", { field: f })) delete out[f];
    }
    return out;
  }

  function require(user, action, opts) {
    if (!can(user, action, opts)) {
      const err = new Error(`forbidden: ${action} ${JSON.stringify(opts || {})}`);
      err.code = "FORBIDDEN"; throw err;
    }
  }

  return { can, redact, require, roles };
}

module.exports = { createFinancialAcl, DEFAULT_ROLES };
