// ─────────────────────────────────────────────────────────────────
// chat.controller.js
// - AI_ENABLED se evalúa POR PETICIÓN (permite toggle runtime).
// - chatStream cae a respuesta normal si no hay proveedor con stream.
// - El fallback NL→SQL solo corre si la IA está activa Y respondió.
// ─────────────────────────────────────────────────────────────────

const db           = require("../config/db");
const ai           = require("../config/ai");
const agents       = require("../services/agents");
const intentRouter = require("../services/intent.router");
const memory       = require("../services/memory.service");
const cache        = require("../services/cache.service");
const rag          = require("../services/rag.service");
const nlp          = require("../services/nlp.engine");
const sqlGuard     = require("../services/sql.guard");
const sqlRetry     = require("../services/sql.retry");
const resultVal    = require("../services/result.validator");
const errMem       = require("../services/error.memory");
const { buildSystemPrompt } = require("../services/intelligence.rules");

function aiEnabled() {
  try {
    return typeof ai.enabled === "function" ? ai.enabled() : !!ai.enabled;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// CORE INTELIGENTE
// ─────────────────────────────────────────────
async function procesarPregunta(pregunta, historial = [], userId = null) {
  const t0 = Date.now();
  const AI_ON = aiEnabled();

  const cacheKey = `${userId || "guest"}:${(pregunta || "").toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cache: true, latencia: Date.now() - t0 };

  const parsed = nlp.parse(pregunta || "");
  const agenteName = await intentRouter.elegirAgente(pregunta, historial);
  const agente = agents[agenteName] || agents.smart || agents.ventas;

  let resultado;
  try {
    resultado = await agente.ejecutar({ pregunta, parsed, contexto: historial });
  } catch (e) {
    resultado = {
      agente: agenteName,
      intent: "error",
      datos: null,
      respuesta: `❌ Error en agente ${agenteName}: ${e.message}`,
    };
  }

  // ───────── NL → SQL FALLBACK con planificador + retry + validación ─────────
  const necesitaFallback =
    AI_ON &&
    resultado?.agente !== "analytics" &&
    resultado?.agente !== "engine.v2" &&
    (!resultado?.datos || (Array.isArray(resultado.datos) && resultado.datos.length === 0) ||
      resultado?.intent === "delegar") &&
    !String(resultado?.respuesta || "").includes("❌");

  if (necesitaFallback) {
    try {
      const esquemaTxt = await sqlRetry.esquemaResumido();
      const sys = buildSystemPrompt(esquemaTxt) + "\n\n" + errMem.comoTextoParaPrompt(5) +
        "\n\nDevuelve SOLO JSON {\"sql\":\"...\"} sin explicación.";
      const out = await ai.chat(
        [
          { role: "system", content: sys },
          { role: "user", content: pregunta },
        ],
        { json: true }
      );
      if (out) {
        const parsedSQL = JSON.parse(out || "{}");
        const sql = parsedSQL.sql;
        if (sql) {
          const exec = await sqlRetry.ejecutarConRetry(pregunta, sql, { maxIntentos: 3 });
          if (exec.ok && exec.rows?.length) {
            const tablas = resultVal.extraerTablas(exec.sql);
            const chk = await resultVal.validar({ rows: exec.rows, tablasReferidas: tablas });
            resultado = {
              agente: "sql",
              intent: "nl2sql",
              datos: exec.rows,
              sql: exec.sql,
              respuesta: chk.ok
                ? `🔎 Encontré ${exec.rows.length} registros${exec.intento > 1 ? ` (autocorregido en intento ${exec.intento})` : ""}`
                : `🔎 ${exec.rows.length} resultados. ${chk.motivo}`,
            };
          } else if (!exec.ok) {
            resultado = {
              ...resultado,
              respuesta: `⚠️ No pude generar una consulta válida tras 3 intentos. Último error: ${exec.error}`,
            };
          }
        }
      }
    } catch (err) {
      console.error("NL2SQL error:", err.message);
    }
  }

  const finalResult = { ...resultado, cache: false, latencia: Date.now() - t0 };
  cache.set(cacheKey, finalResult);
  return finalResult;
}

// ─────────────────────────────────────────────
// CHAT NORMAL
// ─────────────────────────────────────────────
async function chat(req, res) {
  const { pregunta, sesionId: sIn } = req.body || {};
  if (!pregunta?.trim()) return res.status(400).json({ ok: false, error: "pregunta requerida" });

  const userId = req.user?.id || 1;
  let sesionId = sIn;

  if (!sesionId) {
    try {
      const s = await memory.nuevaSesion(userId, (pregunta || "").slice(0, 80));
      sesionId = s?.id || s?.ID || null;
    } catch (e) {
      console.warn("memory.nuevaSesion error:", e.message);
    }
  }

  try { if (sesionId) await memory.guardar(sesionId, "user", pregunta); } catch (_) {}

  let historial = [];
  try { if (sesionId) historial = await memory.historial(sesionId, 10); } catch (_) {}

  const resultado = await procesarPregunta(pregunta, historial, userId);

  try {
    if (sesionId) {
      await memory.guardar(sesionId, "assistant", resultado?.respuesta || "", resultado?.agente, resultado?.datos);
    }
  } catch (_) {}

  return res.json({
    ok: true,
    sesionId,
    modo: aiEnabled() ? "ai" : "offline",
    ...resultado,
  });
}

// ─────────────────────────────────────────────
// STREAMING SSE  (cae a respuesta normal si no hay IA con stream)
// ─────────────────────────────────────────────
async function chatStream(req, res) {
  const { pregunta, sesionId: sIn } = req.body || {};
  if (!pregunta?.trim()) return res.status(400).json({ error: "pregunta requerida" });

  // Sin proveedor con streaming → respondemos como /api/chat (offline-friendly)
  const status = ai.getStatus();
  if (!(status.provider === "ollama" && status.ollama.enabled)) {
    return chat(req, res);
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let historial = [];
  try {
    if (sIn) historial = await memory.historial(sIn, 5);
  } catch (_) {}

  try {
    const messages = [
      ...historial.map((m) => ({
        role: m.rol === "user" ? "user" : "assistant",
        content: m.contenido,
      })),
      { role: "user", content: pregunta },
    ];

    await ai.chatStream(messages, (token) => {
      res.write(`data: ${JSON.stringify(token)}\n\n`);
    });

    res.write(`data: [DONE]\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
}

// ─────────────────────────────────────────────
// GUEST CHAT
// ─────────────────────────────────────────────
async function chatGuest(req, res) {
  const { pregunta, historial: histIn } = req.body || {};
  if (!pregunta?.trim()) return res.status(400).json({ error: "pregunta requerida" });

  const historial = Array.isArray(histIn) ? histIn.slice(-10) : [];
  try {
    const resultado = await procesarPregunta(pregunta, historial, null);
    res.json({ ok: true, modo: aiEnabled() ? "ai" : "offline", ...resultado });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno: " + e.message });
  }
}

// ─────────────────────────────────────────────
// SESIONES / MONITOR / RAG
// ─────────────────────────────────────────────
async function listarSesiones(req, res) {
  try {
    const sesiones = await memory.listarSesiones(req.user?.id || 1);
    res.json({ ok: true, sesiones });
  } catch (e) {
    res.json({ ok: true, sesiones: [], warning: e.message });
  }
}

async function historial(req, res) {
  try {
    const mensajes = await memory.historial(req.params.id, 100);
    res.json({ ok: true, mensajes });
  } catch (e) {
    res.json({ ok: true, mensajes: [], warning: e.message });
  }
}

async function monitoreo(_req, res) {
  try {
    const stats = await db.query(`
      SELECT COUNT(*)::int total,
             COALESCE(AVG(latencia_ms),0)::int latencia_avg,
             COUNT(*) FILTER (WHERE error IS NOT NULL)::int errores,
             COUNT(*) FILTER (WHERE creado_en > NOW()-INTERVAL '1 hour')::int ultima_hora
      FROM logs_ia
    `);
    const intents = await db.query(`
      SELECT intent, COUNT(*)::int n FROM logs_ia GROUP BY intent ORDER BY n DESC LIMIT 10
    `);
    res.json({
      ok: true,
      ...stats.rows[0],
      top_intents: intents.rows,
      cache: cache.stats(),
      modo: aiEnabled() ? "ai" : "offline",
      ai: ai.getStatus(),
    });
  } catch (e) {
    res.json({ ok: true, total: 0, errores: 0, warning: e.message, cache: cache.stats(), ai: ai.getStatus() });
  }
}

async function ingestar(req, res) {
  const { titulo, fuente, contenido, tags } = req.body || {};
  if (!contenido) return res.status(400).json({ error: "contenido requerido" });
  const id = await rag.ingest(titulo || "Sin título", fuente || "manual", contenido, tags || []);
  res.json({ ok: true, id });
}

module.exports = { chat, chatGuest, chatStream, listarSesiones, historial, monitoreo, ingestar };
