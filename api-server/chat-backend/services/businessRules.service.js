// ─────────────────────────────────────────────────────────────────
//  businessRules.service.js
//  Carga y consulta las reglas empresariales (business_rules_v2.json).
//  Indexa por id, categoría e intenciones para búsqueda rápida.
// ─────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const RUTA = path.join(__dirname, "..", "knowledge", "business_rules_v2.json");

let REGLAS = [];
let INDEX_ID = {};
let INDEX_INTENT = []; // [{ tokens:Set, regla }]

function normalizar(t = "") {
  return String(t).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()\-–—_/\\]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

const SINONIMOS = {
  // Sinónimos genéricos del motor de intenciones
  igv: ['iva','impuesto'], iva: ['igv','impuesto'],
  ganancia: ['utilidad','beneficio'], beneficio: ['utilidad','ganancia'],
  proveedor: ['acreedor','suplidor'], acreedor: ['proveedor'],
  comprador: ['cliente'], adquiriente: ['cliente'],
  pendiente: ['por pagar','por cobrar','vencido'],
  mejor: ['top','principal','mayor'], top: ['mejor','principal','mayor'],
  vendedor: ['empleado'], producto: ['articulo','item'],
  cantidad: ['unidades','stock'], factura: ['comprobante','boleta'],
  // Punto 2 del doc: equivalencias de nombres
  ruc: ['documento','nro_documento','numero_documento','tax_id','nit','rut','cedula','cif'],
  documento: ['ruc','nro_documento','numero_documento','tax_id','nit','dni'],
  nro_documento: ['ruc','documento','numero_documento','tax_id'],
  cliente: ['razon_social','nombre_cliente','empresa','comprador','adquiriente'],
  razon_social: ['cliente','nombre_cliente','empresa'],
  nombre_cliente: ['cliente','razon_social','empresa'],
  monto: ['total','importe','valor_venta','precio_total','amount'],
  importe: ['monto','total','valor_venta','precio'],
  valor_venta: ['monto','total','importe'],
  fecha_venta: ['fecha','fecha_factura','created_at','creado_en','fecha_emision'],
  fecha_factura: ['fecha','fecha_venta','emitido_en','created_at'],
  created_at: ['creado_en','fecha','fecha_registro'],
  creado_en: ['created_at','fecha','fecha_emision'],
  // Consultas naturales adicionales
  ventas_hoy: ['vendi hoy','cuanto vendi hoy','ventas de hoy','facture hoy','ingresos hoy'],
  como_voy: ['como van mis ventas','que tal vendo','ventas actuales','resumen ventas'],
  estrategia: ['recomendacion','consejo','que hago','sugerencia','que recomiendas'],
};

function expandirTokens(texto) {
  const base = normalizar(texto).split(" ").filter(Boolean);
  const out = new Set(base);
  for (const t of base) for (const s of (SINONIMOS[t] || [])) out.add(s);
  return out;
}

function cargar() {
  try {
    const raw = fs.readFileSync(RUTA, "utf8");
    REGLAS = JSON.parse(raw);
  } catch (e) {
    console.warn("⚠️ businessRules: no se pudo cargar reglas:", e.message);
    REGLAS = [];
  }
  INDEX_ID = {};
  INDEX_INTENT = [];
  for (const r of REGLAS) {
    INDEX_ID[r.id] = r;
    for (const intent of (r.intenciones || [])) {
      INDEX_INTENT.push({ tokens: expandirTokens(intent), regla: r, intent });
    }
  }
  console.log(`✅ businessRules: ${REGLAS.length} reglas cargadas, ${INDEX_INTENT.length} intenciones`);
}

cargar();

function todas() { return REGLAS; }
function porId(id) { return INDEX_ID[id] || null; }
function porCategoria(cat) { return REGLAS.filter(r => r.categoria === cat); }

// Devuelve mejor match { regla, score, intent }
function buscar(preguntaTexto, minScore = 0.45) {
  const q = expandirTokens(preguntaTexto);
  if (!q.size) return null;
  let best = null;
  for (const entry of INDEX_INTENT) {
    let hits = 0;
    for (const t of entry.tokens) if (q.has(t)) hits++;
    if (!hits) continue;
    const cov = hits / entry.tokens.size;          // cobertura de la intención
    const recall = hits / q.size;                  // de la pregunta
    const score = (cov * 0.7) + (recall * 0.3);
    if (!best || score > best.score) best = { regla: entry.regla, score, intent: entry.intent };
  }
  if (!best || best.score < minScore) return null;
  return best;
}

function recargar() { cargar(); }

module.exports = { cargar, recargar, todas, porId, porCategoria, buscar, normalizar, expandirTokens };
