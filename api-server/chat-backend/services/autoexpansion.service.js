// ─────────────────────────────────────────────────────────────────
//  services/autoexpansion.service.js
//
//  Módulo: AUTO-EXPANSIÓN / ARQUITECTURA (⚙️ Modo 5)
//
//  Responsabilidad:
//   1. Detectar qué módulo/archivo falta en el sistema
//   2. Proponer estructura de archivos con funciones
//   3. Explicar cómo integrar cada módulo al flujo actual
//   4. Detectar errores de flujo (botones, eventos, rutas, APIs)
// ─────────────────────────────────────────────────────────────────

// ── Patrones de detección para modo ARQUITECTURA ──────────────────
const RX_ARQU_DETECT = /\b(no\s+funciona|falta\s+(el\s+|un\s+)?m[oó]dulo|crear\s+(un\s+|el\s+)?(m[oó]dulo|archivo|servicio|ruta|endpoint)|agrega[rn]?\s+(un\s+|el\s+)?(m[oó]dulo|ruta|endpoint|servicio)|agrego\s+(el\s+|un\s+)?m[oó]dulo|bot[oó]n\s+(no\s+)?(responde|funciona)|evento\s+(no\s+)?(funciona|responde)|api\s+(falta|no\s+existe|no\s+funciona)|ruta\s+(falta|no\s+existe)|frontend\s+(no\s+)?(conecta|funciona)|backend\s+(no\s+)?(responde|funciona)|c[oó]mo\s+(creo|agrego|agrega[rs]?|implemento|implementa[rs]?|a[ñn]ado)\s+(el\s+|un\s+|la\s+)?(m[oó]dulo|servicio|ruta|endpoint|archivo|funcionalidad)|qu[eé]\s+archivos?\s+(necesito|falta[n]?|debo\s+crear)|arquitectura\s+del\s+sistema|estructura\s+de\s+(archivos|carpetas|m[oó]dulos)|dise[ñn]o\s+del\s+sistema|expandir\s+el\s+sistema|nuevas?\s+(funcionalidades?|m[oó]dulos?|servicios?)|integrar\s+(al?\s+sistema|con\s+el\s+backend|con\s+el\s+frontend)|flujo\s+(incompleto|roto|mal|falla)|handler\s+(falta|no\s+existe)|middleware\s+(falta|no\s+existe)|websocket|tiempo\s+real\s+(chat|notificaciones?)|m[oó]dulo\s+de\s+(reportes?|websocket|notificaciones?|dashboard|autenticaci[oó]n|scheduler|multi|pagos?|facturaci[oó]n))\b/i;

// ── Catálogo de módulos del sistema actual ────────────────────────
const MODULOS_ACTUALES = {
  frontend: {
    "frontend/chat.html":     "Interfaz principal del chat + lógica de eventos UI",
    "frontend/login.html":    "Pantalla de login con JWT",
    "frontend/index.html":    "Redirección inteligente según token",
  },
  backend: {
    "chat-backend/server.js":                        "Punto de entrada Express (v11) — todas las rutas",
    "chat-backend/config/ai.js":                     "Proveedor IA: offline / Ollama / OpenAI",
    "chat-backend/config/db.js":                     "Conexión PostgreSQL con fallback no-fatal",
    "chat-backend/controllers/chat.controller.js":   "Controlador del endpoint /api/chat",
    "chat-backend/routes/auth.routes.js":            "Rutas de autenticación JWT",
    "chat-backend/routes/chat.routes.js":            "Rutas del chat (/api/chat, /api/chat/guest)",
  },
  services: {
    "services/hybrid/router.intent.js":    "Clasificador de 5 modos (REGLAS/IA/BD/INTERNET/ARQUITECTURA)",
    "services/hybrid/hybrid.engine.js":    "Orquestador principal del pipeline",
    "services/hybrid/internet.tools.js":   "Consultas de tipo de cambio y precios",
    "services/hybrid/schema.repair.js":    "Reparación automática del esquema BD",
    "services/reglas.engine.js":           "Respuestas instantáneas sin IA (modo REGLAS)",
    "services/autoexpansion.service.js":   "Auto-detección de módulos faltantes (este archivo)",
    "services/intent.router.js":           "Router secundario → elige el agente BD correcto",
    "services/agents/smart.agent.js":      "Agente universal NL2SQL para consultas ERP",
  },
};

// ── Plantillas de módulos que se pueden agregar ───────────────────
const PLANTILLAS_MODULOS = {
  websocket: {
    titulo: "WebSocket / Chat en Tiempo Real",
    archivos: [
      { path: "chat-backend/services/websocket.service.js", desc: "Servidor WebSocket con Socket.io — broadcast de mensajes en tiempo real" },
      { path: "frontend/js/websocket-client.js",            desc: "Cliente WebSocket — maneja conexión, reconexión y eventos de UI" },
      { path: "chat-backend/routes/ws.routes.js",           desc: "Ruta de upgrade HTTP→WS con autenticación JWT" },
    ],
    integracion: "Instalar `socket.io` en el backend y `socket.io-client` en el frontend. El servidor actúa como hub central.",
  },
  notificaciones: {
    titulo: "Módulo de Notificaciones",
    archivos: [
      { path: "chat-backend/services/notificaciones.service.js", desc: "Cola de notificaciones con prioridades y canales (email, push, in-app)" },
      { path: "chat-backend/routes/notificaciones.routes.js",    desc: "Endpoints: GET /api/notificaciones, POST /api/notificaciones/marcar-leida" },
      { path: "frontend/js/notificaciones.js",                   desc: "Badge de notificaciones + dropdown en la UI del chat" },
    ],
    integracion: "Agregar tabla `notificaciones` en PostgreSQL. Trigger automático al registrar venta, factura vencida o stock bajo.",
  },
  reportes: {
    titulo: "Módulo de Reportes & BI",
    archivos: [
      { path: "chat-backend/services/reportes.service.js",    desc: "Genera reportes en PDF/Excel: ventas, balance, flujo de caja" },
      { path: "chat-backend/routes/reportes.routes.js",       desc: "GET /api/reportes/:tipo?periodo=mes — descarga directa" },
      { path: "frontend/reportes.html",                       desc: "Pantalla de reportes con filtros de período y botones de descarga" },
    ],
    integracion: "Usar ExcelJS (ya instalado). Para PDF usar `pdfkit`. Los reportes se generan on-demand y se cachean 15 min.",
  },
  multiempresa: {
    titulo: "Multi-Empresa / Multi-Tenant",
    archivos: [
      { path: "chat-backend/middleware/tenant.middleware.js",  desc: "Extrae empresa_id del JWT o subdominio — inyecta en req.tenant" },
      { path: "chat-backend/services/tenant.service.js",      desc: "Aislamiento de datos por empresa — todas las queries filtran por empresa_id" },
      { path: "chat-backend/config/db.pool.js",               desc: "Pool de conexiones por tenant con caché de 30 min" },
    ],
    integracion: "Agregar columna `empresa_id` a todas las tablas ERP. El middleware inyecta automáticamente el filtro en cada query.",
  },
  autenticacion: {
    titulo: "Autenticación Avanzada (2FA / OAuth)",
    archivos: [
      { path: "chat-backend/services/auth.2fa.service.js",   desc: "TOTP con Google Authenticator — genera QR, verifica códigos" },
      { path: "chat-backend/routes/auth.2fa.routes.js",      desc: "POST /api/auth/2fa/setup, POST /api/auth/2fa/verify" },
      { path: "frontend/js/auth-2fa.js",                     desc: "Modal de 2FA en login — captura código de 6 dígitos" },
    ],
    integracion: "Usar `speakeasy` para TOTP y `qrcode` para el QR. Agregar columna `totp_secret` a tabla `usuarios`.",
  },
  dashboard: {
    titulo: "Dashboard KPI Avanzado",
    archivos: [
      { path: "chat-backend/routes/dashboard.routes.js",  desc: "GET /api/dashboard/:periodo — KPIs calculados en SQL" },
      { path: "frontend/dashboard.html",                  desc: "Dashboard con gráficos Recharts/Chart.js — actualización en tiempo real" },
      { path: "frontend/js/dashboard.js",                 desc: "Lógica de gráficas + polling de KPIs cada 30s" },
    ],
    integracion: "Los KPIs ya existen en /api/kpis. Expandir con tendencias, comparación período anterior y alertas de umbral.",
  },
  scheduler: {
    titulo: "Scheduler / Tareas Automáticas",
    archivos: [
      { path: "chat-backend/services/scheduler.service.js",   desc: "Cron jobs: alertas de facturas vencidas, backup diario, resumen semanal" },
      { path: "chat-backend/services/alertas.service.js",     desc: "Motor de alertas: stock bajo, deudas vencidas, metas de venta" },
    ],
    integracion: "Usar `node-cron`. El scheduler arranca con el servidor y corre independiente. Logs en tabla `scheduler_logs`.",
  },
};

// ── Detectar qué módulo necesita la consulta ──────────────────────
function detectarModulo(pregunta) {
  const q = pregunta.toLowerCase();

  if (/websocket|tiempo real|en vivo|live|socket/.test(q)) return "websocket";
  if (/notificac|aviso|alerta|push/.test(q)) return "notificaciones";
  if (/reporte|pdf|excel|bi\b|business intel|dashboard avanzado|gr[aá]fica/.test(q)) return "reportes";
  if (/multi.?empresa|multi.?tenant|varias empresas|empresa_id/.test(q)) return "multiempresa";
  if (/2fa|doble factor|autenticaci[oó]n\s+(avanzada|dos|2)|oauth|google auth/.test(q)) return "autenticacion";
  if (/dashboard|kpi|indicadores|m[eé]tricas/.test(q)) return "dashboard";
  if (/cron|scheduler|autom[aá]tico|programar|tarea\s+(diaria|semanal)/.test(q)) return "scheduler";

  return null;
}

// ── Detectar tipo de problema del sistema ─────────────────────────
function detectarProblema(pregunta) {
  const q = pregunta.toLowerCase();

  if (/bot[oó]n|click|evento|handler|ui/.test(q))      return "frontend_event";
  if (/ruta|endpoint|api|404/.test(q))                  return "ruta_faltante";
  if (/base de datos|sql|query|tabla/.test(q))          return "bd_problema";
  if (/ia|ollama|openai|modelo/.test(q))                return "ia_problema";
  if (/frontend.*backend|conectar|cors|fetch/.test(q)) return "integracion";
  if (/arquitectura|estructura|dise[ñn]o|flujo/.test(q)) return "arquitectura_general";

  return "general";
}

// ── Respuesta de diagnóstico general ─────────────────────────────
function respuestaGeneral(pregunta) {
  const problema = detectarProblema(pregunta);

  const respuestas = {
    frontend_event: `🔧 **Diagnóstico: Problema de Eventos Frontend**

**Archivos a revisar:**
\`\`\`
frontend/chat.html  → Buscar: addEventListener, onclick, onsubmit
\`\`\`

**Patrón correcto en este sistema:**
\`\`\`javascript
// ✅ Correcto — usar DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnEnviar').addEventListener('click', enviarMensaje);
});

// ❌ Incorrecto — inline onclick puede no ejecutarse si el JS falla antes
<button onclick="enviarMensaje()">
\`\`\`

**Verificar:**
1. Abrir DevTools → Console → ¿hay SyntaxError?
2. Revisar que no haya literales de salto de línea en regex (\`/\\n/g\`)
3. Confirmar que \`DOMContentLoaded\` se dispara antes de registrar eventos`,

    ruta_faltante: `🔧 **Diagnóstico: Ruta / Endpoint Faltante**

**Rutas activas en este sistema:**
\`\`\`
GET  /api/health          → estado del servidor
POST /api/chat            → chat con auth JWT
POST /api/chat/guest      → chat sin token
GET  /api/kpis            → indicadores del negocio
GET  /api/config/ai       → configuración IA
GET  /api/export/:tabla   → exportar Excel
POST /api/auth/login      → login JWT
POST /api/auth/register   → registro usuario
\`\`\`

**Para agregar una ruta nueva en \`server.js\`:**
\`\`\`javascript
app.post('/api/mi-modulo', async (req, res) => {
  try {
    const datos = req.body;
    // lógica aquí
    res.json({ ok: true, datos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
\`\`\``,

    bd_problema: `🔧 **Diagnóstico: Problema de Base de Datos**

**Tablas mínimas garantizadas por el sistema:**
\`\`\`sql
clientes    (nombre, documento, email, telefono)
proveedores (nombre, documento, email, telefono)
productos   (nombre, precio NUMERIC, stock NUMERIC)
ventas      (fecha, cliente_id, total, igv, estado)
compras     (fecha, proveedor_id, total, igv, estado)
facturas    (fecha, cliente_id, total, pagada BOOLEAN)
pagos       (fecha, factura_id, monto)
\`\`\`

**El sistema funciona sin BD** (modo offline). Para activar PostgreSQL:
\`\`\`bash
# En chat-backend/.env
DATABASE_URL=postgresql://usuario:pass@host:5432/nombrebd
\`\`\``,

    ia_problema: `🔧 **Diagnóstico: Problema de IA**

**Proveedores disponibles en este sistema:**

| Proveedor | Activar en .env                          |
|-----------|------------------------------------------|
| Offline   | \`AI_PROVIDER=offline\` (default)         |
| Ollama    | \`OLLAMA_ENABLED=true\`, \`AI_PROVIDER=ollama\` |
| OpenAI    | \`OPENAI_API_KEY=sk-...\`, \`AI_PROVIDER=openai\` |

**El modo offline** usa 282 reglas + 120 patrones de conocimiento. No requiere conexión.`,

    integracion: `🔧 **Diagnóstico: Integración Frontend ↔ Backend**

**Flujo de comunicación en este sistema:**
\`\`\`
[chat.html] → POST /api/chat/guest → [server.js]
                                          ↓
                              [hybrid.engine.js]
                              ↙       ↓       ↘
                    [reglas]   [IA/Ollama]  [BD/Internet]
                                          ↓
                              JSON { ok, respuesta, modo }
                                          ↓
                         [chat.html] → renderiza burbuja
\`\`\`

**Para consultas CORS / Fetch:**
\`\`\`javascript
const r = await fetch('/api/chat/guest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pregunta: '...' })
});
const data = await r.json();
\`\`\``,

    arquitectura_general: `⚙️ **Arquitectura del Sistema NEXUS**

\`\`\`
Frontend (HTML/JS)
    └── POST /api/chat/guest
           └── server.js (Express)
                  └── hybrid.engine.js (Orquestador)
                         ├── 🟢 REGLAS  → reglas.engine.js       (< 1ms)
                         ├── 🌐 INTERNET → internet.tools.js     (API externa)
                         ├── 🗄️ BD       → agents/smart.agent.js (PostgreSQL)
                         ├── 🟡 IA       → config/ai.js          (Ollama/OpenAI)
                         └── ⚙️ ARQU     → autoexpansion.service.js
\`\`\`

**Pipeline de decisión:**
1. ¿Es saludo/comando? → REGLAS (instantáneo)
2. ¿Es dato de mercado? → INTERNET
3. ¿Hay entidad ERP? → BD (prioridad 90%)
4. ¿Falta módulo? → ARQUITECTURA
5. ¿Es conceptual? → IA`,

    general: `⚙️ **Auto-Expansión del Sistema NEXUS**

El sistema detectó una consulta sobre arquitectura. ¿Qué necesitas?

**📁 Módulos disponibles para agregar:**
- \`websocket\` — Chat en tiempo real con Socket.io
- \`notificaciones\` — Alertas push/in-app automáticas
- \`reportes\` — PDF/Excel con BI avanzado
- \`dashboard\` — KPIs gráficos en tiempo real
- \`multiempresa\` — Soporte multi-tenant
- \`autenticacion\` — 2FA + OAuth
- \`scheduler\` — Tareas automáticas con cron

Escribe: *"cómo agregar el módulo de [nombre]"* para ver la guía completa.`,
  };

  return respuestas[problema] || respuestas.general;
}

// ── Responder (función principal) ─────────────────────────────────
function responder(pregunta) {
  const modulo = detectarModulo(pregunta);

  if (modulo && PLANTILLAS_MODULOS[modulo]) {
    const p = PLANTILLAS_MODULOS[modulo];
    const archivos = p.archivos.map(a => `\`${a.path}\` — ${a.desc}`).join("\n");
    const texto = `⚙️ **Módulo a Agregar: ${p.titulo}**

**📁 Archivos a crear:**
${archivos}

**🔗 Integración con el sistema actual:**
${p.integracion}

**📌 Módulos actuales del sistema:**
\`\`\`
${Object.entries(MODULOS_ACTUALES.services).map(([k,v]) => `${k.split('/').pop().padEnd(35)} → ${v}`).join('\n')}
\`\`\`

¿Quieres que implemente alguno de estos archivos?`;

    return { modo: "ARQUITECTURA", respuesta: texto, agente: "autoexpansion", modulo_propuesto: modulo };
  }

  // Diagnóstico general de problema
  const texto = respuestaGeneral(pregunta);
  return { modo: "ARQUITECTURA", respuesta: texto, agente: "autoexpansion" };
}

module.exports = { responder, RX_ARQU_DETECT, detectarModulo, detectarProblema, MODULOS_ACTUALES, PLANTILLAS_MODULOS };
