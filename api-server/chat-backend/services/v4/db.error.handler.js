// =============================================================
//  v4 — Layer 7: Control de errores de ejecución DB
// =============================================================
"use strict";

const PG_CODES = {
  "42703": "UNDEFINED_COLUMN",
  "42P01": "UNDEFINED_TABLE",
  "42883": "UNDEFINED_FUNCTION",
  "57014": "QUERY_TIMEOUT",
  "23505": "UNIQUE_VIOLATION",
  "23503": "FK_VIOLATION",
};

function classify(error) {
  if (!error) return null;
  const code = error.code || error.sqlState;
  const kind = PG_CODES[code] || "DB_ERROR";
  return {
    kind,
    code: code || null,
    message: error.message || String(error),
    retryable: kind === "QUERY_TIMEOUT",
  };
}

async function withRetry(runFn, { retries = 1, delayMs = 200 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return { ok: true, data: await runFn() }; }
    catch (e) {
      lastErr = classify(e);
      if (!lastErr.retryable || i === retries) break;
      await new Promise(r => setTimeout(r, delayMs * (i+1)));
    }
  }
  return { ok: false, error: lastErr };
}

function suggestFallback(classified, parsed) {
  if (!classified) return null;
  switch (classified.kind) {
    case "UNDEFINED_TABLE":  return { action:"reroute_agent", reason:"tabla no existe" };
    case "UNDEFINED_COLUMN": return { action:"strip_filters", reason:"columna no existe" };
    case "QUERY_TIMEOUT":    return { action:"reduce_scope",  reason:"timeout, reducir rango" };
    default: return { action:"ask_clarification", reason: classified.message };
  }
}

module.exports = { classify, withRetry, suggestFallback };
