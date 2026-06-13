// =============================================================
//  v3 — Layer 7: Seguridad SQL
//  - Whitelist de tablas y columnas
//  - Bloquea DROP / DELETE / UPDATE / INSERT / ALTER / TRUNCATE / GRANT
//  - Solo SELECT
//  - Construye SQL parametrizado a partir de { table, columns, filters }
// =============================================================
"use strict";

const BLOCKED = /\b(drop|delete|update|insert|alter|truncate|grant|revoke|create|exec|execute|merge|call|copy|attach|vacuum)\b/i;
const HAS_SEMI_MULTI = /;\s*\S/;

class SqlSecurityError extends Error {
  constructor(msg, code) { super(msg); this.code = code || "SQL_BLOCKED"; }
}

function makeGuard({ allowedTables = [], allowedColumns = {} } = {}) {
  const tableSet = new Set(allowedTables);
  const colSets = {};
  for (const [t, cols] of Object.entries(allowedColumns)) colSets[t] = new Set(cols);

  function assertTable(t) {
    if (!tableSet.has(t)) throw new SqlSecurityError(`Tabla no permitida: ${t}`, "TABLE_NOT_ALLOWED");
  }
  function assertColumn(t, c) {
    if (c === "*") return;
    const s = colSets[t];
    if (!s) throw new SqlSecurityError(`Tabla sin columnas registradas: ${t}`, "COLUMNS_UNKNOWN");
    if (!s.has(c)) throw new SqlSecurityError(`Columna no permitida: ${t}.${c}`, "COLUMN_NOT_ALLOWED");
  }

  function checkRawSql(sql) {
    if (!sql || typeof sql !== "string") throw new SqlSecurityError("SQL vacío", "EMPTY");
    if (BLOCKED.test(sql)) throw new SqlSecurityError("Operación bloqueada", "DDL_DML_BLOCKED");
    if (HAS_SEMI_MULTI.test(sql)) throw new SqlSecurityError("Múltiples statements no permitidos", "MULTI_STATEMENT");
    if (!/^\s*select\b/i.test(sql)) throw new SqlSecurityError("Solo SELECT permitido", "NOT_SELECT");
    return true;
  }

  /**
   * Construye SQL parametrizado seguro.
   * plan = { table, columns:["*"|colName], filters:{col:val|{op,val}|{from,to,tag}}, orderBy, limit, agg:{fn,col} }
   */
  function buildSafeSql(plan) {
    if (!plan || !plan.table) throw new SqlSecurityError("Plan sin tabla", "NO_TABLE");
    assertTable(plan.table);
    const cols = (plan.columns && plan.columns.length) ? plan.columns : ["*"];
    cols.forEach(c => assertColumn(plan.table, c));

    let select;
    if (plan.agg && plan.agg.fn) {
      const fn = plan.agg.fn.toUpperCase();
      if (!["COUNT","SUM","AVG","MAX","MIN"].includes(fn)) throw new SqlSecurityError("Función de agregación inválida", "BAD_AGG");
      const col = plan.agg.col || "*";
      if (col !== "*") assertColumn(plan.table, col);
      select = `${fn}(${col === "*" ? "*" : `"${col}"`}) AS resultado`;
    } else {
      select = cols.map(c => c === "*" ? "*" : `"${c}"`).join(", ");
    }

    const where = [];
    const params = [];
    const filters = plan.filters || {};
    for (const [col, val] of Object.entries(filters)) {
      if (col === "date") {
        // se asume columna real plan.dateCol (o "fecha")
        const dc = plan.dateCol || "fecha";
        assertColumn(plan.table, dc);
        if (val && val.from && val.to) {
          params.push(val.from, val.to);
          where.push(`"${dc}" BETWEEN $${params.length-1} AND $${params.length}`);
        }
        continue;
      }
      assertColumn(plan.table, col);
      if (val && typeof val === "object" && "op" in val) {
        const op = ["=", "<", ">", "<=", ">=", "<>", "LIKE", "ILIKE"].includes(val.op) ? val.op : "=";
        params.push(val.val);
        where.push(`"${col}" ${op} $${params.length}`);
      } else {
        params.push(val);
        where.push(`"${col}" = $${params.length}`);
      }
    }

    let sql = `SELECT ${select} FROM "${plan.table}"`;
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    if (plan.orderBy && plan.orderBy.col) {
      assertColumn(plan.table, plan.orderBy.col);
      const dir = (plan.orderBy.dir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      sql += ` ORDER BY "${plan.orderBy.col}" ${dir}`;
    }
    const limit = Math.min(Math.max(parseInt(plan.limit||100,10),1), 1000);
    sql += ` LIMIT ${limit}`;
    checkRawSql(sql);
    return { sql, params };
  }

  return { assertTable, assertColumn, checkRawSql, buildSafeSql, SqlSecurityError };
}

module.exports = { makeGuard, SqlSecurityError };
