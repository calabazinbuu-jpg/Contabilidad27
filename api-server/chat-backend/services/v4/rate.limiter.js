// =============================================================
//  v4 — Layer 9: Rate limiting + debounce por sesión
// =============================================================
"use strict";

const SESSIONS = new Map(); // sessionId -> { count, windowStart, lastAt }

function createLimiter({ maxPerSession = 60, windowMs = 60_000, debounceMs = 250 } = {}) {
  function check(sessionId) {
    const id = sessionId || "_anon";
    const now = Date.now();
    const slot = SESSIONS.get(id) || { count: 0, windowStart: now, lastAt: 0 };
    if (now - slot.windowStart > windowMs) { slot.count = 0; slot.windowStart = now; }
    if (now - slot.lastAt < debounceMs)
      return { ok:false, code:"DEBOUNCED", retryAfterMs: debounceMs - (now - slot.lastAt) };
    if (slot.count >= maxPerSession)
      return { ok:false, code:"RATE_LIMIT", retryAfterMs: windowMs - (now - slot.windowStart) };
    slot.count += 1; slot.lastAt = now;
    SESSIONS.set(id, slot);
    return { ok:true, remaining: maxPerSession - slot.count };
  }
  function reset(sessionId) { SESSIONS.delete(sessionId || "_anon"); }
  return { check, reset };
}

module.exports = { createLimiter };
