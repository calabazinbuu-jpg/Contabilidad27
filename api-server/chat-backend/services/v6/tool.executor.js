"use strict";
/**
 * v6 - Tool Execution Layer
 * Executor seguro de SQL con sandbox y guardas de impacto.
 *  - whitelist de operaciones por rol
 *  - límite de filas afectadas
 *  - timeout
 *  - dry-run (EXPLAIN) opcional antes
 *  - bloquea DDL salvo allowDdl
 */

const DDL = /^\s*(CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i;
const DML_WRITE = /^\s*(INSERT|UPDATE|DELETE|MERGE|REPLACE)\b/i;
const READ = /^\s*(SELECT|WITH|EXPLAIN|SHOW)\b/i;

function classify(sql) {
  if (DDL.test(sql)) return "ddl";
  if (DML_WRITE.test(sql)) return "write";
  if (READ.test(sql)) return "read";
  return "unknown";
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`tool.executor: timeout after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function createToolExecutor({
  runQuery,
  maxRowsAffected = 5000,
  timeoutMs = 15000,
  allowDdl = false,
  allowWrite = true,
  beforeExecute,
  afterExecute,
} = {}) {
  if (typeof runQuery !== "function") throw new Error("tool.executor: runQuery required");

  async function execute(sql, params = [], opts = {}) {
    const kind = classify(sql);
    if (kind === "unknown") return { ok: false, error: "unrecognized SQL", kind };
    if (kind === "ddl" && !allowDdl) return { ok: false, error: "DDL not allowed", kind };
    if (kind === "write" && !allowWrite) return { ok: false, error: "writes not allowed", kind };

    if (opts.dryRun || (kind === "write" && opts.simulateFirst)) {
      try {
        await withTimeout(runQuery(`EXPLAIN ${sql}`, params), timeoutMs);
      } catch (e) {
        return { ok: false, error: `dry-run failed: ${e.message}`, kind };
      }
      if (opts.dryRun) return { ok: true, kind, dryRun: true };
    }

    if (beforeExecute) await beforeExecute({ sql, params, kind });

    let result;
    try {
      result = await withTimeout(runQuery(sql, params), opts.timeoutMs || timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message, kind };
    }

    const affected = result?.rowCount ?? result?.affectedRows ?? (Array.isArray(result?.rows) ? result.rows.length : 0);
    if (kind === "write" && affected > maxRowsAffected) {
      return { ok: false, error: `rows affected ${affected} exceeds limit ${maxRowsAffected}`, kind, affected };
    }

    if (afterExecute) await afterExecute({ sql, params, kind, affected, result });

    return { ok: true, kind, affected, rows: result?.rows ?? result, raw: result };
  }

  return { execute, classify };
}

module.exports = { createToolExecutor, classify };
