// =============================================================
//  v3 — Layer 10: Auto-mejora / Feedback Loop
//  - Registra correcciones del usuario
//  - Ajusta pesos de keywords / boosts de intent / priority por tabla
//  - Persiste en disco (JSON) si se pasa filePath
// =============================================================
"use strict";

const fs = require("fs");
const path = require("path");

function loadStore(filePath) {
  if (!filePath) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}
function saveStore(filePath, data) {
  if (!filePath) return;
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch(e){}
}

function createLearning({ filePath = null } = {}) {
  const state = loadStore(filePath) || {
    keywordWeights: {},   // { "proveedores": 1.5 }
    intentBoosts:   {},   // { "SELECT_LIST": 0.5 }
    priorityDelta:  {},   // { "proveedores": +1 }
    feedback: [],         // historial
    fallbackCounts: {},   // { input → count }
  };

  function recordFeedback({ input, wrongTable, correctTable, wrongIntent, correctIntent }) {
    state.feedback.push({ input, wrongTable, correctTable, wrongIntent, correctIntent, ts: Date.now() });
    // Ajuste simple: refuerza priority de la tabla correcta y baja la incorrecta
    if (correctTable) state.priorityDelta[correctTable] = (state.priorityDelta[correctTable]||0) + 0.5;
    if (wrongTable && wrongTable !== correctTable) state.priorityDelta[wrongTable] = (state.priorityDelta[wrongTable]||0) - 0.25;
    if (correctIntent) state.intentBoosts[correctIntent] = (state.intentBoosts[correctIntent]||0) + 0.3;
    // Aprende keyword cruda: cualquier palabra >=4 que esté en input se refuerza para la tabla correcta
    if (correctTable && input) {
      for (const w of String(input).toLowerCase().split(/\W+/)) {
        if (w.length >= 4) {
          const k = `${correctTable}::${w}`;
          state.keywordWeights[k] = (state.keywordWeights[k]||0) + 0.2;
        }
      }
    }
    saveStore(filePath, state);
  }

  function recordFallback(input, motivo) {
    const key = String(input).toLowerCase().slice(0, 120);
    state.fallbackCounts[key] = (state.fallbackCounts[key]||0) + 1;
    saveStore(filePath, state);
    return state.fallbackCounts[key];
  }

  function getPriorityBoost(table)  { return state.priorityDelta[table] || 0; }
  function getIntentBoost(intent)   { return state.intentBoosts[intent] || 0; }
  function getKeywordBoost(table, word) { return state.keywordWeights[`${table}::${word}`] || 0; }

  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  function reset() {
    state.keywordWeights = {}; state.intentBoosts = {}; state.priorityDelta = {};
    state.feedback = []; state.fallbackCounts = {};
    saveStore(filePath, state);
  }

  return { recordFeedback, recordFallback, getPriorityBoost, getIntentBoost, getKeywordBoost, snapshot, reset };
}

module.exports = { createLearning };
