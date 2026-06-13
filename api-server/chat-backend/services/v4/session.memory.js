// =============================================================
//  v4 — Layer 2: Memoria de sesión con TTL + reset + compresión
// =============================================================
"use strict";

const STORE = new Map(); // sessionId -> { data, expiresAt, history[] }
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_HISTORY    = 10;

function now() { return Date.now(); }

function get(sessionId, ttl = DEFAULT_TTL_MS) {
  if (!sessionId) return null;
  const slot = STORE.get(sessionId);
  if (!slot) return null;
  if (slot.expiresAt < now()) { STORE.delete(sessionId); return null; }
  slot.expiresAt = now() + ttl;
  return slot.data;
}

function set(sessionId, data, ttl = DEFAULT_TTL_MS) {
  if (!sessionId) return;
  const prev = STORE.get(sessionId) || { history: [] };
  prev.history.push({ at: now(), data });
  if (prev.history.length > MAX_HISTORY) prev.history.shift();
  prev.data = { ...(prev.data || {}), ...data };
  prev.expiresAt = now() + ttl;
  STORE.set(sessionId, prev);
}

function resetIfIntentChanged(sessionId, newIntent) {
  const slot = STORE.get(sessionId);
  if (!slot?.data) return;
  if (slot.data.lastIntent && newIntent && slot.data.lastIntent !== newIntent) {
    // compression: keep only intent + table
    slot.data = {
      lastIntent: slot.data.lastIntent,
      lastTable:  slot.data.lastTable,
    };
  }
}

function clear(sessionId) { STORE.delete(sessionId); }

function compact(sessionId) {
  const slot = STORE.get(sessionId);
  if (!slot) return;
  if (slot.history.length > 5) slot.history = slot.history.slice(-5);
}

module.exports = { get, set, resetIfIntentChanged, clear, compact };
