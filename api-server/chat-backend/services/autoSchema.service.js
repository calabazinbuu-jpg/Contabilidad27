// ─────────────────────────────────────────────────────────────────
//  autoSchema.service.js
//  Crea tablas y columnas faltantes automáticamente.
//  En lugar de mostrar "Diagnóstico Empresarial", el sistema crea
//  lo que falta (valor 0 para numéricos, '' para texto) y reintenta.
// ─────────────────────────────────────────────────────────────────
const db = require("../config/db");
const schemaCache = require("./schemaCache.service");

// Infiere tipo SQL según nombre de columna
function inferirTipo(col) {
  if (/fecha|creado_en|created_at|emitido_en|updated_at/.test(col)) return "DATE DEFAULT NULL";
  if (/precio|costo|total|monto|importe|subtotal|saldo|debe|haber|igv|descuento/.test(col)) return "NUMERIC(14,2) DEFAULT 0";
  if (/cantidad|stock|unidades|qty/.test(col)) return "INTEGER DEFAULT 0";
  if (/empresa_id|cliente_id|proveedor_id|usuario_id|producto_id|vendedor_id/.test(col)) return "INTEGER DEFAULT 0";
  if (/estado|tipo|moneda|unidad/.test(col)) return "VARCHAR(50) DEFAULT ''";
  return "TEXT DEFAULT ''";
}

// Crea tabla si no existe
async function crearTabla(nombre) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${nombre} (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER DEFAULT 1,
      creado_en TIMESTAMP DEFAULT NOW()
    )
  `);
}

// Agrega columna si no existe
async function agregarColumna(tabla, columna) {
  const tipo = inferirTipo(columna);
  await db.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${columna} ${tipo}`);
}

// Repara todas las faltantes y devuelve true si algo fue creado
async function reparar(faltantes) {
  let cambios = false;
  for (const t of (faltantes.tablas || [])) {
    try {
      await crearTabla(t);
      cambios = true;
    } catch (e) {
      console.warn(`autoSchema: no pude crear tabla ${t}:`, e.message);
    }
  }
  for (const cFull of (faltantes.columnas || [])) {
    const [tabla, columna] = cFull.split(".");
    if (!tabla || !columna) continue;
    try {
      // Asegurar que la tabla existe primero
      await crearTabla(tabla);
      await agregarColumna(tabla, columna);
      cambios = true;
    } catch (e) {
      console.warn(`autoSchema: no pude agregar columna ${cFull}:`, e.message);
    }
  }
  if (cambios) schemaCache.invalidar();
  return cambios;
}

module.exports = { reparar, crearTabla, agregarColumna };
