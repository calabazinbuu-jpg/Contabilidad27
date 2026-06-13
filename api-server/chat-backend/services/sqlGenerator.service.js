// ─────────────────────────────────────────────────────────────────
//  sqlGenerator.service.js
//  Genera SQL final desde una regla + contexto (fechas, filtros)
//  Adapta tablas y columnas al esquema real usando schemaCache.
// ─────────────────────────────────────────────────────────────────
const schemaCache = require("./schemaCache.service");

// Diccionario de equivalencias por defecto
const EQ_TABLAS = {
  ventas:                ['ventas','facturas','comprobantes'],
  facturas:              ['facturas','ventas','comprobantes'],
  compras:               ['compras','ordenes_compra'],
  productos:             ['productos','articulos','items'],
  movimientos_inventario:['movimientos_inventario','kardex'],
  clientes:              ['clientes'],
  proveedores:           ['proveedores'],
  pagos:                 ['pagos','cobranzas','caja'],
  asientos_contables:    ['asientos','asientos_contables'],
  asientos_detalle:      ['asiento_detalle','asientos_detalle'],
  cuentas_contables:     ['cuentas_contables','plan_cuentas'],
  gastos:                ['gastos','caja'],
  caja:                  ['caja','pagos','movimientos'],
};
const EQ_COLS = {
  total:      ['total','monto','importe','valor_venta','valor_total','precio_total','amount','subtotal','neto'],
  monto:      ['monto','total','importe','valor_venta','valor_total'],
  fecha:      ['fecha','fecha_venta','fecha_factura','created_at','creado_en','emitido_en','fecha_emision','fecha_registro','fecha_pedido','fecha_compra'],
  estado:     ['estado','status','situacion','condicion'],
  cliente_id: ['cliente_id','id_cliente'],
  producto_id:['producto_id','id_producto'],
  proveedor_id:['proveedor_id','id_proveedor'],
  cantidad:   ['cantidad','qty','unidades','stock','existencia'],
  costo:      ['costo','precio_costo','precio','valor'],
  precio:     ['precio','precio_venta','costo','precio_unitario','valor'],
  stock:      ['stock','existencia','cantidad','qty','saldo_unidades'],
  saldo:      ['saldo','saldo_pendiente','balance','total'],
  nombre:     ['nombre','razon_social','nombre_cliente','empresa','denominacion','nombres'],
  documento:  ['documento','ruc','nro_documento','numero_documento','tax_id','nit','dni','cedula'],
  ruc:        ['ruc','documento','nro_documento','numero_documento','tax_id','nit'],
  numero:     ['numero','nro','numero_factura','nro_factura','serie','comprobante'],
  ingreso:    ['ingreso','ingresos','entrada','cobro'],
  egreso:     ['egreso','egresos','salida','gasto'],
};

// Parser sencillo de fechas en español
function parsearFechas(texto = "") {
  const t = String(texto).toLowerCase();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d) => d.toISOString().slice(0, 10);

  if (/\bhoy\b/.test(t))        return { from: iso(now), to: iso(now), etiqueta: "hoy" };
  if (/\bayer\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    return { from: iso(d), to: iso(d), etiqueta: "ayer" };
  }
  if (/(esta\s+semana|semana\s+actual)/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay());
    return { from: iso(d), to: iso(now), etiqueta: "esta semana" };
  }
  if (/(este\s+mes|mes\s+actual)/.test(t)) {
    return { from: `${y}-${String(m+1).padStart(2,"0")}-01`, to: iso(now), etiqueta: "este mes" };
  }
  if (/(mes\s+pasado|ultimo\s+mes|último\s+mes)/.test(t)) {
    const from = new Date(y, m-1, 1), to = new Date(y, m, 0);
    return { from: iso(from), to: iso(to), etiqueta: "mes pasado" };
  }
  if (/(este\s+a[ñn]o|a[ñn]o\s+actual)/.test(t)) {
    return { from: `${y}-01-01`, to: iso(now), etiqueta: "este año" };
  }
  if (/(a[ñn]o\s+pasado|ultimo\s+a[ñn]o|último\s+a[ñn]o)/.test(t)) {
    return { from: `${y-1}-01-01`, to: `${y-1}-12-31`, etiqueta: "año pasado" };
  }
  const u = t.match(/ultim[oa]s?\s+(\d{1,3})\s+(d[ií]as|semanas|meses)/);
  if (u) {
    const n = parseInt(u[1], 10);
    const d = new Date(now);
    if (u[2].startsWith("d")) d.setDate(d.getDate() - n);
    else if (u[2].startsWith("s")) d.setDate(d.getDate() - n*7);
    else d.setMonth(d.getMonth() - n);
    return { from: iso(d), to: iso(now), etiqueta: `últimos ${n} ${u[2]}` };
  }
  const MESES = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
  const mm = t.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de)?\s*(\d{4})?/);
  if (mm) {
    const mi = MESES[mm[1]];
    const yy = mm[2] ? parseInt(mm[2],10) : y;
    const from = new Date(yy, mi, 1), to = new Date(yy, mi+1, 0);
    return { from: iso(from), to: iso(to), etiqueta: `${mm[1]} ${yy}` };
  }
  const trim = t.match(/(?:ultimo|último|primer|segundo|tercer|cuarto)\s+trimestre/);
  if (trim) {
    let qStart;
    if (trim[0].includes("primer")) qStart = 0;
    else if (trim[0].includes("segundo")) qStart = 3;
    else if (trim[0].includes("tercer")) qStart = 6;
    else qStart = 9;
    const from = new Date(y, qStart, 1), to = new Date(y, qStart+3, 0);
    return { from: iso(from), to: iso(to), etiqueta: trim[0] };
  }
  return null;
}

// Construye un WHERE basado en la regla + filtros detectados
async function construirWhere(regla, ctx) {
  const partes = [];
  const params = [];

  const fechas = ctx?.fechas;
  if (fechas?.from && fechas?.to) {
    // localiza la columna fecha real
    const tabla = regla.tablas_requeridas?.[0];
    if (tabla) {
      const col = await schemaCache.buscarColumnaEquivalente(tabla, EQ_COLS.fecha);
      if (col) {
        partes.push(`${alias(tabla)}.${col} BETWEEN $${params.length+1} AND $${params.length+2}`);
        params.push(fechas.from, fechas.to);
      }
    }
  }
  return { where: partes.length ? "WHERE " + partes.join(" AND ") : "", params };
}

function alias(tabla) {
  // alias por primera letra usada en sql_template (ventas v, facturas f, clientes c)
  const a = { ventas:"v", facturas:"f", clientes:"c", productos:"p", proveedores:"pr",
              compras:"co", pagos:"pa", movimientos_inventario:"mi",
              asientos_contables:"a", asientos_detalle:"ad", cuentas_contables:"cc" };
  return a[tabla] || tabla;
}

// Adapta la plantilla SQL al esquema real, reemplazando tablas/columnas faltantes por equivalentes
async function adaptarSql(regla) {
  let sql = regla.sql_template || "";
  const adaptaciones = [];
  const faltantes = { tablas: [], columnas: [] };

  for (const t of (regla.tablas_requeridas || [])) {
    const existe = await schemaCache.existeTabla(t);
    if (!existe) {
      const eq = await schemaCache.buscarEquivalente(EQ_TABLAS[t] || [t]);
      if (eq && eq !== t) {
        sql = sql.replace(new RegExp(`\\b${t}\\b`, "g"), eq);
        adaptaciones.push(`tabla ${t} → ${eq}`);
      } else {
        faltantes.tablas.push(t);
      }
    }
  }
  for (const c of (regla.columnas_requeridas || [])) {
    // intentar en la tabla principal
    const tabla = regla.tablas_requeridas?.[0];
    if (!tabla) continue;
    const realTabla = (await schemaCache.existeTabla(tabla)) ? tabla
      : (await schemaCache.buscarEquivalente(EQ_TABLAS[tabla] || [tabla]));
    if (!realTabla) continue;
    if (!(await schemaCache.existeColumna(realTabla, c))) {
      const eq = await schemaCache.buscarColumnaEquivalente(realTabla, EQ_COLS[c] || [c]);
      if (eq && eq !== c) {
        sql = sql.replace(new RegExp(`\\b${c}\\b`, "g"), eq);
        adaptaciones.push(`columna ${c} → ${eq}`);
      } else {
        faltantes.columnas.push(`${realTabla}.${c}`);
      }
    }
  }
  return { sql, adaptaciones, faltantes };
}

async function generar(regla, ctx = {}) {
  const { sql: base, adaptaciones, faltantes } = await adaptarSql(regla);
  const { where, params } = await construirWhere(regla, ctx);
  const sqlFinal = base.replace(/\{where\}/g, where);
  // Solo pasar params si el SQL final realmente usa placeholders ($1, $2, ...)
  // Esto evita el error "bind entrega N params pero la sentencia requiere 0"
  const hasPlaceholders = /\$\d+/.test(sqlFinal);
  return { sql: sqlFinal, params: hasPlaceholders ? params : [], adaptaciones, faltantes };
}

module.exports = { generar, parsearFechas, adaptarSql };
