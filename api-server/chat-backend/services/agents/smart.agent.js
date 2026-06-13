// ─────────────────────────────────────────────────────────────────
// smart.agent.js v8.4 — Agente UNIVERSAL
//  • Delegan a engine.v2 (con analytics) ANTES de hacer listado crudo
//  • Soporta PROYECCIÓN de campos ("dame proveedores y su correo")
//  • Prompt LLM forzado a contexto Perú (IGV, S/) y a NO decir
//    "consulta tu ERP" — debe responder con los datos disponibles.
// ─────────────────────────────────────────────────────────────────
const db       = require("../../config/db");
const nlp      = require("../nlp.engine");
const schema   = require("../schema.introspect");
const variator = require("../response.variator");
const ExcelJS  = require("exceljs");
const fs       = require("fs");
const path     = require("path");
const engineV2 = require("../engine.v2");
const ai       = require("../../config/ai");
const textNumbers = require("../textNumbers.service");

const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);

const EXPORT_DIR = path.join(__dirname, "..", "..", "exportaciones");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const SYSTEM_PROMPT_NEGOCIO = `
Eres el asistente de un ERP en Perú. Reglas obligatorias:
• País: Perú. Moneda: Soles (S/). El impuesto a las ventas se llama IGV (18%), NO IVA, NO México.
• Responde SIEMPRE en español, claro y conciso (máx 4 líneas).
• Si la pregunta requiere datos reales y NO los tienes aún en este turno, da una respuesta útil
  basada en conocimiento contable general — NUNCA digas "consulta tu ERP" ni "consulta un contador".
• Si no estás seguro de un dato puntual del negocio, indícalo brevemente y sugiere la consulta concreta
  que el usuario puede escribir (ej.: "pregúntame: ventas de mayo").
`.trim();

function quiereExcel(texto = "") {
  const t = texto.toLowerCase();
  return /\b(excel|xlsx|exportar|exportame|expórtame|descargar|descarga|hoja de calculo|hoja de cálculo)\b/.test(t);
}
function quiereProyeccion(texto = "") {
  return /\b(solo|s[oó]lo|[uú]nicamente|unicamente|y su|y sus|con su|con sus|dame\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:nombre|correo|email|tel|ruc|precio|stock)|solo\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:nombre|correo|email|tel|ruc|precio|stock))\b/i.test(texto);
}
function camposProyectados(texto) {
  const t = (texto || "").toLowerCase();
  const out = ["nombre"];
  if (/\b(correo|email|e-?mail|mail|gmail)\b/.test(t)) out.push("correo");
  if (/\b(tel[eé]fono|telefono|celular|m[oó]vil|whatsapp|wsp)\b/.test(t)) out.push("telefono");
  if (/\b(ruc|documento|dni)\b/.test(t)) out.push("ruc");
  if (/\b(ciudad|direcci[oó]n)\b/.test(t)) out.push("ciudad");
  if (/\bsaldo|deuda\b/.test(t)) out.push("saldo");
  if (/\bprecio\b/.test(t)) out.push("precio");
  if (/\bcosto\b/.test(t)) out.push("costo");
  if (/\bstock\b/.test(t)) out.push("stock");
  return [...new Set(out)];
}

function colReal(defs, candidatos) {
  const cols = (defs || []).map(c => c.col || c.column_name);
  for (const c of candidatos) if (cols.includes(c)) return c;
  return null;
}

function columnasSelect(tabla, defs, campos) {
  const mapa = {
    nombre: ["nombre", "razon_social", "descripcion", "name"], correo: ["correo", "email", "mail"],
    telefono: ["telefono", "celular", "whatsapp"], ruc: ["ruc", "documento", "dni", "nit"],
    ciudad: ["ciudad"], direccion: ["direccion"], saldo: ["saldo"], precio: ["precio"], costo: ["costo"], stock: ["stock"],
  };
  const selects = [];
  for (const campo of campos) {
    const real = colReal(defs, mapa[campo] || [campo]);
    if (real && !selects.some(x => x.real === real)) selects.push({ real, alias: campo });
  }
  if (!selects.length && tabla === "proveedores") {
    ["id", "nombre", "documento", "email", "saldo"].forEach(c => { if (colReal(defs, [c])) selects.push({ real: c, alias: c }); });
  }
  return selects;
}

async function generarExcel(entidad, filas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(entidad);
  if (filas && filas.length) {
    ws.columns = Object.keys(filas[0]).map((k) => ({ header: k, key: k, width: 18 }));
    filas.forEach((f) => ws.addRow(f));
    ws.getRow(1).font = { bold: true };
  } else { ws.addRow(["Sin datos"]); }
  const fname = `${entidad}_${Date.now()}.xlsx`;
  const full  = path.join(EXPORT_DIR, fname);
  await wb.xlsx.writeFile(full);
  return `/exportaciones/${fname}`;
}

async function ejecutar({ pregunta, parsed }) {
  try {
    parsed = parsed && Object.keys(parsed).length ? parsed : nlp.parse(pregunta || "");

    // 1) SIEMPRE intentar engine.v2 primero — incluye analytics v8
    try {
      const e2 = await engineV2.responder(pregunta);
      if (e2 && !e2.fallback && e2.respuesta) return e2;
    } catch (_) {}

    // 2) Inferir entidad para listado
    const entidad = parsed.entidad || inferirEntidad(pregunta);

    if (!entidad) {
      // 3) LLM con contexto de negocio (NO "consulta tu ERP")
      if (ai.enabled && ai.enabled()) {
        try {
          const ans = await ai.chat([
            { role: "system", content: SYSTEM_PROMPT_NEGOCIO },
            { role: "user", content: pregunta },
          ]);
          if (ans) return { agente: "ollama", intent: "chat", datos: null, respuesta: ans };
        } catch (_) {}
      }
      return {
        agente: "smart", intent: "sin_entidad", datos: null,
        respuesta: variator.pick("sin_entidad", [
          "🤔 ¿Sobre qué módulo deseas información? (ventas, clientes, productos, facturas, proveedores, inventario, caja)",
          "💭 Cuéntame qué dato necesitas: ¿ventas del mes? ¿stock bajo? ¿mejores clientes?",
          "🧭 Puedo consultar ventas, compras, facturas, clientes, proveedores, productos y caja."
        ]),
      };
    }

    const candidatos = nlp.ENTIDAD_TABLA?.[entidad] || [entidad];
    const tabla = await schema.tablaExistente(candidatos);
    if (!tabla) {
      return { agente: "smart", intent: "tabla_inexistente", datos: null,
        respuesta: `📭 No hay datos de **${entidad}** aún en la base de datos.` };
    }

    const s = await schema.getSchema();
    const cols = schema.detectarColumnas(s[tabla]);
    const where = []; const params = [];
    if (cols.empresa) { params.push(EMP); where.push(`${cols.empresa} = $${params.length}`); }
    const W = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // EXCEL ONLY
    if (quiereExcel(pregunta)) {
      const orderBy = cols.nombre ? `ORDER BY ${cols.nombre}` : "";
      const r = await db.query(`SELECT * FROM ${tabla} ${W} ${orderBy}`, params);
      if (!r.rows.length) {
        return { agente: "smart", intent: `export_${entidad}`, datos: null,
          respuesta: `📭 No hay ${entidad} para exportar.` };
      }
      const url = await generarExcel(entidad, r.rows);
      return {
        agente: "smart", intent: `export_${entidad}`, datos: null,
        respuesta: `📥 **Excel listo.** Haz clic en el botón para descargar (${r.rows.length} registros de ${entidad}).`,
        archivo: url, tablaPrincipal: tabla, ofrecerExcel: true,
      };
    }

    const op = parsed.op || "listar";
    let sql, intent;
    if (op === "contar") {
      sql = `SELECT COUNT(*)::int AS n FROM ${tabla} ${W}`;
      intent = `contar_${entidad}`;
    } else if (op === "sumar" && cols.total) {
      sql = `SELECT COUNT(*)::int AS n, COALESCE(SUM(${cols.total}),0)::float AS total,
                    COALESCE(AVG(${cols.total}),0)::float AS promedio FROM ${tabla} ${W}`;
      intent = `sumar_${entidad}`;
    } else {
      // PROYECCIÓN: ¿usuario quiere "solo X y su Y"?
      const proy = quiereProyeccion(pregunta) ? camposProyectados(pregunta) : null;
      const defs = s[tabla] || [];
      const selects = proy && proy.length ? columnasSelect(tabla, defs, proy) : [];
      const colsList = selects.length ? selects.map(x => x.real === x.alias ? x.real : `${x.real} AS ${x.alias}`).join(", ") : "*";
      const orderBy = cols.nombre ? `ORDER BY ${cols.nombre}` : "";
      const limite = textNumbers.detectarLimite(pregunta, 500) || 50;
      sql = `SELECT ${colsList} FROM ${tabla} ${W} ${orderBy} LIMIT ${limite}`;
      intent = `listar_${entidad}`;
    }

    let r;
    try { r = await db.query(sql, params); }
    catch (e) {
      // Si la proyección falla por columna inexistente → reintenta sin proyección
      const orderBy = cols.nombre ? `ORDER BY ${cols.nombre}` : "";
      const limite = textNumbers.detectarLimite(pregunta, 500) || 50;
      sql = `SELECT * FROM ${tabla} ${W} ${orderBy} LIMIT ${limite}`;
      r = await db.query(sql, params);
    }
    if (r.rows.length === 0 && W) {
      const orderBy = cols.nombre ? `ORDER BY ${cols.nombre}` : "";
      const limite = textNumbers.detectarLimite(pregunta, 500) || 50;
      const fallbackSql = sql.replace(new RegExp(`\\s+${W.replace(/[$]/g, "\\$")}\\s+`), " ").replace(/LIMIT\s+\d+$/i, `LIMIT ${limite}`);
      try { const r2 = await db.query(fallbackSql, []); if (r2.rows.length) { r = r2; sql = fallbackSql; } } catch (_) {}
    }
    const datos = r.rows;
    const total = datos.length;
    const hayMas = total > 10;
    return {
      agente: "smart", intent, datos, sql,
      tablaPrincipal: tabla,
      hayMas,
      ofrecerExcel: hayMas,
      respuesta: humanizar(intent, entidad, datos, cols, pregunta),
    };
  } catch (err) {
    console.error("smart.agent error:", err);
    return { agente: "smart", intent: "error", datos: null,
      respuesta: "⚠️ Error interno consultando la base de datos.", error: err.message };
  }
}

function inferirEntidad(texto) {
  const t = (texto || "").toLowerCase();
  if (t.includes("cliente"))    return "clientes";
  if (t.includes("factura"))    return "facturas";
  if (t.includes("proveedor"))  return "proveedores";
  if (t.includes("compra"))     return "compras";
  if (t.includes("venta"))      return "ventas";
  if (t.includes("producto") || t.includes("articulo") || t.includes("artículo") ||
      t.includes("item") || t.includes("inventario") || t.includes("stock") ||
      t.includes("mercaderia") || t.includes("mercadería")) return "productos";
  if (t.includes("pago") || t.includes("cobrar")) return "pagos";
  return null;
}

function _camposPedidos(pregunta){
  const t = (pregunta||"").toLowerCase();
  const ex = [];
  if (/\bstock|inventario|existencia\b/.test(t)) ex.push("stock");
  if (/\bprecio\b/.test(t))                       ex.push("precio");
  if (/\bcosto\b/.test(t))                        ex.push("costo");
  if (/\bcorreo|email|e-?mail|mail\b/.test(t))   ex.push("correo");
  if (/\btel[eé]fono|telefono|celular|whatsapp|wsp\b/.test(t)) ex.push("telefono");
  if (/\bruc|dni|documento\b/.test(t))            ex.push("ruc");
  if (/\bciudad|direcci[oó]n\b/.test(t))          ex.push("ciudad","direccion");
  if (/\bsaldo|deuda|debe\b/.test(t))             ex.push("saldo");
  return [...new Set(ex)];
}
function _fmt(c,v){ if (["precio","costo","saldo","total","monto"].includes(c)) return `S/ ${Number(v||0).toFixed(2)}`; return v; }
function humanizar(intent, entidad, datos, cols = {}, pregunta = "") {
  if (!datos?.length) return `📭 No hay resultados de ${entidad}.`;
  if (intent.startsWith("contar")) return `📊 Hay ${datos[0].n} registros de ${entidad}.`;
  if (intent.startsWith("sumar"))  return `💰 Total: S/ ${Number(datos[0].total||0).toFixed(2)} · Promedio: S/ ${Number(datos[0].promedio||0).toFixed(2)} (${datos[0].n} registros)`;

  const LIM = 10;
  const muestra = datos.slice(0, LIM);
  const extras = _camposPedidos(pregunta);
  const sample = muestra[0] || {};
  const nameKey = ["nombre","razon_social","descripcion","titulo"].find(k => k in sample)
                || Object.keys(sample).find(k => k !== "id") || "id";
  const lineas = muestra.map((row, i) => {
    let base = `${i+1}. ${row[nameKey] ?? "(sin nombre)"}`;
    if (extras.length){
      const pares = extras.map(c => row[c] != null ? `${c}: ${_fmt(c,row[c])}` : null).filter(Boolean);
      if (pares.length) base += ` — ${pares.join(" · ")}`;
    }
    return base;
  });
  const sobran = datos.length - muestra.length;
  const head = `📋 ${entidad} — mostrando ${muestra.length} de ${datos.length}:`;
  const tip  = sobran>0
    ? `\n… y ${sobran} más. 💡 Pide "en excel" para descargar la lista completa.`
    : (extras.length ? "" : `\n💡 Tip: agrega "con correo / con stock / con precio" o pide "en excel".`);
  return [head, ...lineas].join("\n") + tip;
}


module.exports = { nombre: "smart", ejecutar };
