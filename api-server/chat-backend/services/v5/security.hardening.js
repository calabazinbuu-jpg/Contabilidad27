// =============================================================
//  v5 — Layer 14: Security hardening final
//  SQL injection blindado + prompt injection + input sanitization.
// =============================================================
"use strict";

const SQL_INJECTION_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+FROM/i,
  /;\s*TRUNCATE\s+/i,
  /;\s*UPDATE\s+\w+\s+SET/i,
  /;\s*ALTER\s+/i,
  /UNION\s+(ALL\s+)?SELECT/i,
  /'\s*OR\s+'?\d+'?\s*=\s*'?\d+/i,
  /--\s*$/m,
  /\/\*.*\*\//s,
  /xp_cmdshell/i,
  /INTO\s+OUTFILE/i,
  /LOAD_FILE\s*\(/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /ignora (las |tus )?instrucciones (previas|anteriores)/i,
  /ignore (previous|all) instructions/i,
  /system\s*:\s*you are/i,
  /act as (admin|root|developer)/i,
  /reveal (your |the )?(system )?prompt/i,
  /<script\b/i,
  /javascript:/i,
  /onerror\s*=/i,
];

function detectSqlInjection(text) {
  const hits = SQL_INJECTION_PATTERNS.filter(re => re.test(text));
  return { detected: hits.length > 0, patterns: hits.map(r => r.toString()) };
}

function detectPromptInjection(text) {
  const hits = PROMPT_INJECTION_PATTERNS.filter(re => re.test(text));
  return { detected: hits.length > 0, patterns: hits.map(r => r.toString()) };
}

function sanitizeInput(text, opts = {}) {
  const max = opts.maxLength ?? 1000;
  let s = String(text ?? "").slice(0, max);
  // strip control chars except \n \t
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function inspect(text) {
  const clean = sanitizeInput(text);
  const sqli  = detectSqlInjection(clean);
  const prom  = detectPromptInjection(clean);
  return {
    clean,
    safe: !sqli.detected && !prom.detected,
    sqlInjection: sqli,
    promptInjection: prom,
  };
}

module.exports = {
  inspect, sanitizeInput,
  detectSqlInjection, detectPromptInjection,
  SQL_INJECTION_PATTERNS, PROMPT_INJECTION_PATTERNS,
};
