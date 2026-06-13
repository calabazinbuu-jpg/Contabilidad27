"use strict";
/**
 * v6 - Long Term Memory (por cliente/empresa)
 * Historial semántico de decisiones, preferencias y consultas frecuentes.
 *
 * Backend pluggable: por defecto in-memory; se puede inyectar { store } persistente.
 */

function defaultStore() {
  const m = new Map();
  return {
    async get(k) { return m.get(k); },
    async set(k, v) { m.set(k, v); },
    async list(prefix) {
      const out = [];
      for (const [k, v] of m.entries()) if (k.startsWith(prefix)) out.push({ k, v });
      return out;
    },
    async delete(k) { m.delete(k); },
  };
}

function tokenize(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function createLongTermMemory({ store = defaultStore(), maxPerScope = 200 } = {}) {
  const key = (scope, id) => `ltm:${scope}:${id}`;
  const idxKey = (scope) => `ltm:${scope}:__index__`;

  async function record(scope, entry) {
    const id = entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = { id, at: Date.now(), tokens: tokenize(entry.query || entry.text || ""), ...entry };
    await store.set(key(scope, id), payload);
    const idx = (await store.get(idxKey(scope))) || [];
    idx.push(id);
    while (idx.length > maxPerScope) {
      const old = idx.shift();
      await store.delete(key(scope, old));
    }
    await store.set(idxKey(scope), idx);
    return payload;
  }

  async function recall(scope, query, { limit = 5, minScore = 0.15 } = {}) {
    const idx = (await store.get(idxKey(scope))) || [];
    const qTokens = tokenize(query);
    const scored = [];
    for (const id of idx) {
      const item = await store.get(key(scope, id));
      if (!item) continue;
      const score = jaccard(qTokens, item.tokens || []);
      if (score >= minScore) scored.push({ ...item, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async function preferences(scope) {
    const idx = (await store.get(idxKey(scope))) || [];
    const freq = new Map();
    for (const id of idx) {
      const item = await store.get(key(scope, id));
      if (!item?.intent) continue;
      freq.set(item.intent, (freq.get(item.intent) || 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([intent, count]) => ({ intent, count }));
  }

  async function clear(scope) {
    const idx = (await store.get(idxKey(scope))) || [];
    for (const id of idx) await store.delete(key(scope, id));
    await store.delete(idxKey(scope));
  }

  return { record, recall, preferences, clear };
}

module.exports = { createLongTermMemory, defaultStore };
