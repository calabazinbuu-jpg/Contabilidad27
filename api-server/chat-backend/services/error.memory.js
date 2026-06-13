// ─────────────────────────────────────────────────────────────────
// error.memory.js — Memoria de errores SQL para no repetirlos
// In-memory + ring buffer. Sobrevive a la sesión del proceso.
// ─────────────────────────────────────────────────────────────────
const MAX = 50;
const errores = []; // {sql, error, ts}

function registrar(sql, error) {
  errores.unshift({ sql: String(sql).slice(0, 500), error: String(error).slice(0, 300), ts: Date.now() });
  if (errores.length > MAX) errores.length = MAX;
}

function recientes(n = 5) {
  return errores.slice(0, n);
}

function comoTextoParaPrompt(n = 5) {
  const xs = recientes(n);
  if (!xs.length) return "";
  return "❗ Errores SQL recientes (NO repetir estos patrones):\n" +
    xs.map((e, i) => `${i + 1}. SQL: ${e.sql}\n   ERROR: ${e.error}`).join("\n");
}

function limpiar() { errores.length = 0; }

module.exports = { registrar, recientes, comoTextoParaPrompt, limpiar };
