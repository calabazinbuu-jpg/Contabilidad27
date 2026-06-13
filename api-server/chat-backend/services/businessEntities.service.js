// ─────────────────────────────────────────────────────────────────
//  businessEntities.service.js
//
//  Capa de NEGOCIO independiente de los nombres concretos de tablas.
//
//  Objetivo: que la IA piense en términos de negocio
//     supplier · customer · product · invoice · payment ·
//     inventory · employee · purchase · account · ...
//  y NO en nombres concretos de tablas. Así, aunque mañana cambies
//  a otra BD con 500 tablas y nombres totalmente distintos, la IA
//  seguirá encontrando la información correcta.
//
//  Produce y consume `business_entities.json`, que se genera
//  AUTOMÁTICAMENTE a partir de:
//     · nombres de tablas
//     · nombres de columnas
//     · relaciones (FOREIGN KEY)
//     · muestras de datos
//
//  Ejemplo de salida:
//  {
//    "supplier":  { "tablas": ["proveedores","suppliers"], "tipo":"master_data" },
//    "customer":  { "tablas": ["clientes","customers"],     "tipo":"master_data" },
//    "product":   { "tablas": ["productos","items"],        "tipo":"master_data" },
//    "invoice":   { "tablas": ["facturas","invoices"],      "tipo":"transactional" },
//    "payment":   { "tablas": ["pagos","payments"],         "tipo":"transactional" }
//  }
// ─────────────────────────────────────────────────────────────────
const schemaCatalog = require("./schemaCatalog.service");

// ═══════════════════════════════════════════════════════════
//  1) ENTIDADES DE NEGOCIO CANÓNICAS
//     Cada entidad declara:
//       · tipo       → master_data | transactional | line_item | aux
//       · keywords   → nombres de tabla equivalentes (ES + EN + variantes)
//       · columnas   → columnas típicas que delatan la entidad (señales)
// ═══════════════════════════════════════════════════════════
const ENTIDADES = {
  supplier: {
    tipo: "master_data",
    keywords: ["proveedor", "proveedores", "supplier", "suppliers", "vendor", "vendors", "abastecedor", "provider", "providers"],
    columnas: ["proveedor_id", "ruc_proveedor", "razon_social", "nombre_proveedor"],
  },
  customer: {
    tipo: "master_data",
    keywords: ["cliente", "clientes", "customer", "customers", "buyer", "buyers", "comprador", "contacto", "contactos"],
    columnas: ["cliente_id", "ruc", "razon_social", "nombre_cliente", "dni"],
  },
  product: {
    tipo: "master_data",
    keywords: ["producto", "productos", "product", "products", "item", "items", "articulo", "articulos", "article", "articles", "sku", "mercaderia"],
    columnas: ["producto_id", "sku", "codigo", "precio", "precio_venta", "categoria"],
  },
  employee: {
    tipo: "master_data",
    keywords: ["empleado", "empleados", "employee", "employees", "personal", "trabajador", "trabajadores", "staff", "colaborador", "colaboradores"],
    columnas: ["empleado_id", "sueldo", "salario", "cargo", "apellidos", "fecha_ingreso"],
  },
  account: {
    tipo: "master_data",
    keywords: ["cuenta", "cuentas", "account", "accounts", "cuentas_contables", "plan_cuentas", "ledger_accounts"],
    columnas: ["cuenta_id", "codigo_cuenta", "naturaleza", "saldo"],
  },
  invoice: {
    tipo: "transactional",
    keywords: ["factura", "facturas", "invoice", "invoices", "comprobante", "comprobantes", "venta", "ventas", "sale", "sales", "boleta", "boletas"],
    columnas: ["factura_id", "cliente_id", "total", "fecha_emision", "numero", "serie"],
  },
  purchase: {
    tipo: "transactional",
    keywords: ["compra", "compras", "purchase", "purchases", "orden_compra", "ordenes_compra", "po"],
    columnas: ["compra_id", "proveedor_id", "total", "fecha_compra"],
  },
  payment: {
    tipo: "transactional",
    keywords: ["pago", "pagos", "payment", "payments", "cobro", "cobros", "abono", "abonos", "recibo", "recibos"],
    columnas: ["pago_id", "factura_id", "monto", "fecha_pago", "medio_pago"],
  },
  inventory: {
    tipo: "transactional",
    keywords: ["inventario", "inventory", "stock", "kardex", "existencias", "almacen", "almacenes", "warehouse", "movimiento_stock"],
    columnas: ["producto_id", "cantidad", "stock", "existencia", "almacen_id"],
  },
  order: {
    tipo: "transactional",
    keywords: ["pedido", "pedidos", "order", "orders", "cotizacion", "cotizaciones", "quote", "quotes"],
    columnas: ["pedido_id", "cliente_id", "total", "fecha_pedido"],
  },
  expense: {
    tipo: "transactional",
    keywords: ["gasto", "gastos", "expense", "expenses", "egreso", "egresos"],
    columnas: ["gasto_id", "monto", "fecha", "categoria"],
  },
  journal: {
    tipo: "transactional",
    keywords: ["asiento", "asientos", "journal", "journals", "movimiento", "movimientos", "asiento_contable"],
    columnas: ["asiento_id", "cuenta_id", "debe", "haber", "fecha"],
  },
};

// ═══════════════════════════════════════════════════════════
//  2) DICCIONARIO DE SINÓNIMOS DE NEGOCIO  (término humano → entidad)
//     Permite que la IA traduzca lo que escribe el usuario
//     (en cualquier idioma/variante) a la entidad canónica.
// ═══════════════════════════════════════════════════════════
const SINONIMOS_NEGOCIO = {
  proveedor:   "supplier",
  proveedores: "supplier",
  abastecedor: "supplier",
  vendor:      "supplier",
  supplier:    "supplier",

  cliente:   "customer",
  clientes:  "customer",
  comprador: "customer",
  buyer:     "customer",
  customer:  "customer",

  producto:  "product",
  productos: "product",
  articulo:  "product",
  item:      "product",
  sku:       "product",
  product:   "product",

  empleado:    "employee",
  empleados:   "employee",
  trabajador:  "employee",
  personal:    "employee",
  colaborador: "employee",
  employee:    "employee",

  factura:     "invoice",
  facturas:    "invoice",
  comprobante: "invoice",
  venta:       "invoice",
  ventas:      "invoice",
  boleta:      "invoice",
  invoice:     "invoice",

  compra:   "purchase",
  compras:  "purchase",
  purchase: "purchase",

  pago:     "payment",
  pagos:    "payment",
  cobro:    "payment",
  abono:    "payment",
  payment:  "payment",

  inventario: "inventory",
  stock:      "inventory",
  kardex:     "inventory",
  existencia: "inventory",
  almacen:    "inventory",
  inventory:  "inventory",

  pedido:     "order",
  pedidos:    "order",
  cotizacion: "order",
  order:      "order",

  gasto:    "expense",
  gastos:   "expense",
  egreso:   "expense",
  expense:  "expense",

  cuenta:   "account",
  cuentas:  "account",
  account:  "account",

  asiento:  "journal",
  asientos: "journal",
  journal:  "journal",
};

// ─── normaliza texto (minúsculas, sin acentos) ───────────────────
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ═══════════════════════════════════════════════════════════
//  3) CLASIFICADOR — asigna una tabla real a una entidad de negocio
//     con una PUNTUACIÓN DE CONFIANZA y los motivos.
// ═══════════════════════════════════════════════════════════
/**
 * Clasifica una tabla en una entidad de negocio.
 * @returns {{ entidad, tipo, confidence, motivo[] } | null}
 */
function clasificarTabla(tabla, meta) {
  const n = norm(tabla);
  const cols = (meta?.columnas || []).map(norm);
  let mejor = null;

  for (const [entidad, def] of Object.entries(ENTIDADES)) {
    let score = 0;
    const motivo = [];

    // Coincidencia por nombre de tabla
    if (def.keywords.includes(n)) {
      score += 0.6;
      motivo.push(`nombre de tabla coincide con '${entidad}'`);
    } else if (def.keywords.some((k) => n.includes(norm(k)) || norm(k).includes(n))) {
      score += 0.35;
      motivo.push(`nombre de tabla similar a '${entidad}'`);
    }

    // Coincidencia por columnas señal
    const hits = def.columnas.filter((c) => cols.includes(norm(c)));
    if (hits.length) {
      score += Math.min(0.4, hits.length * 0.15);
      motivo.push(`columnas señal: ${hits.join(", ")}`);
    }

    if (score > 0 && (!mejor || score > mejor.confidence)) {
      mejor = { entidad, tipo: def.tipo, confidence: Math.min(1, Number(score.toFixed(2))), motivo };
    }
  }
  return mejor;
}

// ═══════════════════════════════════════════════════════════
//  4) CONSTRUIR business_entities.json desde el catálogo real
// ═══════════════════════════════════════════════════════════
/**
 * Recorre el catálogo en memoria y agrupa las tablas por entidad.
 * @returns objeto business_entities (también disponible "simple": entidad→[tablas])
 */
async function construir({ refrescar = false } = {}) {
  const catalogo = await schemaCatalog.get({ refrescar });
  const out = {};
  const simple = {};

  for (const [tabla, meta] of Object.entries(catalogo || {})) {
    const c = clasificarTabla(tabla, meta);
    if (!c) continue;
    if (!out[c.entidad]) {
      out[c.entidad] = { tipo: c.tipo, tablas: [], detalle: [] };
      simple[c.entidad] = [];
    }
    out[c.entidad].tablas.push(tabla);
    out[c.entidad].detalle.push({ tabla, confidence: c.confidence, motivo: c.motivo });
  }

  // Ordenar cada entidad por confianza (la mejor tabla primero)
  for (const e of Object.values(out)) {
    e.detalle.sort((a, b) => b.confidence - a.confidence);
    e.tablas = e.detalle.map((d) => d.tabla);
  }
  for (const e of Object.keys(out)) simple[e] = out[e].tablas;

  CACHE = { full: out, simple, generadoEn: Date.now() };
  return CACHE;
}

let CACHE = { full: {}, simple: {}, generadoEn: 0 };

async function get({ refrescar = false } = {}) {
  if (refrescar || !CACHE.generadoEn) await construir({ refrescar });
  return CACHE;
}

// ═══════════════════════════════════════════════════════════
//  5) RESOLUCIÓN — de término de negocio a tabla(s) reales
// ═══════════════════════════════════════════════════════════
/**
 * Dado un término del usuario ("proveedores", "supplier", "vendor"…),
 * devuelve la entidad canónica + tablas reales + confianza.
 * @returns {{ entidad, tipo, tablas[], confidence, motivo[] }}
 */
function resolverEntidad(termino) {
  const t = norm(termino);
  // Singularización ingenua para términos plurales del usuario
  const variantes = new Set([t, t.replace(/es$/, ""), t.replace(/s$/, "")]);

  let entidad = null;
  for (const v of variantes) {
    if (SINONIMOS_NEGOCIO[v]) { entidad = SINONIMOS_NEGOCIO[v]; break; }
  }

  if (!entidad) {
    // Búsqueda directa en keywords de cada entidad
    for (const [ent, def] of Object.entries(ENTIDADES)) {
      if (def.keywords.some((k) => variantes.has(norm(k)))) { entidad = ent; break; }
    }
  }

  if (!entidad) {
    return { entidad: null, tipo: null, tablas: [], confidence: 0, motivo: ["término no reconocido como entidad de negocio"] };
  }

  const def = ENTIDADES[entidad];
  const tablas = (CACHE.full[entidad]?.tablas) || [];
  const confidence = tablas.length ? Math.min(1, 0.5 + 0.5 * (CACHE.full[entidad]?.detalle?.[0]?.confidence || 0.4)) : 0.2;
  const motivo = [
    `término '${termino}' → entidad '${entidad}'`,
    tablas.length ? `tablas reales: ${tablas.join(", ")}` : "sin tabla real asociada en esta BD",
  ];
  return { entidad, tipo: def.tipo, tablas, confidence: Number(confidence.toFixed(2)), motivo };
}

/** Lista de entidades canónicas soportadas (para prompts del LLM). */
function entidadesSoportadas() {
  return Object.keys(ENTIDADES);
}

function resumen() {
  const ents = Object.keys(CACHE.full);
  let tablas = 0;
  for (const e of ents) tablas += CACHE.full[e].tablas.length;
  return { entidades: ents.length, tablas_mapeadas: tablas, generadoEn: CACHE.generadoEn };
}

module.exports = {
  construir,
  get,
  resolverEntidad,
  clasificarTabla,
  entidadesSoportadas,
  resumen,
  ENTIDADES,
  SINONIMOS_NEGOCIO,
};
