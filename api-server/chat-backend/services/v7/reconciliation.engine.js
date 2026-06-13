"use strict";
/**
 * v7 - Reconciliation Engine
 * Conciliación bancaria + matching pagos↔facturas + movimientos↔contabilidad.
 */
function n(x) { return Number(x) || 0; }

function createReconciliation({ amountTolerance = 0.01, dateWindowDays = 5 } = {}) {
  function withinDays(a, b) {
    return Math.abs(new Date(a) - new Date(b)) <= dateWindowDays * 86400000;
  }

  function matchOneToOne(left, right, { leftAmount = "monto", rightAmount = "monto", leftDate = "fecha", rightDate = "fecha", leftRef, rightRef } = {}) {
    const used = new Set();
    const matches = [];
    const unmatchedLeft = [];
    for (const l of left) {
      let best = -1, bestScore = -Infinity;
      for (let i = 0; i < right.length; i++) {
        if (used.has(i)) continue;
        const r = right[i];
        if (Math.abs(n(l[leftAmount]) - n(r[rightAmount])) > amountTolerance) continue;
        if (l[leftDate] && r[rightDate] && !withinDays(l[leftDate], r[rightDate])) continue;
        let score = 1;
        if (leftRef && rightRef && l[leftRef] && l[leftRef] === r[rightRef]) score += 10;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) { matches.push({ left: l, right: right[best], score: bestScore }); used.add(best); }
      else unmatchedLeft.push(l);
    }
    const unmatchedRight = right.filter((_, i) => !used.has(i));
    return { matches, unmatchedLeft, unmatchedRight };
  }

  function reconcileBank(bankMovs, ledgerMovs) {
    return matchOneToOne(bankMovs, ledgerMovs, { leftRef: "ref", rightRef: "ref" });
  }
  function reconcilePayments(pagos, facturas) {
    return matchOneToOne(pagos, facturas, { leftAmount: "monto", rightAmount: "total", leftRef: "factura_id", rightRef: "id" });
  }

  return { matchOneToOne, reconcileBank, reconcilePayments };
}

module.exports = { createReconciliation };
