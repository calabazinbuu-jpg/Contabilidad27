// =============================================================
//  v5 — Layer 5: Query Splitting (multi-intent)
//  "ventas e IGV del mes" -> 2 subqueries
// =============================================================
"use strict";

const { detectDomains } = require("./ambiguity.deep");

const SPLIT_REGEX = /\s+(?:y|e|,|;|mas|también|tambien|junto con)\s+/i;

function split(text) {
  const t = String(text || "").trim();
  if (!SPLIT_REGEX.test(t)) return [t];

  const tail = extractTail(t);
  const parts = t.replace(/\s+/g, " ").split(SPLIT_REGEX).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return [t];

  return parts.map(p => attachTail(p, tail));
}

function extractTail(text) {
  // captura "del mes", "de junio", "este año", etc.
  const m = text.match(/\b(del?\s+\w+(?:\s+\w+)?|este\s+\w+|último\s+\w+|ultima\s+\w+)\s*$/i);
  return m ? m[0] : "";
}

function attachTail(part, tail) {
  if (!tail) return part;
  if (part.toLowerCase().includes(tail.toLowerCase())) return part;
  return `${part} ${tail}`.trim();
}

async function executeMulti(text, engine, askOpts = {}) {
  const subs = split(text);
  if (subs.length === 1) return null; // sin split
  const out = [];
  for (const s of subs) {
    const r = await engine.ask(s, askOpts);
    out.push({ subquery: s, result: r, domain: detectDomains(s)[0] || null });
  }
  return { split: true, subqueries: subs, results: out };
}

module.exports = { split, executeMulti };
