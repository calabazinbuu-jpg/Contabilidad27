// ─────────────────────────────────────────────────────────────────
//  queryHistory.service.js
//
//  HISTORIAL DE CONSULTAS EXITOSAS.
//  Con el tiempo la IA aprende qué patrones funcionan mejor en TU sistema.
//
//  Guarda registros como:
//  {
//    "pregunta": "compras por proveedor",
//    "sql": "SELECT ...",
//    "tablas": ["compras","proveedores"],
//    "entidades": ["purchase","supplier"],
//    "exito": true,
//    "filas": 12,
//    "confidence": 0.95,
//    "ts": "2026-06-13T..."
//  }
//
//  Persiste en knowledge/query_history.json (best-effort).
// ─────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "knowledge", "query_history.json");
const MAX = 500;

let HIST = null;

function cargar() {
  if (HIST) return HIST;
  try { HIST = JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { HIST = []; }
  if (!Array.isArray(HIST)) HIST = [];
  return HIST;
}

function guardarDisco() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(HIST.slice(-MAX), null, 2));
  } catch (e) { /* best-effort */ }
}

// ─── normaliza una pregunta para comparar (sin acentos, sin signos) ──
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2));
}

/** Registra una consulta (normalmente solo las exitosas). */
function registrar({ pregunta, sql, tablas = [], entidades = [], exito = true, filas = null, confidence = null }) {
  cargar();
  HIST.push({
    pregunta, sql, tablas, entidades, exito, filas, confidence,
    ts: new Date().toISOString(),
  });
  if (HIST.length > MAX) HIST = HIST.slice(-MAX);
  guardarDisco();
  return true;
}

/**
 * Busca el patrón exitoso más parecido a la pregunta (Jaccard sobre tokens).
 * @returns {{ match, score } | null}
 */
function buscarSimilar(pregunta, { minScore = 0.5 } = {}) {
  cargar();
  const a = tokens(pregunta);
  if (a.size === 0) return null;
  let best = null;
  for (const h of HIST) {
    if (!h.exito) continue;
    const b = tokens(h.pregunta);
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    const score = union ? inter / union : 0;
    if (score >= minScore && (!best || score > best.score)) best = { match: h, score: Number(score.toFixed(2)) };
  }
  return best;
}

function listar({ limit = 50, soloExito = false } = {}) {
  cargar();
  let out = HIST;
  if (soloExito) out = out.filter((h) => h.exito);
  return out.slice(-limit).reverse();
}

function resumen() {
  cargar();
  const exitos = HIST.filter((h) => h.exito).length;
  return { total: HIST.length, exitos, fallos: HIST.length - exitos };
}

module.exports = { registrar, buscarSimilar, listar, resumen };
