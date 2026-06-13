// ─────────────────────────────────────────────────────────────────
//  schemaResolver.service.js
//  Implementa los 5 puntos del documento:
//  1. Búsqueda en tablas relacionadas (fallback automático)
//  2. Mapeo de nombres equivalentes (sinónimos de columnas)
//  3. Búsqueda por significado semántico
//  4. Detección automática de columnas equivalentes
//  5. Estrategia completa — nunca responder "no encontrado"
//     sin revisar tablas y columnas equivalentes primero.
// ─────────────────────────────────────────────────────────────────
const db          = require("../config/db");
const schemaCache = require("./schemaCache.service");

// ═══════════════════════════════════════════════════════════
// PUNTO 2 & 3 — Diccionario completo de sinónimos de columnas
// ═══════════════════════════════════════════════════════════
const SINONIMOS_COLUMNA = {
  // RUC / documento fiscal
  ruc:              ["ruc", "documento", "nro_documento", "numero_documento", "documento_cliente", "tax_id", "nit", "rut", "cedula", "cif"],
  documento:        ["documento", "ruc", "nro_documento", "numero_documento", "tax_id", "nit", "dni", "cedula"],
  nro_documento:    ["nro_documento", "documento", "ruc", "numero_documento", "tax_id"],
  // Cliente / empresa
  cliente:          ["nombre", "razon_social", "nombre_cliente", "empresa", "nombre_empresa", "cliente", "denominacion"],
  razon_social:     ["razon_social", "nombre", "nombre_cliente", "empresa", "denominacion"],
  nombre_cliente:   ["nombre_cliente", "nombre", "razon_social", "empresa"],
  nombre:           ["nombre", "razon_social", "nombre_cliente", "empresa", "denominacion"],
  // Proveedor
  proveedor:        ["nombre", "razon_social", "nombre_proveedor", "empresa_proveedor"],
  nombre_proveedor: ["nombre_proveedor", "nombre", "razon_social"],
  // Monto / dinero
  total:            ["total", "monto", "importe", "valor_venta", "valor_total", "precio_total", "amount", "subtotal", "neto"],
  monto:            ["monto", "total", "importe", "valor_venta", "valor_total", "precio_total"],
  importe:          ["importe", "total", "monto", "valor_venta"],
  valor_venta:      ["valor_venta", "total", "monto", "importe"],
  precio:           ["precio", "precio_venta", "costo", "precio_unitario", "valor"],
  costo:            ["costo", "precio_costo", "precio", "valor"],
  // Fecha
  fecha:            ["fecha", "fecha_venta", "fecha_factura", "created_at", "creado_en", "emitido_en", "fecha_emision", "fecha_registro", "fecha_pedido", "fecha_compra"],
  fecha_venta:      ["fecha_venta", "fecha", "created_at", "creado_en", "fecha_emision", "fecha_factura"],
  fecha_factura:    ["fecha_factura", "fecha", "fecha_venta", "emitido_en", "created_at"],
  created_at:       ["created_at", "creado_en", "fecha", "fecha_registro"],
  creado_en:        ["creado_en", "created_at", "fecha", "fecha_emision"],
  // Estado
  estado:           ["estado", "status", "situacion", "condicion"],
  // Cantidad / stock
  cantidad:         ["cantidad", "qty", "unidades", "stock", "existencia", "saldo_unidades"],
  stock:            ["stock", "existencia", "cantidad", "qty", "saldo_unidades", "inventario"],
  existencia:       ["existencia", "stock", "cantidad", "saldo_unidades"],
  // ID de referencia
  cliente_id:       ["cliente_id", "id_cliente"],
  proveedor_id:     ["proveedor_id", "id_proveedor"],
  producto_id:      ["producto_id", "id_producto"],
  factura_id:       ["factura_id", "id_factura", "comprobante_id"],
  // Número de comprobante
  numero:           ["numero", "nro", "numero_factura", "nro_factura", "serie", "comprobante"],
  // Finanzas
  ingreso:          ["ingreso", "ingresos", "entrada", "cobro", "total"],
  egreso:           ["egreso", "egresos", "salida", "pago", "gasto"],
  saldo:            ["saldo", "saldo_pendiente", "balance", "total"],
  // Personal
  nombres:          ["nombres", "nombre", "nombre_completo", "razon_social"],
  apellidos:        ["apellidos", "apellido", "apellido_paterno"],
  sueldo:           ["sueldo", "salario", "remuneracion", "neto"],
};

// ═══════════════════════════════════════════════════════════
// PUNTO 1 — Cadenas de fallback entre tablas relacionadas
// Orden = prioridad de búsqueda
// ═══════════════════════════════════════════════════════════
const CADENAS_FALLBACK = {
  // ES → fallback en orden de prioridad (ES + EN + variantes)
  ventas:      ["ventas", "sales", "orders", "facturas", "invoices", "factura_detalle"],
  sales:       ["sales", "ventas", "orders"],
  orders:      ["orders", "ventas", "sales"],
  facturas:    ["facturas", "invoices", "ventas", "sales"],
  invoices:    ["invoices", "facturas", "ventas"],
  clientes:    ["clientes", "customers", "users", "usuarios", "contactos"],
  customers:   ["customers", "clientes", "users"],
  users:       ["users", "usuarios", "clientes", "customers"],
  usuarios:    ["usuarios", "users", "clientes"],
  proveedores: ["proveedores", "suppliers", "vendors", "providers"],
  suppliers:   ["suppliers", "proveedores", "vendors"],
  productos:   ["productos", "products", "items", "articulos", "inventory", "inventario"],
  products:    ["products", "productos", "items"],
  items:       ["items", "productos", "products", "articulos"],
  inventory:   ["inventory", "inventario", "productos", "stock"],
  compras:     ["compras", "purchases", "ordenes_compra"],
  purchases:   ["purchases", "compras"],
  pagos:       ["pagos", "payments", "caja"],
  payments:    ["payments", "pagos"],
  caja:        ["caja", "cash", "tesoreria"],
  gastos:      ["gastos", "expenses", "caja"],
  expenses:    ["expenses", "gastos"],
  inventario:  ["inventario", "inventory", "productos", "kardex", "stock"],
  stock:       ["stock", "inventario", "productos", "inventory"],
  kardex:      ["kardex", "productos", "inventario"],
  empleados:   ["empleados", "employees", "personal", "planillas"],
  employees:   ["employees", "empleados", "personal"],
  planillas:   ["planillas", "payroll", "empleados"],
  asientos:    ["asientos", "movimientos", "cuentas_contables", "ledger"],
};

// Relaciones entre tablas (para construir JOINs automáticos)
const RELACIONES = {
  facturas:       [{ col: "cliente_id",   ref: "clientes",    refCol: "id" }],
  ventas:         [{ col: "cliente_id",   ref: "clientes",    refCol: "id" }],
  compras:        [{ col: "proveedor_id", ref: "proveedores", refCol: "id" }],
  factura_items:  [{ col: "factura_id",   ref: "facturas",    refCol: "id" },
                   { col: "producto_id",  ref: "productos",   refCol: "id" }],
  factura_detalle:[{ col: "factura_id",   ref: "facturas",    refCol: "id" },
                   { col: "producto_id",  ref: "productos",   refCol: "id" }],
  compra_detalle: [{ col: "compra_id",    ref: "compras",     refCol: "id" },
                   { col: "producto_id",  ref: "productos",   refCol: "id" }],
  pagos:          [{ col: "factura_id",   ref: "facturas",    refCol: "id" }],
  kardex:         [{ col: "producto_id",  ref: "productos",   refCol: "id" }],
  planillas:      [{ col: "empleado_id",  ref: "empleados",   refCol: "id" }],
  asiento_detalle:[{ col: "asiento_id",   ref: "asientos",    refCol: "id" },
                   { col: "cuenta_id",    ref: "cuentas_contables", refCol: "id" }],
};

// ═══════════════════════════════════════════════════════════
// PUNTO 4 — Detección automática de columnas equivalentes
// ═══════════════════════════════════════════════════════════

/** Dada una tabla y un concepto (ej. "ruc"), busca la columna real */
async function resolverColumna(tabla, concepto) {
  const schema = await schemaCache.get();
  const tbl = schema[tabla];
  if (!tbl) return null;
  const colNames = tbl.columnas.map(c => c.nombre);
  // Exacto primero
  if (colNames.includes(concepto)) return concepto;
  // Por sinónimos del concepto
  const sinonimos = SINONIMOS_COLUMNA[concepto] || [concepto];
  for (const s of sinonimos) {
    if (colNames.includes(s)) return s;
  }
  // Búsqueda inversa: ¿alguna columna de la tabla tiene sinónimos que coincidan con el concepto?
  for (const col of colNames) {
    const syns = SINONIMOS_COLUMNA[col] || [];
    if (syns.includes(concepto)) return col;
  }
  return null;
}

/** Resuelve varios conceptos en una tabla, devuelve mapa concepto→columnaReal */
async function resolverColumnas(tabla, conceptos) {
  const mapa = {};
  for (const c of conceptos) {
    const col = await resolverColumna(tabla, c);
    if (col) mapa[c] = col;
  }
  return mapa;
}

/** Dada una lista de tablas preferidas, devuelve la primera que exista en el esquema */
async function resolverTabla(candidatos) {
  const schema = await schemaCache.get();
  for (const t of candidatos) {
    if (schema[t]) return t;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// PUNTO 5 — Estrategia completa de consulta con fallback
// ═══════════════════════════════════════════════════════════

/**
 * Ejecuta un SQL. Si falla o devuelve 0 filas, intenta con tablas relacionadas.
 * Nunca devuelve "no encontrado" sin haber revisado todas las alternativas.
 *
 * @param {string} sql          SQL principal
 * @param {Array}  params       Parámetros del SQL
 * @param {string} tablaPrincipal  Tabla principal de la consulta
 * @param {object} regla        Regla de negocio (para contexto)
 * @returns {{ rows, usedTable, intentos }}
 */
async function ejecutarConFallback(sql, params, tablaPrincipal, regla) {
  const intentos = [];

  // Intento 1: SQL original
  try {
    const r = await db.query(sql, params);
    if (r.rows.length > 0) {
      return { rows: r.rows, usedTable: tablaPrincipal, intentos };
    }
    intentos.push({ tabla: tablaPrincipal, filas: 0, ok: true });
  } catch (e) {
    intentos.push({ tabla: tablaPrincipal, error: e.message, ok: false });
    // Si el error es de columna/tabla inexistente, intentar fallback
    if (!/(column|relation).*does not exist/i.test(e.message)) throw e;
  }

  // Intento 2: Tablas equivalentes de la cadena de fallback
  const cadena = CADENAS_FALLBACK[tablaPrincipal] || [];
  for (const tablaAlt of cadena) {
    if (tablaAlt === tablaPrincipal) continue;
    const schema = await schemaCache.get();
    if (!schema[tablaAlt]) continue;

    // Adaptar SQL: reemplazar nombre de tabla principal por la alternativa
    let sqlAlt = sql.replace(new RegExp(`\\b${tablaPrincipal}\\b`, "g"), tablaAlt);

    // Resolver columnas necesarias en la tabla alternativa
    if (regla?.columnas_requeridas) {
      for (const col of regla.columnas_requeridas) {
        const colReal = await resolverColumna(tablaAlt, col);
        if (colReal && colReal !== col) {
          sqlAlt = sqlAlt.replace(new RegExp(`\\b${col}\\b`, "g"), colReal);
        }
      }
    }

    try {
      const r = await db.query(sqlAlt, params);
      if (r.rows.length > 0) {
        intentos.push({ tabla: tablaAlt, filas: r.rows.length, ok: true, sqlUsado: sqlAlt });
        return { rows: r.rows, usedTable: tablaAlt, intentos, sqlUsado: sqlAlt };
      }
      intentos.push({ tabla: tablaAlt, filas: 0, ok: true });
    } catch (e) {
      intentos.push({ tabla: tablaAlt, error: e.message, ok: false });
    }
  }

  // Si llegamos aquí, no se encontraron datos en ninguna tabla
  return { rows: [], usedTable: tablaPrincipal, intentos };
}

// ═══════════════════════════════════════════════════════════
// Integración con Ollama (opcional)
// ═══════════════════════════════════════════════════════════

/**
 * Si Ollama está activo, usa el LLM para resolver qué columnas y tablas
 * corresponden a la pregunta del usuario, basándose en el esquema real.
 * Si Ollama no está activo, usa el diccionario de sinónimos.
 */
async function resolverConOllama(pregunta, schemaResumen, aiService) {
  if (!aiService) return null;
  try {
    const status = aiService.getStatus?.();
    if (!status || !status.enabled || status.provider !== "ollama") return null;

    const prompt = `Eres un experto en SQL. Dado este esquema de base de datos:
${JSON.stringify(schemaResumen, null, 2)}

Y esta pregunta del usuario: "${pregunta}"

Identifica:
1. Qué tabla(s) contienen la información solicitada
2. Qué columnas corresponden a los conceptos mencionados

Responde SOLO con JSON en este formato:
{"tablas": ["tabla1"], "columnas": {"concepto": "columna_real"}, "razon": "breve explicación"}`;

    let respuesta = "";
    await aiService.chatStream(
      [{ role: "system", content: "Responde siempre en JSON válido, sin texto adicional." },
       { role: "user",   content: prompt }],
      (tok) => { respuesta += tok; }
    );
    const json = JSON.parse(respuesta.match(/\{[\s\S]+\}/)?.[0] || "{}");
    return json;
  } catch (e) {
    console.warn("schemaResolver.Ollama:", e.message);
    return null;
  }
}

/** Genera un resumen del esquema para pasárselo a Ollama (compacto) */
async function generarResumenEsquema() {
  const schema = await schemaCache.get();
  const resumen = {};
  for (const [tabla, info] of Object.entries(schema)) {
    // Solo tablas con datos relevantes
    const cols = info.columnas.map(c => c.nombre);
    if (cols.length > 2) resumen[tabla] = cols;
  }
  return resumen;
}

/**
 * Función principal: resuelve tabla + columnas para una pregunta.
 * Combina sinónimos + esquema real + Ollama si disponible.
 */
async function resolver(concepto, tablasPrioridad, aiService) {
  const tablaReal = await resolverTabla(tablasPrioridad);
  if (!tablaReal) return { tabla: tablasPrioridad[0], columnas: {} };

  const schema = await schemaCache.get();
  const colsReales = schema[tablaReal]?.columnas.map(c => c.nombre) || [];

  // Sinónimos base
  const columnas = {};
  for (const [k, syns] of Object.entries(SINONIMOS_COLUMNA)) {
    for (const s of syns) {
      if (colsReales.includes(s)) { columnas[k] = s; break; }
    }
  }

  return { tabla: tablaReal, columnas, colsReales };
}

module.exports = {
  resolverColumna,
  resolverColumnas,
  resolverTabla,
  ejecutarConFallback,
  resolverConOllama,
  generarResumenEsquema,
  resolver,
  SINONIMOS_COLUMNA,
  CADENAS_FALLBACK,
  RELACIONES,
};
