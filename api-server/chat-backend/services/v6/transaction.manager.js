"use strict";
/**
 * v6 - Transaction Manager
 * Consistencia transaccional: simulación (dry-run), atomic execution, rollback inteligente.
 *
 * Uso:
 *   const tx = createTransactionManager({ runQuery });
 *   await tx.runAtomic([
 *     { sql: "UPDATE stock SET qty=qty-? WHERE id=?", params: [2,10] },
 *     { sql: "INSERT INTO ventas(...) VALUES(...)", params: [...] }
 *   ], { simulateFirst: true });
 */

function isReadOnly(sql) {
  return /^\s*(SELECT|WITH|EXPLAIN|SHOW)\b/i.test(sql);
}

function createTransactionManager({ runQuery, logger = console } = {}) {
  if (typeof runQuery !== "function") {
    throw new Error("transaction.manager: runQuery is required");
  }

  async function simulate(steps) {
    const report = [];
    for (const step of steps) {
      if (isReadOnly(step.sql)) {
        report.push({ sql: step.sql, type: "read", ok: true });
        continue;
      }
      // EXPLAIN para validar estructura sin ejecutar
      try {
        await runQuery(`EXPLAIN ${step.sql}`, step.params || []);
        report.push({ sql: step.sql, type: "write", ok: true, simulated: true });
      } catch (err) {
        report.push({ sql: step.sql, type: "write", ok: false, error: err.message });
      }
    }
    const failed = report.filter((r) => !r.ok);
    return { ok: failed.length === 0, steps: report, failed };
  }

  async function runAtomic(steps, { simulateFirst = true, maxRowsAffected = 10000 } = {}) {
    if (simulateFirst) {
      const sim = await simulate(steps);
      if (!sim.ok) {
        return { ok: false, phase: "simulation", report: sim };
      }
    }

    const executed = [];
    try {
      await runQuery("BEGIN");
      for (const step of steps) {
        const result = await runQuery(step.sql, step.params || []);
        const affected = result?.rowCount ?? result?.affectedRows ?? 0;
        if (affected > maxRowsAffected) {
          throw new Error(
            `transaction.manager: step exceeded maxRowsAffected (${affected} > ${maxRowsAffected})`
          );
        }
        executed.push({ sql: step.sql, affected });
      }
      await runQuery("COMMIT");
      return { ok: true, phase: "commit", executed };
    } catch (err) {
      try {
        await runQuery("ROLLBACK");
      } catch (rbErr) {
        logger.error?.("rollback failed:", rbErr.message);
      }
      return { ok: false, phase: "rollback", error: err.message, executed };
    }
  }

  return { simulate, runAtomic, isReadOnly };
}

module.exports = { createTransactionManager };
