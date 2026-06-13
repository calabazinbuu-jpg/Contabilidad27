// ─────────────────────────────────────────────────────────────────
// server.js — v11 (pipeline unificado INTERNET / IA / BD)
//
//  PIPELINE UNIFICADO:
//   0) Cache rápido
//   1) Clasificación híbrida (INTERNET | IA | BD)
//   2A) INTERNET → internet.tools (dólar, cripto, commodities)
//   2B) IA       → Ollama (definiciones, conceptos, conversación)
//   2C) BD       → offline pipeline (rulesEngine → knowledge → engine.v2 → agentes)
//
//  Endpoints:
//   POST /api/chat          — pipeline unificado (principal)
//   POST /api/chat/stream   — SSE token a token (Ollama)
//   POST /api/hybrid        — motor híbrido directo (legacy)
//   GET  /api/hybrid/intent — solo clasificar sin ejecutar
//   GET  /api/health        — estado del sistema
//   GET  /api/kpis          — métricas del dashboard
// ─────────────────────────────────────────────────────────────────
require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");

const ai           = require("./config/ai");
const db           = require("./config/db");
const agents       = require("./services/agents");
const intentRouter = require("./services/intent.router");
const nlp          = require("./services/nlp.engine");
const cache        = require("./services/cache.service");
const sqlGuard     = require("./services/sql.guard");
const engineV2     = require("./services/engine.v2");
const knowledge    = require("./services/knowledge.base");
const rulesEngine  = require("./services/rulesEngine.service");
const businessRules = require("./services/businessRules.service");
const schemaCache  = require("./services/schemaCache.service");
const schemaCatalog = require("./services/schemaCatalog.service");
const businessEntities = require("./services/businessEntities.service");
const queryValidator   = require("./services/queryValidator.service");
const queryHistory     = require("./services/queryHistory.service");


// ─── Motor Híbrido (clasificador + internet) ──────────────────────
const hybridRouter   = require("./services/hybrid/router.intent");
const hybridInternet = require("./services/hybrid/internet.tools");
const hybridEngine   = require("./services/hybrid/hybrid.engine");
const hybridSchema   = require("./services/hybrid/schema.repair");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));

const EXPORT_DIR = path.join(__dirname, "exportaciones");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
app.use("/exportaciones", express.static(EXPORT_DIR));

const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);

// ─── Bootstrap: tablas auxiliares (idempotente) ───────────────────
async function bootstrapTablas() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS logs_ia (
        id SERIAL PRIMARY KEY, intent TEXT, pregunta TEXT,
        agente TEXT, latencia_ms INT, error TEXT,
        creado_en TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sesiones (
        id SERIAL PRIMARY KEY, usuario_id INT, titulo TEXT,
        creado_en TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS mensajes (
        id SERIAL PRIMARY KEY, sesion_id INT, rol TEXT, contenido TEXT,
        agente TEXT, datos JSONB, creado_en TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS documentos_rag (
        id SERIAL PRIMARY KEY, titulo TEXT, fuente TEXT, contenido TEXT,
        tags TEXT[] DEFAULT '{}', creado_en TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS embeddings_doc (
        id SERIAL PRIMARY KEY,
        documento_id INT REFERENCES documentos_rag(id) ON DELETE CASCADE,
        chunk TEXT, vector TEXT
      );
    `);
    console.log("✅ Tablas auxiliares verificadas");
  } catch (e) { console.warn("⚠️ bootstrapTablas:", e.message); }
}
bootstrapTablas();

// ─── Bootstrap: catálogo de esquema en memoria (tablas/columnas/relaciones) ──
//  Cumple las instrucciones del ERP: al arrancar, carga metadata real de la BD
//  (tablas, columnas, FOREIGN KEY) y la guarda en memoria para construir JOINs
//  automáticos y aplicar filtros por empresa_id.
async function bootstrapCatalogo() {
  try {
    await schemaCatalog.construir();
    const r = schemaCatalog.resumen();
    console.log(`✅ Catálogo en memoria: ${r.tablas} tablas, ${r.relaciones} relaciones, ${r.tablas_multiempresa} multiempresa`);
    // Capa de negocio: clasificación automática de tablas → entidades (supplier, customer, ...)
    await businessEntities.construir();
    const b = businessEntities.resumen();
    console.log(`✅ Entidades de negocio: ${b.entidades} entidades, ${b.tablas_mapeadas} tablas mapeadas`);
  } catch (e) { console.warn("⚠️ bootstrapCatalogo:", e.message); }
}
bootstrapCatalogo();


// ─────────────────────────────────────────────────────────────────
//  PIPELINE UNIFICADO (v13 — AI ROUTER INTELIGENTE 5 MODOS)
//
//  Orden de prioridad:
//   1. Clasificar con hybridRouter → REGLAS | INTERNET | BD | ARQUITECTURA | IA
//   2. 🟢 REGLAS      → respuesta inmediata sin IA (saludos, menú, comandos)
//   3. 🌐 INTERNET    → datos en tiempo real (dólar, cripto, commodities)
//   4. 🗄️ BD          → pipeline offline-first (reglas → knowledge → v2 → agentes → NL2SQL)
//   5. ⚙️ ARQUITECTURA → auto-detección módulos faltantes / diagnóstico
//   6. 🟡 IA          → Ollama/offline (contador humano, no académico)
// ─────────────────────────────────────────────────────────────────
const reglasEngine_  = require("./services/reglas.engine");
const autoExpansion_ = require("./services/autoexpansion.service");
async function procesarBD(pregunta, historial, parsed, cacheKey, t0) {
  const AI_ON = (typeof ai.enabled === "function") ? ai.enabled() : false;

  // BD-0a: Rescatar preguntas conceptuales que llegaron aquí por error de routing
  // (ej: "explícame el flujo de caja" → tiene entidad ERP + apertura conceptual)
  const RX_CONCEPTO_BD = /\b(qu[eé]\s+(es|son|significa[n]?)|c[oó]mo\s+(funciona[s]?|se\s+(calcula|aplica|usa|hace))|para\s+qu[eé]\s+sirve[n]?|defin|expl[ií]c[aá](me|r|rs?)?|diferencia\s+(entre|del?)|en\s+qu[eé]\s+consiste|habla(me)?\s+(de|sobre)|cu[eé]ntame\s+qu[eé]\s+es)\b/i;
  if (RX_CONCEPTO_BD.test(pregunta)) {
    const conceptoR = reglasEngine_.responder(pregunta);
    if (conceptoR) {
      return { ...conceptoR, cache: false, latencia: Date.now() - t0 };
    }
  }

  // BD-0b: Proyección de columnas específicas ("clientes con su correo", "proveedores solo nombre y RUC")
  // → rulesEngine no soporta proyección → ir directo al agente específico
  const RX_PROYECCION = /\b(con\s+su[s]?|solo|s[oó]lo|[uú]nicamente|dame\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:nombre|correo|email|tel[eé]fono|ruc|precio|stock|ciudad)|muestra(?:me)?\s+(?:solo|s[oó]lo)\s+|solo\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:nombre|correo|email|tel|ruc|precio|stock))\b/i;
  const RX_ENTI_LISTA  = /\b(cliente[s]?|proveedor(es)?|producto[s]?|factura[s]?|venta[s]?)\b/i;
  if (RX_PROYECCION.test(pregunta) && RX_ENTI_LISTA.test(pregunta) && !/excel|xlsx/i.test(pregunta)) {
    const entiMatch = pregunta.match(RX_ENTI_LISTA);
    const entidad   = entiMatch ? entiMatch[0].toLowerCase().replace(/[aeiou]$/,"") + "s" : null;
    const agEnt     = entidad && agents[entidad.replace(/s$/,"")] ? agents[entidad.replace(/s$/,"")] : null;
    if (agEnt) {
      try {
        const r = await agEnt.ejecutar({ pregunta, parsed, contexto: historial });
        if (r && r.respuesta) {
          const out = { ...r, modo: "BD", cache: false, latencia: Date.now() - t0 };
          cache.set(cacheKey, out);
          return out;
        }
      } catch (e) { console.warn("proyeccion agent error:", e.message); }
    } else if (entidad) {
      try {
        const r = await agents.smart.ejecutar({ pregunta, parsed, contexto: historial });
        if (r && r.respuesta) {
          const out = { ...r, modo: "BD", cache: false, latencia: Date.now() - t0 };
          cache.set(cacheKey, out);
          return out;
        }
      } catch (e) { console.warn("proyeccion smart error:", e.message); }
    }
  }

  // BD-0: Excel / exportación → va directo a smart.agent (no a knowledge ni rules)
  if (/\b(excel|xlsx|exportar|export[aá]me|exp[oó]rtame|descargar|descarga|hoja de c[aá]lculo)\b/i.test(pregunta)) {
    try {
      const r = await agents.smart.ejecutar({ pregunta, parsed, contexto: historial });
      if (r && r.respuesta) {
        const out = { ...r, modo: "BD", cache: false, latencia: Date.now() - t0 };
        cache.set(cacheKey, out);
        return out;
      }
    } catch (e) { console.warn("smart.excel error:", e.message); }
  }

  // BD-1: Motor de reglas empresariales
  try {
    const re = await rulesEngine.responder(pregunta, ai);
    if (re && re.respuesta) {
      const out = { ...re, modo: "BD", cache: false, latencia: Date.now() - t0 };
      cache.set(cacheKey, out);
      return out;
    }
  } catch (e) { console.warn("rulesEngine error:", e.message); }

  // BD-2: Knowledge Base (120+ patrones ERP/contabilidad)
  try {
    const kb = await knowledge.responder(pregunta);
    if (kb && kb.respuesta) {
      const out = { ...kb, modo: "BD", cache: false, latencia: Date.now() - t0 };
      cache.set(cacheKey, out);
      return out;
    }
  } catch (e) { console.warn("knowledge.base error:", e.message); }

  // BD-3: Motor determinista v2
  try {
    const e2 = await engineV2.responder(pregunta);
    if (e2 && !e2.fallback && e2.respuesta && e2.intent !== "error") {
      const out = { ...e2, modo: "BD", cache: false, latencia: Date.now() - t0 };
      cache.set(cacheKey, out);
      return out;
    }
    if (e2?.fallback) console.log("engine.v2 fallback:", e2.motivo);
  } catch (e) { console.warn("engine.v2 error:", e.message); }

  // BD-4: Financial agent
  try {
    const fin = await agents.financial.ejecutar({ pregunta, parsed });
    if (fin && fin.respuesta) {
      const out = { ...fin, modo: "BD", cache: false, latencia: Date.now() - t0 };
      cache.set(cacheKey, out);
      return out;
    }
  } catch (e) { console.warn("financial agent error:", e.message); }

  // BD-5: Router → agente específico
  const agenteName = intentRouter.elegirAgente(pregunta);
  const agente = agents[agenteName] || agents.smart;
  let resultado;
  try {
    resultado = await agente.ejecutar({ pregunta, parsed, contexto: historial });
  } catch (e) {
    resultado = { agente: agenteName, intent: "error", datos: null,
      respuesta: `❌ Error al consultar: ${e.message}` };
  }

  // BD-6: NL→SQL fallback (solo si IA activa y agente no encontró datos)
  const sinDatos = resultado?.datos === undefined ||
    (Array.isArray(resultado.datos) && resultado.datos.length === 0);
  const esConversacion = ["charla", "calc"].includes(resultado?.agente);

  if (AI_ON && !esConversacion && sinDatos && !String(resultado?.respuesta || "").includes("❌")) {
    try {
      const sys = `Eres un experto SQL para PostgreSQL contable.
Tablas: empresas, clientes, proveedores, productos, facturas, ventas, compras,
movimientos_inventario, cuentas_bancarias, movimientos_tesoreria, pagos.
Columnas: id, empresa_id, fecha, total, saldo, cliente_id, proveedor_id, nombre, precio, stock, estado.
Devuelve SOLO JSON: {"sql":"SELECT ..."} (un SELECT seguro sin punto y coma, con LIMIT 20).`;
      const out = await ai.chat([
        { role: "system", content: sys },
        { role: "user", content: pregunta },
      ], { json: true, temperature: 0 });
      if (out) {
        const j = JSON.parse(out);
        if (j.sql) {
          const safe = sqlGuard.validar(j.sql);
          const r = await db.query(safe);
          if (r?.rowCount > 0) {
            resultado = {
              agente: "sql", intent: "nl2sql", modo: "BD",
              datos: r.rows, sql: safe,
              respuesta: `🔎 Encontré ${r.rowCount} registro(s):\n\n` +
                r.rows.slice(0, 15).map((row, i) =>
                  `${i + 1}. ${Object.values(row).slice(0, 4).join(" · ")}`).join("\n"),
            };
          }
        }
      }
    } catch (err) { console.warn("NL2SQL error:", err.message); }
  }

  const final = { ...resultado, modo: "BD", cache: false, latencia: Date.now() - t0 };
  cache.set(cacheKey, final);
  return final;
}

async function procesar(pregunta, historial = []) {
  const t0 = Date.now();
  const AI_ON = (typeof ai.enabled === "function") ? ai.enabled() : false;

  const cacheKey = `q:${(pregunta || "").toLowerCase().trim()}`;
  const hit = cache.get(cacheKey);
  if (hit) return { ...hit, cache: true, latencia: Date.now() - t0 };

  const parsed = nlp.parse(pregunta || "");

  // ─── PASO 0: Clasificación híbrida (5 modos) ─────────────────────
  const intent = hybridRouter.clasificar(pregunta);
  console.log(`[ROUTER] modo=${intent.modo} conf=${intent.confianza.toFixed(2)} | ${intent.motivo} | "${pregunta.slice(0,60)}"`);

  // ─────────────────────────────────────────────────────────────────
  //  A) 🟢 REGLAS: saludos, menú, comandos instantáneos (< 1 ms)
  // ─────────────────────────────────────────────────────────────────
  if (intent.modo === "REGLAS") {
    const r = reglasEngine_.responder(pregunta);
    if (r) {
      return { ...r, cache: false, latencia: Date.now() - t0 };
    }
    // Sin coincidencia en el engine de reglas → caer a IA (charla)
    intent.modo = "IA";
  }

  // ─────────────────────────────────────────────────────────────────
  //  B) ⚙️ ARQUITECTURA: módulos faltantes, errores de flujo, diseño
  // ─────────────────────────────────────────────────────────────────
  if (intent.modo === "ARQUITECTURA") {
    const r = autoExpansion_.responder(pregunta);
    return { ...r, cache: false, latencia: Date.now() - t0 };
  }

  // ─────────────────────────────────────────────────────────────────
  //  C) INTERNET: datos en tiempo real (dólar, cripto, commodities)
  // ─────────────────────────────────────────────────────────────────
  if (intent.modo === "INTERNET") {
    try {
      const r = await hybridInternet.resolverDesdeTexto(pregunta);
      if (r && r.texto) {
        const out = {
          agente: "internet", intent: "internet", modo: "INTERNET",
          respuesta: r.texto, datos: r.datos, fuente: r.datos?.fuente,
          cache: false, latencia: Date.now() - t0,
        };
        cache.set(cacheKey, out);
        return out;
      }
    } catch (e) {
      console.warn("⚠️ internet.tools error:", e.message);
      // Fallback: Ollama si disponible, con aviso de sin conexión
      if (AI_ON) {
        try {
          const resp = await ai.chat([
            { role: "system", content: "Eres un asistente financiero. El servicio de cotizaciones en tiempo real no está disponible ahora mismo. Indica esto brevemente y si conoces el valor aproximado (no garantizado), menciónalo con advertencia. Responde en español." },
            { role: "user", content: pregunta },
          ], { temperature: 0.2 });
          if (resp) {
            return {
              agente: "ollama_fallback", intent: "internet_sin_conexion", modo: "INTERNET",
              respuesta: resp, cache: false, latencia: Date.now() - t0,
            };
          }
        } catch (_) {}
      }
      return {
        agente: "internet", intent: "internet_error", modo: "INTERNET",
        respuesta: "⚠️ No pude conectarme a la fuente de datos en este momento. Intenta nuevamente en unos segundos.",
        cache: false, latencia: Date.now() - t0,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  D) 🟡 IA: razonamiento contable (contador humano, no académico)
  //     Orden: aritmética → conceptual offline → Ollama → charla → fallback
  // ─────────────────────────────────────────────────────────────────
  if (intent.modo === "IA") {
    // D1) Aritmética → calc agent siempre
    if (parsed.aritm) {
      try {
        const r = await agents.calc.ejecutar({ pregunta, parsed, contexto: historial });
        const out = { ...r, modo: "IA", cache: false, latencia: Date.now() - t0 };
        cache.set(cacheKey, out);
        return out;
      } catch (e) { console.warn("calc agent error:", e.message); }
    }

    // D2) Preguntas conceptuales (qué es, explica, diferencia, cómo funciona)
    //     → SIEMPRE verificar CONCEPTOS OFFLINE primero, luego knowledge (filtrando BD-format)
    const RX_CONCEPTO_IA = /\b(qu[eé]\s+(es|son|significa[n]?|representa[n]?)|c[oó]mo\s+(funciona[s]?|se\s+(calcula|aplica|usa|hace))|para\s+qu[eé]\s+sirve[n]?|defin|explic[aá](me|r|rs?)?|diferencia\s+(entre|del?)|en\s+qu[eé]\s+consiste|habla(me)?\s+(de|sobre)|cu[eé]ntame\s+qu[eé]\s+es)\b/i;
    if (RX_CONCEPTO_IA.test(pregunta)) {
      // D2-0) CONCEPTOS OFFLINE — respuestas pre-programadas estilo contador humano
      const conceptoR = reglasEngine_.responder(pregunta);
      if (conceptoR) {
        const out = { ...conceptoR, cache: false, latencia: Date.now() - t0 };
        cache.set(cacheKey, out);
        return out;
      }
      // D2a) Knowledge base — SOLO si NO devuelve respuesta BD-format (📊, S/ 0, Nivel de confianza)
      try {
        const kb = await knowledge.responder(pregunta);
        const kbTxt = String(kb?.respuesta || "");
        const esBdFormat = kbTxt.includes("📊") || kbTxt.includes("Nivel de confianza") || kbTxt.includes("S/ 0");
        if (kb && kb.respuesta && !esBdFormat && !kbTxt.includes("No encontré")) {
          const out = { ...kb, modo: "IA", agente: kb.agente || "knowledge", cache: false, latencia: Date.now() - t0 };
          cache.set(cacheKey, out);
          return out;
        }
      } catch (e) { console.warn("knowledge.base concepto:", e.message); }
      // D2b) Rules engine — SOLO si no devuelve formato BD
      try {
        const re = await rulesEngine.responder(pregunta, ai);
        const reTxt = String(re?.respuesta || "");
        const esBdFormat = reTxt.includes("📊") || reTxt.includes("Nivel de confianza") || reTxt.includes("S/ 0");
        if (re && re.respuesta && !esBdFormat && !reTxt.includes("No encontré")) {
          const out = { ...re, modo: "IA", cache: false, latencia: Date.now() - t0 };
          cache.set(cacheKey, out);
          return out;
        }
      } catch (e) { console.warn("rulesEngine concepto:", e.message); }
    }

    // D3) Charla simple (saludos no capturados por REGLAS, conversación breve)
    if (parsed.charla && !RX_CONCEPTO_IA.test(pregunta)) {
      try {
        const r = await agents.charla.ejecutar({ pregunta, parsed, contexto: historial });
        const out = { ...r, modo: "IA", cache: false, latencia: Date.now() - t0 };
        cache.set(cacheKey, out);
        return out;
      } catch (e) { console.warn("charla agent error:", e.message); }
    }

    // D4) Ollama / OpenAI — prompt estilo contador humano (NO académico)
    if (AI_ON) {
      try {
        const _ahora = new Date();
        const _fecha = _ahora.toLocaleDateString("es-PE", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
        const _hora  = _ahora.toLocaleTimeString("es-PE");
        const sys = `Eres un contador y asesor empresarial con 15 años de experiencia en Perú. Tu nombre es NEXUS.

CÓMO DEBES RESPONDER (obligatorio):
✅ Como un contador humano que habla claro y da ejemplos reales
✅ Lenguaje simple y directo (NO jerga académica)
✅ Siempre dar un ejemplo concreto con números en Soles (S/)
✅ Máximo 5-6 líneas para conceptos (no te extiendas)
✅ Fórmula DESPUÉS de la explicación, no antes

❌ NUNCA hagas esto:
❌ Responder como libro de texto ("El IGV es un impuesto indirecto al valor agregado...")
❌ Dar solo fórmulas sin contexto
❌ Inventar números de ventas, facturas o clientes

EJEMPLO CORRECTO:
Pregunta: "¿qué es el IGV?"
✅ "El IGV es el impuesto que le cobras a tu cliente al vender. Si vendes S/ 100,
en realidad son S/ 84.75 de precio + S/ 15.25 de IGV (18%). Ese IGV lo pagas a SUNAT.
Fórmula: IGV = Base × 18%"

CONTEXTO: País: Perú · Moneda: Soles (S/) · IGV = 18% · Fecha: ${_fecha}, ${_hora}
REGLA: Si te piden datos del negocio (ventas, facturas) → indica que están en la base de datos.`;
        const messages = [
          { role: "system", content: sys },
          ...((historial || []).slice(-6).map(h => ({
            role: h.rol || h.role || "user",
            content: h.contenido || h.content || "",
          }))),
          { role: "user", content: pregunta },
        ];
        const resp = await ai.chat(messages, { temperature: 0.3 });
        if (resp && resp.trim()) {
          const out = {
            agente: "ollama", intent: "ia_concepto", modo: "IA",
            respuesta: resp, datos: null,
            cache: false, latencia: Date.now() - t0,
          };
          cache.set(cacheKey, out);
          return out;
        }
      } catch (e) { console.warn("⚠️ Ollama error:", e.message); }
    }

    // D5) Fallback offline completo — knowledge → rules → charla
    try {
      const kb = await knowledge.responder(pregunta);
      if (kb && kb.respuesta) return { ...kb, modo: "IA", cache: false, latencia: Date.now() - t0 };
    } catch (_) {}
    try {
      const re = await rulesEngine.responder(pregunta, ai);
      if (re && re.respuesta) return { ...re, modo: "IA", cache: false, latencia: Date.now() - t0 };
    } catch (_) {}
    try {
      const r = await agents.charla.ejecutar({ pregunta, parsed: { ...parsed, charla: "ayuda" }, contexto: historial });
      return { ...r, modo: "IA", cache: false, latencia: Date.now() - t0 };
    } catch (_) {}

    return {
      agente: "offline", intent: "ia_offline", modo: "IA",
      respuesta: "🤖 IA no disponible ahora. Puedo ayudarte con datos del negocio: *ventas, facturas, clientes, inventario*. También puedo consultar cotizaciones (dólar, euro).",
      cache: false, latencia: Date.now() - t0,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  C) BD: datos internos del ERP
  //     → Pipeline offline-first
  // ─────────────────────────────────────────────────────────────────
  return procesarBD(pregunta, historial, parsed, cacheKey, t0);
}

// ─────────────────────────────────────────────────────────────────
//  ENDPOINTS PRINCIPALES
// ─────────────────────────────────────────────────────────────────

// Knowledge Base inspection
app.get("/api/knowledge", (_req, res) => {
  res.json({ ok: true, total: knowledge._dataset.length, items: knowledge._dataset });
});

// Business Rules
app.get("/api/rules", (_req, res) => {
  const all = businessRules.todas();
  res.json({ ok: true, total: all.length, items: all });
});
app.get("/api/rules/:id", (req, res) => {
  const r = businessRules.porId(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: "no encontrada" });
  res.json({ ok: true, regla: r });
});
app.post("/api/rules/reload", (_req, res) => {
  businessRules.recargar();
  schemaCache.invalidar();
  res.json({ ok: true, total: businessRules.todas().length });
});
app.get("/api/schema", async (_req, res) => {
  try {
    const s = await schemaCache.get();
    res.json({ ok: true, tablas: Object.keys(s).length, esquema: s });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── CAPA DE NEGOCIO (entidades, sinónimos, confianza, historial) ──
// business_entities.json en vivo (entidad → tablas reales)
app.get("/api/business/entities", async (req, res) => {
  try {
    const refrescar = req.query.refresh === "1";
    const be = await businessEntities.get({ refrescar });
    res.json({ ok: true, resumen: businessEntities.resumen(), business_entities: be.simple, detalle: be.full });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Resolver un término de negocio → entidad + tablas reales + confianza
app.get("/api/business/resolve", async (req, res) => {
  try {
    await businessEntities.get();
    const termino = req.query.q || req.query.termino || "";
    res.json({ ok: true, ...businessEntities.resolverEntidad(termino) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Validación previa + ranking de confianza de una consulta
app.post("/api/query/validate", async (req, res) => {
  try {
    const { sql, tabla, columnas, joins, empresaId } = req.body || {};
    const r = await queryValidator.validar({ sql, tabla, columnas, joins, empresaId });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Historial de consultas exitosas (aprendizaje)
app.get("/api/query/history", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json({ ok: true, resumen: queryHistory.resumen(), historial: queryHistory.listar({ limit }) });
});
app.post("/api/query/history", (req, res) => {
  try {
    queryHistory.registrar(req.body || {});
    res.json({ ok: true, resumen: queryHistory.resumen() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get("/api/query/similar", (req, res) => {
  const match = queryHistory.buscarSimilar(req.query.q || "");
  res.json({ ok: true, match });
});


app.post("/api/chat/guest", async (req, res) => {
  try {
    const pregunta = (req.body?.pregunta || req.body?.texto || "").trim();
    if (!pregunta) return res.status(400).json({ ok: false, error: "pregunta requerida" });
    const historial = Array.isArray(req.body?.historial) ? req.body.historial.slice(-10) : [];
    const r = await procesar(pregunta, historial);
    return res.json({ ok: true, ai_activo: (typeof ai.enabled === "function") ? ai.enabled() : false, ...r });
  } catch (err) {
    console.error("/api/chat/guest:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── AUTH ─────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth.routes"));

// ─── CHAT PRINCIPAL ───────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const pregunta = (req.body?.pregunta || req.body?.texto || "").trim();
    if (!pregunta) return res.status(400).json({ ok: false, error: "pregunta requerida" });
    const r = await procesar(pregunta, req.body?.historial || []);
    return res.json({ ok: true, ai_activo: (typeof ai.enabled === "function") ? ai.enabled() : false, ...r });
  } catch (err) {
    console.error("/api/chat:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── HÍBRIDO — endpoints legacy/alternativos ──────────────────────
app.post("/api/hybrid", async (req, res) => {
  try {
    const pregunta = (req.body?.pregunta || req.body?.texto || "").trim();
    if (!pregunta) return res.status(400).json({ ok: false, error: "pregunta requerida" });
    const r = await hybridEngine.responder(pregunta, req.body?.historial || []);
    return res.json(r);
  } catch (err) {
    console.error("/api/hybrid:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Clasificar sin ejecutar (útil para debug)
app.get("/api/hybrid/intent", (req, res) => {
  const q = String(req.query.q || "").trim();
  res.json({ ok: true, pregunta: q, ...hybridRouter.clasificar(q) });
});

app.post("/api/hybrid/schema/ensure", async (req, res) => {
  try {
    const spec = req.body?.spec || hybridEngine.ESQUEMA_BASE;
    const cambios = await hybridSchema.asegurarEsquema(spec);
    res.json({ ok: true, cambios });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/hybrid/internet", async (req, res) => {
  try {
    const q = String(req.query.q || "dólar hoy");
    const r = await hybridInternet.resolverDesdeTexto(q);
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/hybrid/audit", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const r = await hybridEngine.auditar({ desde, hasta });
    res.json(r);
  } catch (e) { res.json({ ok: true, degradado: true, error: e.message }); }
});

app.get("/api/hybrid/health", async (_req, res) => {
  try { res.json(await hybridEngine.salud()); }
  catch (e) { res.json({ ok: true, modo_global: "degradado", error: e.message }); }
});

// ─── STREAM SSE ───────────────────────────────────────────────────
app.post("/api/chat/stream", async (req, res) => {
  const pregunta = (req.body?.pregunta || req.body?.texto || "").trim();
  if (!pregunta) return res.status(400).json({ error: "pregunta requerida" });

  const status = ai.getStatus();
  const puedeStream = status.provider === "ollama" && status.ollama.enabled;

  // Clasificar primero: si es BD → responder sin LLM (más rápido)
  const intent = hybridRouter.clasificar(pregunta);
  const debeUsarStream = intent.modo !== "BD" && puedeStream;

  if (!debeUsarStream) {
    // Respuesta directa (no-stream) para BD e INTERNET
    const r = await procesar(pregunta, req.body?.historial || []);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ chunk: r.respuesta })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, meta: { agente: r.agente, modo: r.modo, latencia: r.latencia } })}\n\n`);
    return res.end();
  }

  // Stream Ollama para preguntas de IA
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const sys = intent.modo === "INTERNET"
    ? "Eres un asistente financiero. Si te preguntan cotizaciones en tiempo real, indica que el servicio externo no está disponible por stream y sugieren usar /api/chat. Responde en español, breve."
    : `Eres un asistente experto en negocios, contabilidad y ERP. Responde en español, claro y conciso (máx 5 líneas). Usa markdown ligero. Si no tienes datos exactos, dilo claramente.`;

  try {
    const t0 = Date.now();
    const messages = [
      { role: "system", content: sys },
      ...((req.body?.historial || []).slice(-4).map(h => ({
        role: h.rol || h.role || "user",
        content: h.contenido || h.content || "",
      }))),
      { role: "user", content: pregunta },
    ];
    await ai.chatStream(messages, (tok) => {
      res.write(`data: ${JSON.stringify({ chunk: tok })}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ done: true, meta: { agente: "ollama", modo: "IA", latencia: Date.now() - t0 } })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

// ─── CONFIG IA ────────────────────────────────────────────────────
app.use("/api/config", require("./routes/config.routes"));

// ─── KPIs DASHBOARD ───────────────────────────────────────────────
app.get("/api/kpis", async (_req, res) => {
  try {
    const q = `
      WITH hoy AS (SELECT COALESCE(SUM(total),0)::float AS v
                   FROM facturas WHERE empresa_id=$1 AND fecha::date = CURRENT_DATE),
           mes AS (SELECT COALESCE(SUM(total),0)::float AS v, COUNT(*)::int AS n
                   FROM facturas WHERE empresa_id=$1
                     AND date_trunc('month',fecha)=date_trunc('month',CURRENT_DATE)),
           ano AS (SELECT COALESCE(SUM(total),0)::float AS v
                   FROM facturas WHERE empresa_id=$1
                     AND date_trunc('year',fecha)=date_trunc('year',CURRENT_DATE)),
           cob AS (SELECT COALESCE(SUM(saldo),0)::float AS v
                   FROM facturas WHERE empresa_id=$1 AND saldo>0),
           cli AS (SELECT COUNT(*)::int AS n FROM clientes WHERE empresa_id=$1),
           pro AS (SELECT COUNT(*)::int AS n,
                          COUNT(*) FILTER (WHERE stock <= COALESCE(stock_min,0))::int AS bajo
                   FROM productos WHERE empresa_id=$1)
      SELECT (SELECT v FROM hoy) AS ventas_hoy,
             (SELECT v FROM mes) AS ventas_mes, (SELECT n FROM mes) AS facturas_mes,
             (SELECT v FROM ano) AS ventas_ano,
             (SELECT v FROM cob) AS por_cobrar,
             (SELECT n FROM cli) AS clientes,
             (SELECT n FROM pro) AS productos,
             (SELECT bajo FROM pro) AS stock_bajo`;
    const ZERO = { ventas_hoy:0, ventas_mes:0, facturas_mes:0, ventas_ano:0, por_cobrar:0, clientes:0, productos:0, stock_bajo:0 };
    const r = await db.query(q, [EMP]);
    const data = r.rows[0] || ZERO;
    res.json({ ok: true, ...ZERO, ...data });
  } catch (e) {
    res.json({
      ok: false, error: e.message,
      ventas_hoy: 0, ventas_mes: 0, facturas_mes: 0, ventas_ano: 0,
      por_cobrar: 0, clientes: 0, productos: 0, stock_bajo: 0,
    });
  }
});

// ─── HEALTH ───────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const s = ai.getStatus();
  res.json({
    ok: true, version: "13.0",
    ai: s,
    pipeline: "🟢 REGLAS → 🌐 INTERNET → 🗄️ BD (90%) → ⚙️ ARQUITECTURA → 🟡 IA",
    modos: ["REGLAS", "INTERNET", "BD", "ARQUITECTURA", "IA"],
    cache: (typeof cache.stats === "function") ? cache.stats() : {},
  });
});

// ─── AI ROUTER INFO ───────────────────────────────────────────────
app.get("/api/router/info", (req, res) => {
  const router = require("./services/hybrid/router.intent");
  const reglas = require("./services/reglas.engine");
  const autoex = require("./services/autoexpansion.service");
  const pregunta = String(req.query.q || "");
  const result = { ok: true, version: "13.0", modos: ["REGLAS","INTERNET","BD","ARQUITECTURA","IA"] };
  if (pregunta) result.clasificacion = router.clasificar(pregunta);
  result.reglas_count = reglas.REGLAS.length;
  result.plantillas_count = Object.keys(autoex.PLANTILLAS_MODULOS).length;
  result.plantillas = Object.keys(autoex.PLANTILLAS_MODULOS);
  res.json(result);
});

// ─── AI ROUTER TEST (clasificar sin ejecutar) ─────────────────────
app.post("/api/router/clasificar", (req, res) => {
  try {
    const router = require("./services/hybrid/router.intent");
    const pregunta = String(req.body?.pregunta || "");
    if (!pregunta) return res.status(400).json({ ok: false, error: "pregunta requerida" });
    res.json({ ok: true, pregunta, ...router.clasificar(pregunta) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});



// ─── RESOLVER DE COLUMNAS Y TABLAS ────────────────────────────────
app.get('/api/schema/resolver', async (req, res) => {
  try {
    const concepto = String(req.query.concepto || '');
    const tabla    = String(req.query.tabla || '');
    const schemaRes = require('./services/schemaResolver.service');
    const schema    = await require('./services/schemaCache.service').get();
    const tablas    = Object.keys(schema);
    if (tabla && concepto) {
      const col = await schemaRes.resolverColumna(tabla, concepto);
      return res.json({ ok:true, tabla, concepto, columnaReal: col });
    }
    if (concepto) {
      const resultados = {};
      for (const t of tablas) {
        const col = await schemaRes.resolverColumna(t, concepto);
        if (col) resultados[t] = col;
      }
      return res.json({ ok:true, concepto, encontradoEn: resultados });
    }
    const resumen = await schemaRes.generarResumenEsquema();
    res.json({ ok:true, tablas: Object.keys(resumen).length, esquema: resumen });
  } catch (e) { res.status(500).json({ ok:false, error: e.message }); }
});
// ─── EXCEL EXPORT ──────────────────────────────────────────────────
app.get('/api/export/:tabla', async (req, res) => {
  try {
    const tabla = req.params.tabla.replace(/[^a-z_]/gi, '');
    if (!tabla) return res.status(400).json({ error: 'tabla requerida' });
    const limit = Math.min(parseInt(req.query.limit || '1000', 10), 5000);
    const r = await db.query(`SELECT * FROM ${tabla} LIMIT ${limit}`);
    if (!r.rows.length) return res.json({ ok: false, mensaje: 'Sin datos' });
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(tabla);
    const cols = Object.keys(r.rows[0]);
    ws.columns = cols.map(c => ({ header: c, key: c, width: Math.max(c.length + 4, 14) }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1a2240' } };
    r.rows.forEach(row => ws.addRow(row));
    const fname = `export_${tabla}_${Date.now()}.xlsx`;
    const fpath = require('path').join(__dirname, 'exportaciones', fname);
    await wb.xlsx.writeFile(fpath);
    res.download(fpath, fname);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Exportar resultado de regla como Excel
app.post('/api/export/sql', async (req, res) => {
  try {
    const { sql, nombre } = req.body || {};
    if (!sql) return res.status(400).json({ error: 'sql requerido' });
    const guard = require('./services/sql.guard');
    const safe = guard.validar(sql);
    const r = await db.query(safe);
    if (!r.rows.length) return res.json({ ok: false, mensaje: 'Sin datos para exportar' });
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(nombre || 'Datos');
    const cols = Object.keys(r.rows[0]);
    ws.columns = cols.map(c => ({ header: c.replace(/_/g,' ').toUpperCase(), key: c, width: Math.max(c.length+4, 16) }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF5b6df0' } };
    r.rows.forEach(row => ws.addRow(row));
    const fname = 'export_'+Date.now()+'.xlsx';
    const fpath = require('path').join(__dirname, 'exportaciones', fname);
    await wb.xlsx.writeFile(fpath);
    res.download(fpath, (nombre||'datos').replace(/s+/g,'_')+'.xlsx');
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
// ─── ERROR HANDLER ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("❌ ERROR GLOBAL:", err);
  res.status(500).json({ ok: false, error: err.message || "Error interno" });
});

// ─── START ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const s = ai.getStatus();
console.log("╔══════════════════════════════════════════════════╗");
console.log("║  🤖 IA EMPRESARIAL v11 — Pipeline Unificado      ║");
console.log("║  INTERNET  →  Ollama/IA  →  BD offline           ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`🌐 Internet:   cotizaciones en tiempo real`);
console.log(`🧠 IA:         ${s.provider} ${s.enabled ? "✅ activo" : "🟡 offline"}`);
if (s.provider === "ollama") {
  console.log(`   ↳ ${s.ollama.url}  modelo=${s.ollama.model}  ctx=${s.ollama.num_ctx}`);
}
console.log(`💾 BD:         pipeline offline (rulesEngine + knowledge + engine.v2)`);
// ─── Catálogo de esquema en memoria ───────────────────────────────
// GET /api/schema           → catálogo completo (tablas, columnas, relaciones)
// GET /api/schema/resumen   → resumen rápido
// POST /api/schema/refresh  → vuelve a leer la BD (tras crear tablas/columnas)
app.get("/api/schema", async (_req, res) => {
  try { res.json(await schemaCatalog.get()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/schema/resumen", (_req, res) => res.json(schemaCatalog.resumen()));
app.post("/api/schema/refresh", async (_req, res) => {
  try {
    await schemaCatalog.construir({ refrescar: true });
    res.json({ ok: true, ...schemaCatalog.resumen() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── /api/schema/grafo, /api/schema/patrones, /api/schema/reglas ──
const fsKnow = require("fs");
const pathKnow = require("path");
const KNOW = pathKnow.join(__dirname, "knowledge");
function leerJSON(name, fallback) {
  try { return JSON.parse(fsKnow.readFileSync(pathKnow.join(KNOW, name), "utf8")); }
  catch { return fallback; }
}
app.get("/api/schema/grafo", (_req, res) => res.json(leerJSON("db_graph.json", {})));
app.get("/api/schema/relaciones", (_req, res) => res.json(leerJSON("db_relations.json", [])));
app.get("/api/schema/catalogo", (_req, res) => res.json(leerJSON("db_catalog.json", {})));
app.get("/api/schema/tipos", (_req, res) => res.json(leerJSON("db_types.json", {})));
app.get("/api/schema/patrones", (_req, res) => res.json(leerJSON("query_patterns.json", [])));
app.get("/api/schema/reglas", (_req, res) => {
  try { res.type("text/markdown").send(fsKnow.readFileSync(pathKnow.join(KNOW, "SQL_GENERATION_RULES.md"), "utf8")); }
  catch { res.status(404).send("Reglas aún no generadas. Ejecuta `npm run discover`."); }
});
app.get("/api/schema/hash", (_req, res) => res.json(leerJSON("schema_hash.json", { hash: null })));
app.post("/api/schema/discover", (_req, res) => {
  const { spawn } = require("child_process");
  const script = pathKnow.join(__dirname, "scripts", "discover-db.js");
  const force = _req.query.force === "1" ? ["--force"] : [];
  const child = spawn(process.execPath, [script, ...force], { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {});
  res.json({ ok: true, lanzado: true, force: force.length > 0 });
});

app.listen(PORT, () => {
  console.log(`✅ Escuchando http://localhost:${PORT}\n`);

  // 🔎 Descubrimiento INTELIGENTE de la BD al iniciar (no bloqueante).
  //    El propio script compara schema_hash.json; si nada cambió, no
  //    regenera nada y termina en milisegundos. Forzar con --force o
  //    POST /api/schema/discover?force=1.
  //    Desactivar con DISCOVER_ON_BOOT=0
  if (process.env.DISCOVER_ON_BOOT !== "0") {
    setTimeout(() => {
      try {
        const { spawn } = require("child_process");
        const path2 = require("path");
        const script = path2.join(__dirname, "scripts", "discover-db.js");
        console.log("🔎 Verificando esquema (hash) en segundo plano...");
        const child = spawn(process.execPath, [script], {
          stdio: "inherit",
          env: process.env,
        });
        child.on("exit", (code) => {
          if (code === 0) console.log("✅ Knowledge listo.\n");
          else console.warn(`⚠️  Descubrimiento terminó con código ${code}`);
        });
      } catch (e) {
        console.warn("⚠️  No se pudo lanzar descubrimiento de BD:", e.message);
      }
    }, 1500);
  }
});
