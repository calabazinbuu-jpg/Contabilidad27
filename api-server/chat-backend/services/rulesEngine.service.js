// rulesEngine.service.js — Motor de reglas v12
// Con: LIMIT dinámico, "y X más", fallback automático entre tablas,
//      resolución de sinónimos de columnas, integración Ollama opcional.
const db            = require("../config/db");
const rules         = require("./businessRules.service");
const sqlGen        = require("./sqlGenerator.service");
const autoSchema    = require("./autoSchema.service");
const guard         = require("./sql.guard");
const schemaRes     = require("./schemaResolver.service");

const FMT_MONEY = new Intl.NumberFormat("es-PE", { style:"currency", currency:"PEN", maximumFractionDigits:0 });
const FMT_INT   = new Intl.NumberFormat("es-PE");

// ── Extraer número pedido en la pregunta ─────────────────────────
function extraerLimite(pregunta) {
  const t = (pregunta||"").toLowerCase();
  const m = t.match(/\b(\d+)\s*(producto|cliente|proveedor|factura|venta|compra|result|registro|fila|item|articulo)/);
  if (m) return Math.min(parseInt(m[1],10), 50);
  const m2 = t.match(/\b(?:top|los|las|primero|primera|primeros|primeras)\s+(\d+)\b/);
  if (m2) return Math.min(parseInt(m2[1],10), 50);
  return null;
}
function _quiereExcel(p) {
  return /\b(todo[s]?|lista\s+completa|completo|completa|excel|todos\s+los|todas\s+las)\b/i.test(p);
}
function _esMes(p) { return /\b(este\s+mes|mes\s+actual|del\s+mes|mensual)\b/i.test(p); }
function _esHoy(p) { return /\b(hoy|del\s+d[ií]a|de\s+hoy)\b/i.test(p); }

function formatearValor(v, hint) {
  if (v == null) return "—";
  if (typeof v === "number" || (typeof v === "string" && /^\d+\.?\d*$/.test(v))) {
    const n = typeof v === "number" ? v : parseFloat(v);
    if (/total|monto|precio|costo|ventas|compras|ingreso|egreso|utilidad|ganancia|gasto|saldo|valor|subtotal|neto|bruto|importe/.test((hint||"").toLowerCase()))
      return FMT_MONEY.format(n);
    return FMT_INT.format(n);
  }
  if (v instanceof Date) return v.toLocaleDateString("es-PE");
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toLocaleDateString("es-PE");
  return s;
}

const LIMITE_LISTA = 10;

function renderizar(regla, rows, ctx, usedTable) {
  if (!rows || !rows.length) {
    return {
      texto: `📊 **${regla.nombre}**\n\nNo se encontraron datos${ctx?.fechas ? ` para ${ctx.fechas.etiqueta}` : ""}.\n_Se revisaron tablas relacionadas sin encontrar resultados._`,
      hayMas: false, total: 0
    };
  }

  const hayMas = rows.length > LIMITE_LISTA;
  const rowsMostrar = hayMas ? rows.slice(0, LIMITE_LISTA) : rows;
  const lineas = [];
  lineas.push(`📊 **${regla.nombre}**${ctx?.fechas ? ` — ${ctx.fechas.etiqueta}` : ""}${usedTable && usedTable !== (regla.tablas_requeridas||[])[0] ? ` _(desde ${usedTable})_` : ""}`);
  lineas.push("");

  if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
    const [k, v] = Object.entries(rows[0])[0];
    lineas.push(`${k.replace(/_/g," ")}: **${formatearValor(v, k)}**`);
  } else if (rows.length === 1) {
    for (const [k, v] of Object.entries(rows[0])) {
      lineas.push(`• **${k.replace(/_/g," ")}**: ${formatearValor(v, k)}`);
    }
  } else {
    const cols = Object.keys(rowsMostrar[0]);
    const nombreKey = cols.find(c => /^(nombre|razon_social|name|descripcion|titulo)$/i.test(c))
                   || cols.find(c => /nombre|name/i.test(c))
                   || cols.find(c => c !== "id" && c !== "empresa_id" && c !== "creado_en")
                   || cols[0];
    const COLS_SKIP   = new Set(["id","empresa_id","creado_en","created_at","activo","updated_at","modificado_en"]);
    const COLS_TEXTO  = new Set(["documento","ruc","rut","nit","cuit","dni","telefono","celular","tel","email","correo","ciudad","direccion","codigo"]);

    rowsMostrar.forEach((row, i) => {
      let base = `${i+1}. **${row[nombreKey] ?? "(sin nombre)"}**`;
      const extras = cols
        .filter(c => c !== nombreKey && !COLS_SKIP.has(c))
        .map(c => {
          const v = row[c];
          if (v == null || v === "") return null;
          const label = c.replace(/_/g, " ");
          const texto = COLS_TEXTO.has(c) ? String(v) : formatearValor(v, c);
          return `${label}: ${texto}`;
        })
        .filter(Boolean);
      if (extras.length) base += ` — ${extras.join(" · ")}`;
      lineas.push(base);
    });
    if (hayMas) {
      lineas.push(`\n… y ${rows.length - LIMITE_LISTA} más. 💡 Escribe **"en excel"** para descargar la lista completa.`);
    }
  }

  const conf = regla.confianza >= 0.9 ? "ALTO" : regla.confianza >= 0.7 ? "MEDIO" : "BAJO";
  return { texto: lineas.join("\n"), hayMas, total: rows.length, conf };
}

// ── Intentar SQL alternativo cuando el primero falla por esquema ──
async function intentarFallback(regla, gen, params) {
  const tablaPrincipal = (regla.tablas_requeridas||[])[0];
  if (!tablaPrincipal) return null;

  const cadena = schemaRes.CADENAS_FALLBACK[tablaPrincipal] || [];
  for (const tablaAlt of cadena) {
    if (tablaAlt === tablaPrincipal) continue;
    let sqlAlt = gen.sql.replace(new RegExp(`\\b${tablaPrincipal}\\b`, "g"), tablaAlt);

    // Resolver columnas en tabla alternativa
    for (const col of (regla.columnas_requeridas || [])) {
      const colReal = await schemaRes.resolverColumna(tablaAlt, col);
      if (colReal && colReal !== col) {
        sqlAlt = sqlAlt.replace(new RegExp(`\\b${col}\\b`, "g"), colReal);
      }
    }

    try {
      const safe = guard.validar(sqlAlt);
      const r = await db.query(safe, params);
      if (r.rows.length > 0) {
        return { rows: r.rows, usedTable: tablaAlt, sqlUsado: sqlAlt };
      }
    } catch (_) {}
  }
  return null;
}

async function responder(pregunta, aiService) {
  if (!pregunta || typeof pregunta !== "string") return null;
  const match = rules.buscar(pregunta);
  if (!match) return null;

  const regla = match.regla;
  const fechas = sqlGen.parsearFechas(pregunta);
  const ctx = { fechas };
  const limitePersonalizado = extraerLimite(pregunta);
  const quiereExcel = _quiereExcel(pregunta);

  let gen;
  try { gen = await sqlGen.generar(regla, ctx); }
  catch (e) {
    return { agente:"rules", intent:regla.id, respuesta:`❌ Error generando SQL: ${e.message}`, regla:regla.id };
  }

  // Overrides de SQL por período
  if (regla.sql_hoy && _esHoy(pregunta)) { gen.sql = regla.sql_hoy; gen.params = []; }
  else if (regla.sql_mes && _esMes(pregunta)) { gen.sql = regla.sql_mes; gen.params = []; }

  // Auto-reparar esquema
  if (gen.faltantes.tablas.length || gen.faltantes.columnas.length) {
    try { await autoSchema.reparar(gen.faltantes); gen = await sqlGen.generar(regla, ctx); } catch (_) {}
  }

  // Ajustar LIMIT — siempre pedir 1 extra para detectar "hay más"
  let sqlFinal = gen.sql;
  if (limitePersonalizado) {
    sqlFinal = /LIMIT\s+\d+/i.test(sqlFinal)
      ? sqlFinal.replace(/LIMIT\s+\d+/i, `LIMIT ${limitePersonalizado}`)
      : sqlFinal + ` LIMIT ${limitePersonalizado}`;
  } else if (quiereExcel) {
    sqlFinal = sqlFinal.replace(/LIMIT\s+\d+/i, "LIMIT 500");
  } else {
    // Pedir 1 extra para saber si hay más filas de las que mostramos
    sqlFinal = /LIMIT\s+\d+/i.test(sqlFinal)
      ? sqlFinal.replace(/LIMIT\s+(\d+)/i, (_m, n) => `LIMIT ${parseInt(n,10) + 1}`)
      : sqlFinal + ` LIMIT ${LIMITE_LISTA + 1}`;
  }

  let safe;
  try { safe = guard.validar(sqlFinal); }
  catch (e) { return { agente:"rules", intent:regla.id, respuesta:`❌ SQL bloqueado: ${e.message}` }; }

  let rows = [], usedTable = (regla.tablas_requeridas||[])[0], sqlUsado = safe;

  // ── PUNTO 5: Ejecutar con fallback automático entre tablas ────────
  try {
    const r = await schemaRes.ejecutarConFallback(safe, gen.params||[], usedTable, regla);
    rows      = r.rows;
    usedTable = r.usedTable;
    if (r.sqlUsado) sqlUsado = r.sqlUsado;
  } catch (e) {
    // Error no de esquema → reportar
    const esEsquema = /(column|relation).*does not exist/i.test(e.message);
    if (!esEsquema) {
      return {
        agente:"rules", intent:regla.id, regla:regla.id,
        respuesta:`Lo siento, ocurrió un error al consultar la base de datos.\n\n_Detalle: ${e.message.slice(0,120)}_`,
        confianza:"BAJO", score:match.score,
      };
    }
    // Error de esquema → intentar fallback manual
    const fb = await intentarFallback(regla, gen, gen.params||[]);
    if (fb) { rows = fb.rows; usedTable = fb.usedTable; sqlUsado = fb.sqlUsado; }
  }

  // Si aún 0 filas y Ollama disponible → consulta asistida por Ollama
  if (!rows.length && aiService) {
    try {
      const status = aiService.getStatus?.();
      if (status?.enabled && status.provider === "ollama") {
        const schemaResumen = await schemaRes.generarResumenEsquema();
        const ollamaHint = await schemaRes.resolverConOllama(pregunta, schemaResumen, aiService);
        if (ollamaHint?.tablas?.length) {
          const tablaOllama = ollamaHint.tablas[0];
          let sqlOllama = safe.replace(new RegExp(`\\b${(regla.tablas_requeridas||[])[0]}\\b`, "g"), tablaOllama);
          if (ollamaHint.columnas) {
            for (const [orig, real] of Object.entries(ollamaHint.columnas)) {
              sqlOllama = sqlOllama.replace(new RegExp(`\\b${orig}\\b`, "g"), real);
            }
          }
          try {
            const safOl = guard.validar(sqlOllama);
            const rOl = await db.query(safOl, []);
            if (rOl.rows.length > 0) {
              rows = rOl.rows;
              usedTable = tablaOllama + " (Ollama)";
              sqlUsado = sqlOllama;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  const { texto, hayMas, total } = renderizar(regla, rows, ctx, usedTable);

  return {
    agente:"rules", intent:regla.id, regla:regla.id,
    respuesta: texto,
    datos: rows.slice(0, 50),
    sql: sqlUsado,
    hayMas,
    totalRegistros: total,
    tablaPrincipal: usedTable,
    ofrecerExcel: hayMas || quiereExcel,
    adaptaciones: gen.adaptaciones,
    score: match.score,
    confianza: regla.confianza >= 0.9 ? "ALTO" : "MEDIO",
  };
}

module.exports = { responder, renderizar };
