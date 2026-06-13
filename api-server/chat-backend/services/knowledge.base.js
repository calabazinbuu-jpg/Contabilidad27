// =============================================================
//  knowledge.base.js — v8.6 Knowledge-Driven Q&A engine
//  Carga un dataset de preguntas tipo (patrones + SQL plantilla)
//  y selecciona la mejor coincidencia por scoring de tokens.
//  Sustituye {from}/{to} usando el detector de fechas del engine.v2.
//  Devuelve null si no hay match con confianza suficiente.
// =============================================================
"use strict";
const path = require("path");
const fs = require("fs");
const db = require("../config/db");

const DATASET_PATH = path.join(__dirname, "..", "knowledge", "erp_dataset.json");
let DATASET = [];
try {
  DATASET = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
  console.log(`📚 knowledge.base: ${DATASET.length} preguntas cargadas`);
} catch (e) {
  console.warn("⚠️ knowledge.base: no se pudo cargar el dataset:", e.message);
}

// ── Normalización ─────────────────────────────────────────────
function normalizar(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const SINONIMOS = {
  iva: "igv", ingresos: "ventas", ganancia: "utilidad", ganancias: "utilidad",
  beneficio: "utilidad", profit: "utilidad",
  "mas vendido": "top vendido", "mas vendidos": "top vendido",
  cliente: "cliente", clientes: "cliente",
  proveedores: "proveed", proveedor: "proveed",
  factura: "factur", facturas: "factur",
  producto: "producto", productos: "producto",
  venta: "vent", ventas: "vent", vendido: "vent",
  compra: "compr", compras: "compr",
};
function expandir(t) {
  for (const [k, v] of Object.entries(SINONIMOS)) {
    t = t.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  }
  return t;
}
function tokens(s) { return expandir(normalizar(s)).split(/\s+/).filter(Boolean); }

// ── Scoring ───────────────────────────────────────────────────
function scoreEntry(qTokens, entry) {
  const qSet = new Set(qTokens);
  let best = 0;
  for (const patron of entry.patrones || []) {
    let hits = 0;
    for (const tok of patron) {
      // permite coincidencia por prefijo: "vent" matchea "ventas"
      const hit = qTokens.some(qt => qt.startsWith(tok) || tok.startsWith(qt));
      if (hit) hits++;
    }
    // score = porcentaje del patrón cubierto + bono si todos están
    const cov = patron.length ? hits / patron.length : 0;
    let s = cov * patron.length; // n hits ponderados
    if (hits === patron.length && patron.length >= 2) s += 2; // bono match completo
    if (s > best) best = s;
  }
  return best;
}

function pickBest(pregunta) {
  if (!DATASET.length) return null;
  const qt = tokens(pregunta);
  let best = null;
  for (const entry of DATASET) {
    const s = scoreEntry(qt, entry);
    if (!best || s > best.score) best = { entry, score: s };
  }
  // umbral mínimo: 2 (al menos 2 tokens del patrón coincidieron)
  if (!best || best.score < 2) return null;
  return best;
}

// ── Fechas (mismo set que engine.v2) ──────────────────────────
const MESES = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12 };
function finDeMes(y,m){ return new Date(y,m,0).getDate(); }
function fmt(y,m,d){ return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function detectarFecha(pregunta, def) {
  const t = normalizar(pregunta);
  const hoy = new Date(); const yA = hoy.getFullYear();
  if (/\bhoy\b/.test(t)) { const m=hoy.getMonth()+1,d=hoy.getDate(); return {inicio:fmt(yA,m,d),fin:fmt(yA,m,d),etiqueta:"hoy"}; }
  if (/\bayer\b/.test(t)) { const a=new Date(hoy); a.setDate(a.getDate()-1); return {inicio:fmt(a.getFullYear(),a.getMonth()+1,a.getDate()),fin:fmt(a.getFullYear(),a.getMonth()+1,a.getDate()),etiqueta:"ayer"}; }
  if (/\b(este mes|mes actual|del mes|este mes)\b/.test(t)) { const m=hoy.getMonth()+1; return {inicio:fmt(yA,m,1),fin:fmt(yA,m,finDeMes(yA,m)),etiqueta:"mes_actual"}; }
  if (/\b(mes pasado|mes anterior|ultimo mes)\b/.test(t)) { const a=new Date(yA,hoy.getMonth()-1,1); const y=a.getFullYear(),m=a.getMonth()+1; return {inicio:fmt(y,m,1),fin:fmt(y,m,finDeMes(y,m)),etiqueta:"mes_pasado"}; }
  if (/\b(este ano|este año|ano actual|anual)\b/.test(t)) return {inicio:fmt(yA,1,1),fin:fmt(yA,12,31),etiqueta:`ano_${yA}`};
  if (/\b(ano pasado|año pasado|ano anterior)\b/.test(t)) return {inicio:fmt(yA-1,1,1),fin:fmt(yA-1,12,31),etiqueta:`ano_${yA-1}`};
  for (const [n,i] of Object.entries(MESES)) {
    if (new RegExp(`\\b${n}\\b`).test(t)) { const ya=t.match(/\b(20\d{2})\b/); const y=ya?+ya[1]:yA; return {inicio:fmt(y,i,1),fin:fmt(y,i,finDeMes(y,i)),etiqueta:`${n}_${y}`}; }
  }
  const ya = t.match(/\b(20\d{2})\b/);
  if (ya) return {inicio:fmt(+ya[1],1,1),fin:fmt(+ya[1],12,31),etiqueta:`ano_${ya[1]}`};
  // valor por defecto solicitado por la entrada
  if (def === "hoy") { const m=hoy.getMonth()+1,d=hoy.getDate(); return {inicio:fmt(yA,m,d),fin:fmt(yA,m,d),etiqueta:"hoy"}; }
  if (def === "mes_actual") { const m=hoy.getMonth()+1; return {inicio:fmt(yA,m,1),fin:fmt(yA,m,finDeMes(yA,m)),etiqueta:"mes_actual"}; }
  return null;
}

// ── Render ────────────────────────────────────────────────────
function dinero(n){ return Number(n||0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtVal(v){ if (v === null || v === undefined) return "-"; if (typeof v === "number") return Number.isInteger(v) ? String(v) : dinero(v); return String(v); }
function etiquetaTag(f){ return f ? ` (${f.etiqueta} · ${f.inicio} → ${f.fin})` : ""; }

function render(entry, rows, fecha) {
  const tmpl = entry.respuesta || "";
  const etiqueta = etiquetaTag(fecha);
  const safe = (s) => String(s).replace(/\{etiqueta\}/g, etiqueta);

  if (!rows || rows.length === 0) {
    return safe(`📭 Sin resultados${etiqueta}.`);
  }
  if (entry.render === "scalar_money") {
    const v = rows[0].valor ?? rows[0][Object.keys(rows[0])[0]];
    return safe(tmpl.replace(/\{valor\}/g, dinero(v)));
  }
  if (entry.render === "scalar_int") {
    const v = rows[0].valor ?? rows[0][Object.keys(rows[0])[0]];
    return safe(tmpl.replace(/\{valor\}/g, fmtVal(v)));
  }
  if (entry.render === "kv") {
    const r = rows[0];
    return safe(tmpl
      .replace(/\{nombre\}/g, r.nombre ?? r.doc ?? "(s/n)")
      .replace(/\{doc\}/g, r.doc ?? "")
      .replace(/\{valor\}/g, fmtVal(r.valor)));
  }
  // list
  const head = safe(tmpl);
  const lineas = rows.slice(0, 15).map((r, i) => {
    const cols = Object.entries(r)
      .filter(([k]) => k !== "id")
      .map(([k, v]) => `${k}: ${fmtVal(v)}`).join(" · ");
    return `${i + 1}. ${cols}`;
  });
  const tail = rows.length > 15 ? `\n… y ${rows.length - 15} más.` : "";
  return `${head}\n${lineas.join("\n")}${tail}`;
}

// ── Ejecutar ──────────────────────────────────────────────────
async function responder(pregunta) {
  const m = pickBest(pregunta);
  if (!m) return null;
  const { entry, score } = m;

  // sustituir fechas si la plantilla las usa
  let sql = entry.sql || "";
  let fecha = null;
  if (/\{from\}|\{to\}/.test(sql) || entry.date_required) {
    fecha = detectarFecha(pregunta, entry.date_default || "mes_actual");
    if (fecha) {
      sql = sql.replace(/\{from\}/g, fecha.inicio).replace(/\{to\}/g, fecha.fin);
    } else {
      // sin fecha y no hay default → no podemos ejecutar con seguridad
      return null;
    }
  }
  // where_optional: añade filtro por fecha si se detecta uno
  if (entry.where_optional === "fecha" && !fecha) {
    fecha = detectarFecha(pregunta, null);
  }
  if (sql.includes("{where}")) {
    if (fecha) sql = sql.replace(/\{where\}/g, `WHERE fecha BETWEEN '${fecha.inicio}' AND '${fecha.fin}'`);
    else sql = sql.replace(/\{where\}/g, "");
  }
  if (sql.includes("{and_fecha}")) {
    if (fecha) sql = sql.replace(/\{and_fecha\}/g, `AND fecha BETWEEN '${fecha.inicio}' AND '${fecha.fin}'`);
    else sql = sql.replace(/\{and_fecha\}/g, "");
  }
  if (sql.includes("{where_alone}")) {
    if (fecha) sql = sql.replace(/\{where_alone\}/g, `WHERE fecha BETWEEN '${fecha.inicio}' AND '${fecha.fin}'`);
    else sql = sql.replace(/\{where_alone\}/g, "");
  }

  // Guardrails básicos
  if (/;\s*\S/.test(sql) || /\b(drop|delete|update|insert|alter|truncate)\b/i.test(sql)) {
    console.warn("knowledge.base: SQL rechazado por guardrail");
    return null;
  }

  try {
    const r = await db.query(sql);
    return {
      agente: "knowledge",
      intent: `kb#${entry.id}`,
      datos: r.rows,
      sql,
      score,
      pregunta_match: entry.pregunta,
      respuesta: render(entry, r.rows, fecha),
    };
  } catch (e) {
    console.warn(`knowledge.base SQL error en kb#${entry.id}:`, e.message);
    return null;
  }
}

module.exports = { responder, _dataset: DATASET };
