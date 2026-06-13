// ─────────────────────────────────────────────────────────────────
//  hybrid/schema.repair.js
//  Auto-reparación de esquema. Crea tablas/columnas faltantes
//  con tipos seguros. NUNCA inserta datos falsos.
//
//  Uso:
//    await asegurarTabla("ventas", { fecha:"DATE", total:"NUMERIC(12,2)" });
//    await asegurarColumna("ventas", "igv", "NUMERIC(12,2)", 0);
//
//  Devuelve un reporte { problema, accion, estado } para el formato
//  obligatorio del MODO BD.
// ─────────────────────────────────────────────────────────────────
const db = require("../../config/db");
const schemaIntrospect = require("../schema.introspect");

const TIPOS_VALIDOS = /^(SERIAL|BIGSERIAL|INT(EGER)?|BIGINT|SMALLINT|NUMERIC(\(\d+,\d+\))?|DECIMAL(\(\d+,\d+\))?|REAL|DOUBLE PRECISION|TEXT|VARCHAR(\(\d+\))?|CHAR(\(\d+\))?|DATE|TIMESTAMP(\s+WITH(OUT)?\s+TIME ZONE)?|BOOLEAN|JSONB|JSON|UUID)$/i;

function _validarTipo(t) {
  if (!t || !TIPOS_VALIDOS.test(String(t).trim())) {
    throw new Error(`Tipo SQL no permitido: ${t}`);
  }
}
function _validarIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
}

async function existeTabla(tabla) {
  _validarIdent(tabla);
  const r = await db.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1`, [tabla]);
  return r.rowCount > 0;
}

async function existeColumna(tabla, col) {
  _validarIdent(tabla); _validarIdent(col);
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [tabla, col]);
  return r.rowCount > 0;
}

/**
 * Crea la tabla si no existe. `columnas` = { nombre: "TIPO SQL" }.
 * Siempre añade `id SERIAL PRIMARY KEY` y `creado_en TIMESTAMP DEFAULT NOW()`.
 */
async function asegurarTabla(tabla, columnas = {}) {
  _validarIdent(tabla);
  if (await existeTabla(tabla)) {
    return { problema: null, accion: `tabla ${tabla} ya existía`, estado: "ok" };
  }
  const defs = ["id SERIAL PRIMARY KEY"];
  for (const [c, t] of Object.entries(columnas)) {
    _validarIdent(c); _validarTipo(t);
    defs.push(`${c} ${t}`);
  }
  defs.push("creado_en TIMESTAMP DEFAULT NOW()");
  const sql = `CREATE TABLE public.${tabla} (${defs.join(", ")})`;
  await db.query(sql);
  schemaIntrospect.invalidar();
  return {
    problema: `tabla ${tabla} no existía`,
    accion:   `CREATE TABLE ${tabla} (${defs.join(", ")})`,
    estado:   "creada — lista para consultas",
  };
}

/**
 * Crea la columna si no existe. Para tipos numéricos inicializa en 0.
 */
async function asegurarColumna(tabla, col, tipo, defaultNumerico = null) {
  _validarIdent(tabla); _validarIdent(col); _validarTipo(tipo);

  if (!(await existeTabla(tabla))) {
    return {
      problema: `tabla ${tabla} no existe`,
      accion:   "no se creó la columna porque la tabla no existe",
      estado:   "FALTA INFORMACIÓN EN TABLA " + tabla.toUpperCase(),
    };
  }
  if (await existeColumna(tabla, col)) {
    return { problema: null, accion: `columna ${tabla}.${col} ya existía`, estado: "ok" };
  }
  const esNum = /^(NUMERIC|DECIMAL|INT|BIGINT|SMALLINT|REAL|DOUBLE)/i.test(tipo);
  const def   = esNum ? ` DEFAULT ${Number(defaultNumerico ?? 0)}` : "";
  await db.query(`ALTER TABLE public.${tabla} ADD COLUMN ${col} ${tipo}${def}`);
  if (esNum) {
    await db.query(`UPDATE public.${tabla} SET ${col}=${Number(defaultNumerico ?? 0)} WHERE ${col} IS NULL`);
  }
  schemaIntrospect.invalidar();
  return {
    problema: `columna ${tabla}.${col} no existía`,
    accion:   `ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo}${def}`,
    estado:   "creada — lista para consultas",
  };
}

/**
 * Asegura un set completo { tabla: { col: tipo } } y devuelve reporte.
 */
async function asegurarEsquema(spec = {}) {
  const reporte = [];
  for (const [tabla, cols] of Object.entries(spec)) {
    reporte.push(await asegurarTabla(tabla, cols));
    for (const [c, t] of Object.entries(cols)) {
      reporte.push(await asegurarColumna(tabla, c, t));
    }
  }
  return reporte.filter(r => r.problema); // solo cambios reales
}

module.exports = {
  existeTabla, existeColumna,
  asegurarTabla, asegurarColumna, asegurarEsquema,
};
