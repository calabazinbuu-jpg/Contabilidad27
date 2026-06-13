// ─────────────────────────────────────────────────────────────────
//  schemaCache.service.js
//  Caché del esquema real de PostgreSQL (tablas, columnas, FKs).
//  TTL 5 min. Se autoinvalida cuando se detectan tablas nuevas.
// ─────────────────────────────────────────────────────────────────
const db = require("../config/db");

const TTL = 5 * 60 * 1000;
let cache = null;
let cachedAt = 0;

async function refrescar() {
  const cols = await db.query(`
    SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position
  `);
  const pks = await db.query(`
    SELECT kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
     WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
  `);
  const fks = await db.query(`
    SELECT
      tc.table_name        AS from_table,
      kcu.column_name      AS from_column,
      ccu.table_name       AS to_table,
      ccu.column_name      AS to_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage      kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
  `);

  const tablas = {};
  for (const r of cols.rows) {
    if (!tablas[r.table_name]) tablas[r.table_name] = { columnas: [], pk: [], fks: [] };
    tablas[r.table_name].columnas.push({ nombre: r.column_name, tipo: r.data_type, nullable: r.is_nullable === 'YES' });
  }
  for (const r of pks.rows) {
    if (tablas[r.table_name]) tablas[r.table_name].pk.push(r.column_name);
  }
  for (const r of fks.rows) {
    if (tablas[r.from_table]) tablas[r.from_table].fks.push({
      columna: r.from_column, ref_tabla: r.to_table, ref_columna: r.to_column,
    });
  }
  cache = tablas;
  cachedAt = Date.now();
  return tablas;
}

async function get() {
  if (!cache || Date.now() - cachedAt > TTL) {
    try { await refrescar(); }
    catch (e) { console.warn("⚠️ schemaCache.get:", e.message); cache = cache || {}; }
  }
  return cache;
}

function invalidar() { cache = null; cachedAt = 0; }

async function existeTabla(nombre) {
  const s = await get();
  return !!s[nombre];
}
async function existeColumna(tabla, columna) {
  const s = await get();
  if (!s[tabla]) return false;
  return s[tabla].columnas.some(c => c.nombre === columna);
}
async function buscarEquivalente(candidatos = []) {
  const s = await get();
  for (const c of candidatos) if (s[c]) return c;
  return null;
}
async function buscarColumnaEquivalente(tabla, candidatos = []) {
  const s = await get();
  if (!s[tabla]) return null;
  const set = new Set(s[tabla].columnas.map(c => c.nombre));
  for (const c of candidatos) if (set.has(c)) return c;
  return null;
}

module.exports = { get, refrescar, invalidar, existeTabla, existeColumna, buscarEquivalente, buscarColumnaEquivalente };
