// ─────────────────────────────────────────────────────────────────
//  hybrid/hybrid.engine.js   (v13 — AI ROUTER INTELIGENTE 5 MODOS)
//
//  Orquestador del pipeline completo:
//    🟢 REGLAS      → respuesta inmediata (< 1 ms)
//    🌐 INTERNET    → cotizaciones en tiempo real
//    🗄️ BD          → datos ERP (PostgreSQL)
//    🟡 IA          → razonamiento contable (contador humano)
//    ⚙️ ARQUITECTURA → auto-detección de módulos faltantes
//
//  Garantías:
//   ✔ Nunca lanza al caller (todo envuelto en safeRun)
//   ✔ Cachea la última-buena-respuesta por pregunta+modo
//   ✔ Si BD falla → repara, reintenta y responde de forma segura
//   ✔ Si Internet falla → cache o aviso claro
//   ✔ Si IA falla → respuesta base offline
// ─────────────────────────────────────────────────────────────────
const router         = require("./router.intent");
const internet       = require("./internet.tools");
const schemaRepair   = require("./schema.repair");
const audit          = require("./accounting.audit");
const { safeRun, recordar, recordarUltima, respuestaSegura } = require("./safe.fallback");

const ai             = require("../../config/ai");
const intentRouter   = require("../intent.router");
const agents         = require("../agents");
const reglasEngine   = require("../reglas.engine");
const autoExpansion  = require("../autoexpansion.service");

// ── Esquema mínimo ERP garantizado ───────────────────────────────
const ESQUEMA_BASE = {
  clientes:    { nombre:"TEXT", documento:"TEXT", email:"TEXT", telefono:"TEXT" },
  proveedores: { nombre:"TEXT", documento:"TEXT", email:"TEXT", telefono:"TEXT" },
  productos:   { nombre:"TEXT", precio:"NUMERIC(12,2)", stock:"NUMERIC(12,2)" },
  ventas:      { fecha:"DATE", cliente_id:"INT", total:"NUMERIC(12,2)", igv:"NUMERIC(12,2)", estado:"TEXT" },
  compras:     { fecha:"DATE", proveedor_id:"INT", total:"NUMERIC(12,2)", igv:"NUMERIC(12,2)", estado:"TEXT" },
  facturas:    { fecha:"DATE", cliente_id:"INT", total:"NUMERIC(12,2)", pagada:"BOOLEAN" },
  pagos:       { fecha:"DATE", factura_id:"INT", monto:"NUMERIC(12,2)" },
};

function _ck(modo, pregunta) { return `${modo}:${String(pregunta).toLowerCase().trim().slice(0,200)}`; }

// ── 🟡 Prompt IA: contador humano (NO académico) ─────────────────
function _buildSysPrompt() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("es-PE", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const hora  = ahora.toLocaleTimeString("es-PE");

  return `Eres un contador y asesor empresarial con 15 años de experiencia en Perú. Tu nombre es NEXUS.

CÓMO DEBES RESPONDER (obligatorio):
✅ Como un contador humano que habla claro y da ejemplos reales
✅ Usar lenguaje simple y directo (no jerga académica)
✅ Dar un ejemplo concreto con números en Soles (S/)
✅ Máximo 5-6 líneas para conceptos (no te extiendas)
✅ Si hay fórmula, ponerla DESPUÉS de la explicación, no antes

❌ NUNCA hagas esto:
❌ Responder como un libro de texto ("El IGV es un impuesto indirecto al valor agregado...")
❌ Dar solo fórmulas sin explicar qué significan
❌ Usar términos técnicos sin explicar primero con ejemplo
❌ Inventar números de ventas, facturas o clientes (eso está en la base de datos)
❌ Ser robótico o frío

EJEMPLO DE CÓMO RESPONDER:
Pregunta: "¿qué es el IGV?"
❌ Malo: "El IGV (Impuesto General a las Ventas) es un tributo de naturaleza indirecta..."
✅ Bueno: "El IGV es básicamente el impuesto que le cobras a tu cliente por vender algo. 
Si vendiste un producto a S/ 100, en realidad el precio real es S/ 84.75 y le sumas S/ 15.25 de IGV (18%). 
Ese IGV lo pagas a SUNAT. Fórmula: IGV = Base × 18%"

CONTEXTO DE PERÚ (aplica siempre):
• País: Perú · Moneda: Soles (S/) · IGV = 18%
• Normativa: SUNAT, NIIF adaptadas, PCGE
• Fecha actual: ${fecha}, ${hora}

FUENTES DE INFORMACIÓN (orden de prioridad):
1. Base de datos PostgreSQL → datos reales del negocio
2. Motor contable → fórmulas y cálculos
3. Tu conocimiento contable → explicaciones
4. Internet → cotizaciones (menciona que puedes consultarlo)

REGLA FINAL: Si te preguntan datos del negocio (ventas, facturas, clientes) → di que 
el sistema debe consultar la base de datos y reformula indicando que use la consulta ERP.`;
}

// ── 🟢 MODO REGLAS: respuesta inmediata ──────────────────────────
function _modoReglas(pregunta) {
  const r = reglasEngine.responder(pregunta);
  if (r) return r;
  // Si el router clasificó como REGLAS pero el engine no tiene coincidencia → caer a IA
  return null;
}

// ── 🟡 MODO IA: contador humano ──────────────────────────────────
async function _modoIA(pregunta, historial) {
  const sys = _buildSysPrompt();
  const messages = [
    { role: "system", content: sys },
    ...((historial || []).slice(-6)),
    { role: "user", content: pregunta },
  ];
  const out = await safeRun(
    () => ai.chat(messages, { temperature: 0.3 }),
    null,
    "ai.chat",
  );
  if (out && String(out).trim()) {
    recordar(_ck("IA", pregunta), out);
    return { modo: "IA", respuesta: out };
  }
  const ultima = recordarUltima(_ck("IA", pregunta));
  return {
    modo: "IA",
    degradado: true,
    respuesta: ultima
      || "⚠️ El módulo de IA no está disponible en este momento.\n\n" +
         "Puedes consultarme sobre **datos del negocio** (ventas, facturas, clientes) " +
         "o sobre **cotizaciones** (dólar, euro). El ERP sigue operativo. 😊",
  };
}

// ── 🌐 MODO INTERNET: cotizaciones en tiempo real ─────────────────
async function _modoInternet(pregunta) {
  const r = await safeRun(
    () => internet.resolverDesdeTexto(pregunta),
    null,
    "internet.resolver",
  );
  if (r) {
    recordar(_ck("INTERNET", pregunta), r);
    return { modo: "INTERNET", respuesta: r.texto, datos: r.datos, fuente: r.datos?.fuente };
  }
  const ultima = recordarUltima(_ck("INTERNET", pregunta));
  if (ultima) {
    return {
      modo: "INTERNET",
      degradado: true,
      respuesta: `${ultima.texto}  _(⚠️ dato en caché — sin conexión a la fuente)_`,
      datos: ultima.datos,
      fuente: ultima.datos?.fuente,
    };
  }
  return {
    modo: "INTERNET",
    degradado: true,
    respuesta: "⚠️ No hay conexión a la fuente externa en este momento. Reintenta en unos segundos.",
  };
}

// ── 🗄️ MODO BD: datos ERP (PostgreSQL) ───────────────────────────
async function _modoBD(pregunta, historial) {
  const cambios = await safeRun(
    () => schemaRepair.asegurarEsquema(ESQUEMA_BASE),
    [],
    "schema.asegurar",
  );

  const agenteName = safeRun(() => intentRouter.elegirAgente(pregunta), "smart", "intentRouter");
  const agente = agents[await agenteName] || agents.smart;

  let r = await safeRun(
    () => agente.ejecutar({ pregunta, contexto: historial }),
    null,
    "agente.ejecutar.1",
  );
  if (!r) {
    r = await safeRun(
      () => agente.ejecutar({ pregunta, contexto: historial }),
      null,
      "agente.ejecutar.2",
    );
  }
  if (!r) {
    return {
      modo: "BD",
      degradado: true,
      respuesta: "⚠️ No pude consultar la base de datos en este momento.\n\n" +
                 "El esquema mínimo está garantizado. Reintenta o reformula la pregunta.",
      reparacion: cambios,
    };
  }

  const msg = String(r?.respuesta || "");
  const matchTabla = msg.match(/tabla\s+["']?([a-z_][a-z0-9_]*)["']?\s+(no existe|inexistente|faltante)/i);
  const matchCol   = msg.match(/columna\s+["']?([a-z_][a-z0-9_]*)["']?\s+(no existe|inexistente|faltante)/i);
  if (matchTabla || matchCol) {
    return {
      modo: "BD",
      respuesta: `⚠️ INFORMACIÓN FALTANTE: ${matchTabla ? "tabla **" + matchTabla[1].toUpperCase() + "**" : ""}${matchCol ? (matchTabla?", ":"") + "columna **" + matchCol[1].toUpperCase() + "**" : ""}\n\nEscribe \`estado del sistema\` para diagnóstico completo.`,
      reparacion: cambios,
      detalle: r,
    };
  }

  recordar(_ck("BD", pregunta), { respuesta: r?.respuesta, datos: r?.datos });
  return {
    modo: "BD",
    agente: r?.agente || agenteName,
    respuesta: r?.respuesta,
    datos: r?.datos,
    sql: r?.sql,
    reparacion: cambios,
  };
}

// ── ⚙️ MODO ARQUITECTURA: auto-expansión del sistema ─────────────
function _modoArquitectura(pregunta) {
  return autoExpansion.responder(pregunta);
}

// ── Orquestador principal ─────────────────────────────────────────
async function responder(pregunta, historial = []) {
  const t0 = Date.now();
  return safeRun(async () => {
    const intent = router.clasificar(pregunta);
    let resultado;

    switch (intent.modo) {
      case "REGLAS": {
        const r = _modoReglas(pregunta);
        // Si el engine de reglas no tiene match → caer a IA (saludos elaborados)
        resultado = r || await _modoIA(pregunta, historial);
        break;
      }
      case "INTERNET":
        resultado = await _modoInternet(pregunta);
        break;
      case "BD":
        resultado = await _modoBD(pregunta, historial);
        break;
      case "ARQUITECTURA":
        resultado = _modoArquitectura(pregunta);
        break;
      case "IA":
      default:
        resultado = await _modoIA(pregunta, historial);
        break;
    }

    return { ok: true, intent, ...resultado, latencia_ms: Date.now() - t0 };
  }, { ...respuestaSegura("IA", "excepción no controlada"), latencia_ms: Date.now() - t0 }, "hybrid.responder");
}

// ── Diagnóstico de salud del sistema ─────────────────────────────
async function salud() {
  const out = { ok: true, t: new Date().toISOString(), componentes: {} };
  out.componentes.reglas       = { ok: true, reglas: require("../reglas.engine").REGLAS.length };
  out.componentes.autoexpansion = { ok: true, plantillas: Object.keys(require("../autoexpansion.service").PLANTILLAS_MODULOS).length };
  out.componentes.bd       = await safeRun(async () => {
    const db = require("../../config/db");
    const r = await db.query("SELECT 1 AS ok");
    return { ok: r.rows?.[0]?.ok === 1 };
  }, { ok: false }, "salud.bd");
  out.componentes.internet = await safeRun(async () => {
    const r = await internet.tipoCambio("USD", "PEN");
    return { ok: true, rate: r.rate, cache: !!r.cache };
  }, { ok: false }, "salud.internet");
  out.componentes.ia       = await safeRun(async () => {
    return { ok: !!ai.enabled?.(), provider: ai.provider?.() || "offline" };
  }, { ok: false }, "salud.ia");
  out.modo_global = out.componentes.bd.ok && out.componentes.internet.ok ? "operativo" : "degradado";
  out.pipeline = "REGLAS → INTERNET → BD (90%) → ARQUITECTURA → IA";
  return out;
}

module.exports = { responder, salud, ESQUEMA_BASE, auditar: audit.auditar };
