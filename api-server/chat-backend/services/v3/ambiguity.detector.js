// =============================================================
//  v3 — Layer 2: Detector de Ambigüedad
//  Recibe los candidatos ordenados por score y decide si la
//  consulta es ambigua (diferencia muy pequeña entre top 2/3).
// =============================================================
"use strict";

const DEFAULT_THRESHOLD = 0.8;  // si top2 >= top1 * 0.8 → ambiguo
const DEFAULT_ABS_DIFF  = 1.5;  // o si diferencia < 1.5 puntos

function detectAmbiguity(candidates, opts = {}) {
  const threshold = opts.threshold || DEFAULT_THRESHOLD;
  const absDiff   = opts.absDiff   || DEFAULT_ABS_DIFF;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { fallback: true, motivo: "NO_CANDIDATES", candidates: [] };
  }
  if (candidates.length === 1) {
    return { fallback: false, winner: candidates[0], candidates };
  }
  const sorted = [...candidates].sort((a,b) => (b.score||0)-(a.score||0));
  const [top, second, third] = sorted;
  const t1 = top.score || 0;
  const t2 = second.score || 0;
  if (t1 <= 0) return { fallback: true, motivo: "ZERO_SCORE", candidates: sorted };

  const ratio = t2 / t1;
  const diff  = t1 - t2;
  if (ratio >= threshold || diff < absDiff) {
    const top3 = sorted.slice(0, 3);
    return {
      fallback: true,
      motivo: "AMBIGUOUS_QUERY",
      candidates: top3,
      ratio,
      diff,
    };
  }
  return { fallback: false, winner: top, candidates: sorted, ratio, diff };
}

module.exports = { detectAmbiguity };
