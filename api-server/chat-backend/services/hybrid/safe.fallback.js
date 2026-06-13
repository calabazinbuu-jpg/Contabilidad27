// ─────────────────────────────────────────────────────────────────
//  hybrid/safe.fallback.js   (v10)
//  Resiliencia global del sistema híbrido.
//
//  Objetivo: el usuario NUNCA ve un error técnico.
//  - safeRun(fn, fallback)  envuelve cualquier promesa
//  - cache persistente en disco para respuestas IA/Internet
//  - última-buena-respuesta por clave
// ─────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "..", ".cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const CACHE_FILE = path.join(CACHE_DIR, "hybrid.cache.json");

let store = {};
try { store = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { store = {}; }

function _persist() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(store), "utf8"); } catch {}
}

function recordar(clave, valor) {
  if (!clave) return;
  store[clave] = { t: Date.now(), v: valor };
  _persist();
}
function recordarUltima(clave) {
  return store[clave]?.v ?? null;
}

/**
 * Ejecuta fn(). Si lanza, devuelve fallback (puede ser función o valor).
 * Nunca propaga la excepción.
 */
async function safeRun(fn, fallback, contexto = "") {
  try {
    return await fn();
  } catch (e) {
    // log interno, jamás visible al usuario
    console.warn(`[safeRun:${contexto}] ${e?.message || e}`);
    if (typeof fallback === "function") {
      try { return await fallback(e); } catch { /* swallow */ }
    }
    return fallback;
  }
}

/**
 * Respuesta de cortesía cuando todo falla.
 */
function respuestaSegura(modo = "IA", motivo = "indisponibilidad temporal") {
  return {
    ok: true,
    modo,
    degradado: true,
    respuesta:
      "El sistema está respondiendo en modo seguro (offline). " +
      "No pude completar la consulta en este momento, pero el ERP sigue operativo. " +
      "Vuelve a intentarlo en unos segundos o reformula la pregunta.",
    motivo,
  };
}

module.exports = { safeRun, recordar, recordarUltima, respuestaSegura };
