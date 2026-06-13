// ─────────────────────────────────────────────────────────────────
// sql.retry.js — Loop de autocorrección SQL
// Ejecuta SQL; si falla, pide al LLM una versión corregida
// usando: error real + esquema real + errores recientes.
// ─────────────────────────────────────────────────────────────────
const db        = require("../config/db");
const ai        = require("../config/ai");
const sqlGuard  = require("./sql.guard");
const errMem    = require("./error.memory");
const schema    = require("./schema.introspect");
const { buildSystemPrompt } = require("./intelligence.rules");

async function esquemaResumido() {
  const s = await schema.getSchema();
  return Object.entries(s)
    .map(([t, cols]) => `- ${t}(${cols.map(c => c.col).join(", ")})`)
    .join("\n");
}

async function ejecutarConRetry(pregunta, sqlInicial, { maxIntentos = 3 } = {}) {
  let sql = sqlInicial;
  let ultimoError = null;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      const safe = sqlGuard.validar(sql);
      const r = await db.query(safe);
      return { ok: true, rows: r.rows, sql: safe, intento };
    } catch (e) {
      ultimoError = e.message;
      errMem.registrar(sql, ultimoError);
      if (intento === maxIntentos) break;

      // pedir corrección al LLM
      try {
        const esquemaTxt = await esquemaResumido();
        const sys = buildSystemPrompt(esquemaTxt) +
          "\n\n" + errMem.comoTextoParaPrompt(5);
        const user = `Pregunta original: "${pregunta}"
La siguiente consulta falló:
${sql}

ERROR de PostgreSQL: ${ultimoError}

Devuelve SOLO JSON {"sql":"..."} con la consulta CORREGIDA usando SOLO tablas/columnas que existan en el esquema.`;
        const out = await ai.chat(
          [{ role: "system", content: sys }, { role: "user", content: user }],
          { json: true }
        );
        const parsed = JSON.parse(out || "{}");
        if (parsed.sql && parsed.sql !== sql) {
          sql = parsed.sql;
          continue;
        }
        break;
      } catch (e2) {
        ultimoError = `${ultimoError}; correccion: ${e2.message}`;
        break;
      }
    }
  }
  return { ok: false, error: ultimoError, sql };
}

module.exports = { ejecutarConRetry, esquemaResumido };
