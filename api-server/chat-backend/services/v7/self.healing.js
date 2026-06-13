"use strict";
/**
 * v7 - Self-Healing System
 * Reparación automática de inconsistencias + retry inteligente de queries.
 */
function createSelfHealing({ runQuery, validator, accounting, logger = console } = {}) {
  const fixes = [];

  /** Re-corre query fallida aplicando reglas conocidas. */
  async function safeRun(sql, params = [], { maxAttempts = 3 } = {}) {
    let lastErr;
    for (let i = 0; i < maxAttempts; i++) {
      try { return await runQuery(sql, params); }
      catch (e) {
        lastErr = e;
        const msg = (e.message || "").toLowerCase();
        if (msg.includes("syntax")) sql = sql.replace(/;;+/g, ";");
        else if (msg.includes("does not exist") && /column/i.test(msg)) sql = sql.replace(/SELECT\s+[^F]+FROM/i, "SELECT * FROM");
        else break;
      }
    }
    throw lastErr;
  }

  /** Repara totales inconsistentes recalculando desde detalle. */
  async function fixInconsistentTotals(parents, details, opts = {}) {
    if (!validator) return [];
    const issues = validator.findInconsistentTotals(parents, details, opts);
    const repaired = [];
    for (const issue of issues) {
      fixes.push({ kind: "total", id: issue.id, from: issue.actual, to: issue.expected, at: Date.now() });
      repaired.push({ id: issue.id, newTotal: issue.expected });
    }
    return repaired;
  }

  /** Rebalancea asiento contable agregando línea de ajuste. */
  function rebalanceEntry(asiento, ajusteAccount = "5999_ajuste") {
    if (!accounting) throw new Error("self.heal: accounting required");
    const v = accounting.validate(asiento);
    if (v.balanced) return asiento;
    const diff = v.diff;
    const adjusted = [...asiento, diff > 0
      ? { cuenta: ajusteAccount, debe: 0, haber: Math.abs(diff) }
      : { cuenta: ajusteAccount, debe: Math.abs(diff), haber: 0 }];
    fixes.push({ kind: "rebalance", diff, at: Date.now() });
    logger.warn?.(`self.heal: rebalanced entry by ${diff}`);
    return adjusted;
  }

  return { safeRun, fixInconsistentTotals, rebalanceEntry, fixes };
}

module.exports = { createSelfHealing };
