// =============================================================
//  v3 — Layer 6: Generador de Filtros Estructurados (SQL-safe)
//  Convierte { intent, table, entities, dateRange } en un objeto
//  filters listo para que sql.builder lo traduzca a WHERE.
// =============================================================
"use strict";

// Mapeo entity-type → columna candidata por tabla
const ENTITY_COLUMN_MAP = {
  ventas:      { PRODUCT: "producto", CLIENT: "cliente", CITY: "ciudad" },
  compras:     { PRODUCT: "producto", PROVIDER: "proveedor", CITY: "ciudad" },
  facturas:    { CLIENT: "cliente", CITY: "ciudad" },
  clientes:    { CLIENT: "nombre", CITY: "ciudad" },
  proveedores: { PROVIDER: "razon_social", CITY: "ciudad" },
  productos:   { PRODUCT: "nombre" },
  inventario:  { PRODUCT: "producto" },
  pagos:       { CLIENT: "cliente", PROVIDER: "proveedor" },
};

function buildFilters({ table, entities = [], dateRange = null, extras = {} } = {}) {
  const filters = { ...extras };
  if (dateRange) {
    filters.date = {
      from: dateRange.desdeYmd || (dateRange.desde && dateRange.desde.toISOString().slice(0,10)),
      to:   dateRange.hastaYmd || (dateRange.hasta && dateRange.hasta.toISOString().slice(0,10)),
      tag:  dateRange.tipo,
    };
  }
  const colMap = ENTITY_COLUMN_MAP[table] || {};
  for (const ent of entities) {
    const col = colMap[ent.type];
    if (!col) continue;
    filters[col] = ent.value;
  }
  return filters;
}

module.exports = { buildFilters, ENTITY_COLUMN_MAP };
