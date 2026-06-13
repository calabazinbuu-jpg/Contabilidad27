// ─────────────────────────────────────────────────────────────────
//  schema.introspect.js — Lee la estructura real de la BD
//  Cachea por 5 minutos. Sirve para que el agente SMART sepa
//  qué tablas y columnas existen sin tener que hardcodearlas.
// ─────────────────────────────────────────────────────────────────
const db = require("../config/db");
const TTL = 5 * 60 * 1000;
let cache = null, cachedAt = 0;

async function getSchema() {
  if (cache && Date.now() - cachedAt < TTL) return cache;
  try {
    const r = await db.query(`
      SELECT table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position
    `);
    const tablas = {};
    for (const row of r.rows) {
      if (!tablas[row.table_name]) tablas[row.table_name] = [];
      tablas[row.table_name].push({ col: row.column_name, tipo: row.data_type });
    }
    cache = tablas; cachedAt = Date.now();
    return tablas;
  } catch (e) {
    console.warn("⚠️ No pude leer schema:", e.message);
    return {};
  }
}

// Busca la primera tabla existente que matchee algún candidato
async function tablaExistente(candidatos) {
  const s = await getSchema();
  for (const c of candidatos) if (s[c]) return c;
  return null;
}

// Busca la primera columna existente que matchee algún candidato
function columnaExistente(cols, candidatos) {
  const set = new Set(cols.map(c => c.col));
  for (const c of candidatos) if (set.has(c)) return c;
  return null;
}

// Detecta columnas semánticas comunes
function detectarColumnas(cols) {
  return {
    fecha:  columnaExistente(cols, ["fecha","creado_en","created_at","fecha_emision","emitido_en","fecha_registro"]),
    total:  columnaExistente(cols, ["total","monto","importe","subtotal","valor","cantidad_total"]),
    estado: columnaExistente(cols, ["estado","status","situacion"]),
    nombre: columnaExistente(cols, ["nombre","name","razon_social","descripcion"]),
    empresa:columnaExistente(cols, ["empresa_id","empresaid","tenant_id"]),
  };
}

function invalidar() { cache = null; }

module.exports = { getSchema, tablaExistente, columnaExistente, detectarColumnas, invalidar };
