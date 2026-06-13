// ─────────────────────────────────────────────────────────────────
//  schemaCatalog.service.js
//  Catálogo de esquema EN MEMORIA construido al arrancar la app.
//
//  Cumple las instrucciones del ERP:
//   1) Cargar metadata de tablas, columnas y relaciones (FOREIGN KEY)
//   2) Guardar metadata en memoria/caché
//   3) Construir JOIN automáticamente a partir de relaciones reales
//   4) Aplicar filtro por empresa_id cuando la tabla lo tenga
//   5) Nunca asumir: toda decisión se basa en metadata real de la BD
//
//  Produce un objeto con la forma:
//  {
//    "proveedores": {
//      "columnas": ["id","nombre","documento","email","empresa_id"],
//      "tipos":    { "id":"integer", "nombre":"text", ... },
//      "pk":       ["id"],
//      "tiene_empresa_id": true,
//      "relaciones": {                       // FKs salientes (esta.col -> destino)
//        "empresa_id": "proveedores.empresa_id = empresas.id"
//      },
//      "referenciada_por": {                 // FKs entrantes (otra.col -> esta)
//        "compras": "compras.proveedor_id = proveedores.id"
//      }
//    },
//    ...
//  }
// ─────────────────────────────────────────────────────────────────
const schemaCache = require("./schemaCache.service");

let CATALOGO = {};
let construidoEn = 0;

// Relaciones conocidas (fallback si la BD NO declara las FOREIGN KEY).
// Se usan SOLO cuando no existe una FK real para esa columna.
const RELACIONES_CONOCIDAS = {
  "compras.proveedor_id":        "proveedores.id",
  "compra_detalle.compra_id":    "compras.id",
  "compra_detalle.producto_id":  "productos.id",
  "facturas.cliente_id":         "clientes.id",
  "factura_detalle.factura_id":  "facturas.id",
  "factura_detalle.producto_id": "productos.id",
  "factura_items.factura_id":    "facturas.id",
  "factura_items.producto_id":   "productos.id",
  "pagos.factura_id":            "facturas.id",
  "cotizaciones.cliente_id":     "clientes.id",
  "guias_remision.cliente_id":   "clientes.id",
  "oportunidades.cliente_id":    "clientes.id",
  "tickets.cliente_id":          "clientes.id",
  "planillas.empleado_id":       "empleados.id",
  "asistencia.empleado_id":      "empleados.id",
  "kardex.producto_id":          "productos.id",
  "lotes.producto_id":           "productos.id",
  "tareas.proyecto_id":          "proyectos.id",
  "usuario_roles.usuario_id":    "usuarios.id",
  "usuario_roles.rol_id":        "roles.id",
  "almacenes.sucursal_id":       "sucursales.id",
  "depreciaciones.activo_id":    "activos_fijos.id",
};

const COL_EMPRESA = ["empresa_id", "empresaid", "tenant_id", "id_empresa"];

// ─── Construcción del catálogo a partir del esquema real ──────────
async function construir({ refrescar = false } = {}) {
  if (refrescar) schemaCache.invalidar();
  const schema = await schemaCache.get(); // { tabla: { columnas:[{nombre,tipo}], pk:[], fks:[{columna,ref_tabla,ref_columna}] } }
  const cat = {};

  // 1) Estructura base por tabla
  for (const [tabla, info] of Object.entries(schema || {})) {
    const columnas = (info.columnas || []).map((c) => c.nombre);
    const tipos = {};
    for (const c of info.columnas || []) tipos[c.nombre] = c.tipo;
    const colEmpresa = COL_EMPRESA.find((c) => columnas.includes(c)) || null;

    cat[tabla] = {
      columnas,
      tipos,
      pk: info.pk && info.pk.length ? info.pk : columnas.includes("id") ? ["id"] : [],
      tiene_empresa_id: !!colEmpresa,
      columna_empresa: colEmpresa,
      relaciones: {},        // FKs reales/conocidas que SALEN de esta tabla
      referenciada_por: {},  // tablas que apuntan a esta
    };
  }

  // 2) Relaciones reales declaradas en la BD (FOREIGN KEY)
  for (const [tabla, info] of Object.entries(schema || {})) {
    for (const fk of info.fks || []) {
      if (!cat[tabla]) continue;
      const expr = `${tabla}.${fk.columna} = ${fk.ref_tabla}.${fk.ref_columna}`;
      cat[tabla].relaciones[fk.columna] = expr;
      if (cat[fk.ref_tabla]) cat[fk.ref_tabla].referenciada_por[tabla] = expr;
    }
  }

  // 3) Relaciones conocidas (solo si NO hay FK real para esa columna y ambas tablas existen)
  for (const [origen, destino] of Object.entries(RELACIONES_CONOCIDAS)) {
    const [tabla, columna] = origen.split(".");
    const [refTabla, refColumna] = destino.split(".");
    if (!cat[tabla] || !cat[refTabla]) continue;
    if (!cat[tabla].columnas.includes(columna)) continue;
    if (cat[tabla].relaciones[columna]) continue; // ya hay FK real
    const expr = `${tabla}.${columna} = ${refTabla}.${refColumna}`;
    cat[tabla].relaciones[columna] = expr;
    cat[refTabla].referenciada_por[tabla] = expr;
  }

  // 4) Inferencia por convención: cualquier columna *_id sin relación declarada
  for (const [tabla, meta] of Object.entries(cat)) {
    for (const col of meta.columnas) {
      if (!col.endsWith("_id")) continue;
      if (meta.relaciones[col]) continue;
      if (COL_EMPRESA.includes(col)) continue;
      const base = col.slice(0, -3);              // proveedor_id -> proveedor
      const candidatos = [base, base + "s", base + "es"]; // proveedor, proveedores
      const refTabla = candidatos.find((t) => cat[t]);
      if (!refTabla) continue;
      const refColumna = cat[refTabla].pk[0] || "id";
      const expr = `${tabla}.${col} = ${refTabla}.${refColumna}`;
      meta.relaciones[col] = expr;
      cat[refTabla].referenciada_por[tabla] = expr;
    }
  }

  CATALOGO = cat;
  construidoEn = Date.now();
  return CATALOGO;
}

async function get({ refrescar = false } = {}) {
  if (refrescar || !construidoEn) await construir({ refrescar });
  return CATALOGO;
}

function getSync() {
  return CATALOGO;
}

// ─── Helpers de consulta ──────────────────────────────────────────

/** ¿La tabla existe en el esquema real? */
function existeTabla(tabla) {
  return !!CATALOGO[tabla];
}

/** Columna real de empresa para una tabla (o null). */
function columnaEmpresa(tabla) {
  return CATALOGO[tabla]?.columna_empresa || null;
}

/**
 * Devuelve la cláusula de filtro multiempresa para una tabla, o "" si no aplica.
 * Ej: empresaFilter("facturas", 1) -> "facturas.empresa_id = 1"
 */
function empresaFilter(tabla, empresaId) {
  const col = columnaEmpresa(tabla);
  if (!col || empresaId == null) return "";
  return `${tabla}.${col} = ${Number(empresaId)}`;
}

/**
 * Construye los JOIN salientes de una tabla (a sus tablas referenciadas por FK).
 * Devuelve [{ tabla, on }] listo para armar SQL.
 * Ej: buildJoins("compras") -> [{ tabla:"proveedores", on:"compras.proveedor_id = proveedores.id" }]
 */
function buildJoins(tabla, { profundidad = 1, visitadas = new Set() } = {}) {
  const meta = CATALOGO[tabla];
  if (!meta) return [];
  visitadas.add(tabla);
  const joins = [];
  for (const [col, on] of Object.entries(meta.relaciones)) {
    const refTabla = on.split(" = ")[1].split(".")[0];
    if (visitadas.has(refTabla)) continue;
    joins.push({ tabla: refTabla, on, via: col });
    if (profundidad > 1) {
      joins.push(...buildJoins(refTabla, { profundidad: profundidad - 1, visitadas }));
    }
  }
  return joins;
}

/** Resuelve a qué tabla.columna apunta una columna *_id de una tabla dada. */
function resolverRelacion(tabla, columna) {
  const on = CATALOGO[tabla]?.relaciones?.[columna];
  if (!on) return null;
  const [, destino] = on.split(" = ");
  const [refTabla, refColumna] = destino.split(".");
  return { tabla: refTabla, columna: refColumna, on };
}

/**
 * Arma un SQL SELECT base con JOINs automáticos y filtro empresa_id.
 * Pensado como ayuda; el generador final puede ajustar columnas.
 */
function selectAuto(tabla, { empresaId = null, columnas = "*", limit = 100 } = {}) {
  if (!existeTabla(tabla)) return null;
  const joins = buildJoins(tabla);
  let sql = `SELECT ${columnas} FROM ${tabla}`;
  for (const j of joins) sql += `\n  LEFT JOIN ${j.tabla} ON ${j.on}`;
  const filtro = empresaFilter(tabla, empresaId);
  if (filtro) sql += `\n WHERE ${filtro}`;
  if (limit) sql += `\n LIMIT ${Number(limit)}`;
  return sql;
}

/** Resumen compacto para logs / debugging. */
function resumen() {
  const tablas = Object.keys(CATALOGO);
  let fks = 0;
  let conEmpresa = 0;
  for (const t of tablas) {
    fks += Object.keys(CATALOGO[t].relaciones).length;
    if (CATALOGO[t].tiene_empresa_id) conEmpresa++;
  }
  return { tablas: tablas.length, relaciones: fks, tablas_multiempresa: conEmpresa, construidoEn };
}

function invalidar() {
  CATALOGO = {};
  construidoEn = 0;
  schemaCache.invalidar();
}

module.exports = {
  construir,
  get,
  getSync,
  existeTabla,
  columnaEmpresa,
  empresaFilter,
  buildJoins,
  resolverRelacion,
  selectAuto,
  resumen,
  invalidar,
  RELACIONES_CONOCIDAS,
};
