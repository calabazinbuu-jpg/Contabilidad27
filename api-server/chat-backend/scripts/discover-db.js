// ─────────────────────────────────────────────────────────────────
//  discover-db.js — Descubridor profundo de tu base de datos (v19)
//
//  Niveles:
//    1.  Esquema       → tablas, columnas, tipos
//    2.  Relaciones    → FOREIGN KEYs
//    3.  Contenido     → muestras de filas reales
//    4.  Catálogo      → estructura compacta + tipo (maestra/transaccional/detalle)
//    5.  Índices       → pg_indexes
//    6.  Vistas        → information_schema.views
//    7.  Comentarios   → pg_description
//    8.  Estadísticas  → pg_stat_user_tables
//    9.  Grafo         → mapa de adyacencia para JOINs
//    10. Hash          → schema_hash.json (evita re-discover si nada cambió)
//    11. Entidades     → inferencia semántica (persona/empresa/documento…)
//    12. Patrones      → query_patterns.json (plantillas de SQL exitosas)
//    13. Reglas SQL    → SQL_GENERATION_RULES.md
//
//  Uso:
//     node scripts/discover-db.js              (smart: solo si cambió el hash)
//     node scripts/discover-db.js --force      (regenera siempre)
//     node scripts/discover-db.js --no-sample
//     node scripts/discover-db.js --rows=5
//     node scripts/discover-db.js --hash-only  (solo calcula hash, no escribe)
// ─────────────────────────────────────────────────────────────────
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const businessEntities = require("../services/businessEntities.service");


const args = process.argv.slice(2);
const NO_SAMPLE = args.includes("--no-sample");
const FORCE = args.includes("--force");
const HASH_ONLY = args.includes("--hash-only");
const ROWS = (() => {
  const a = args.find((x) => x.startsWith("--rows="));
  return a ? Math.max(0, parseInt(a.split("=")[1], 10) || 0) : 3;
})();

const KNOW_DIR = path.join(__dirname, "..", "knowledge");
if (!fs.existsSync(KNOW_DIR)) fs.mkdirSync(KNOW_DIR, { recursive: true });

function crearPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return new Pool({
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
}

// ── Queries ──────────────────────────────────────────────────────
const Q_COLUMNAS = `
  SELECT table_name, column_name, data_type, ordinal_position,
         is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
   WHERE table_schema = 'public'
   ORDER BY table_name, ordinal_position`;

const Q_RELACIONES = `
  SELECT
    tc.table_name        AS tabla_origen,
    kcu.column_name      AS columna_origen,
    ccu.table_name       AS tabla_destino,
    ccu.column_name      AS columna_destino,
    tc.constraint_name   AS constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  ORDER BY tc.table_name`;

const Q_PKS = `
  SELECT kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
   WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`;

const Q_INDEXES = `
  SELECT tablename, indexname, indexdef
    FROM pg_indexes
   WHERE schemaname = 'public'
   ORDER BY tablename, indexname`;

const Q_VIEWS = `
  SELECT table_name, view_definition
    FROM information_schema.views
   WHERE table_schema = 'public'
   ORDER BY table_name`;

const Q_COMMENTS = `
  SELECT
    c.relname AS tabla,
    a.attname AS columna,
    d.description
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_description d
    ON d.objoid = c.oid AND d.objsubid = a.attnum
  WHERE c.relkind = 'r' AND n.nspname = 'public'
  ORDER BY c.relname, a.attnum`;

const Q_TABLE_COMMENTS = `
  SELECT c.relname AS tabla, obj_description(c.oid, 'pg_class') AS description
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r' AND n.nspname = 'public'`;

const Q_STATS = `
  SELECT relname AS tabla,
         n_live_tup AS registros,
         n_dead_tup AS muertos,
         seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
    FROM pg_stat_user_tables
   ORDER BY n_live_tup DESC NULLS LAST`;

// ── Helpers de clasificación ─────────────────────────────────────
const NOMBRES_MAESTRA = [
  "clientes","customers","proveedores","suppliers","vendors","providers",
  "productos","products","items","articulos","inventory","servicios",
  "empleados","employees","personal","usuarios","users","empresas","companies",
  "categorias","categories","sucursales","branches","almacenes","warehouses",
  "monedas","currencies","unidades","units","impuestos","taxes","bancos","banks",
  "tipos_documento","tipos_pago","roles","permisos","permissions"
];
const NOMBRES_TRANSACCIONAL = [
  "ventas","sales","facturas","invoices","compras","purchases","pedidos","orders",
  "pagos","payments","cobros","ingresos","egresos","movimientos","transacciones",
  "kardex","asientos","comprobantes","recibos","notas","devoluciones"
];

function clasificarTabla(tabla, info) {
  const n = tabla.toLowerCase();
  // Detalle (line items): nombre con _detalle/_items/_lineas o termina en _detalle
  if (/_(detalle|detalles|items|lineas|line|lines)$/i.test(n) ||
      /^detalle_/i.test(n) ||
      (Object.keys(info.relaciones || {}).length >= 2 && /detalle|item|linea/i.test(n))) {
    return "detalle";
  }
  if (NOMBRES_TRANSACCIONAL.some((k) => n === k || n.startsWith(k + "_") || n.endsWith("_" + k))) {
    return "transaccional";
  }
  if (NOMBRES_MAESTRA.some((k) => n === k || n.startsWith(k + "_") || n.endsWith("_" + k))) {
    return "maestra";
  }
  // Heurística: tiene FKs hacia otras tablas + columna fecha => transaccional
  const cols = (info.columnas || []).map((c) => c.nombre.toLowerCase());
  const tieneFecha = cols.some((c) => /fecha|date|created_at|emitid/.test(c));
  const numFks = Object.keys(info.relaciones || {}).length;
  if (numFks >= 2 && tieneFecha) return "transaccional";
  if (numFks === 0) return "maestra";
  return "auxiliar";
}

function inferirEntidad(tabla, info) {
  const cols = (info.columnas || []).map((c) => c.nombre.toLowerCase());
  const has = (...n) => n.some((x) => cols.includes(x));
  const any = (re) => cols.some((c) => re.test(c));
  const entidades = [];
  if (has("nombre","razon_social","apellido","apellidos") || any(/^nombre/) ) entidades.push("persona_o_empresa");
  if (has("documento","ruc","dni","nit","cuit","rfc","tax_id")) entidades.push("documento_identidad");
  if (has("email","correo")) entidades.push("contacto_email");
  if (has("telefono","celular","phone","mobile")) entidades.push("contacto_telefono");
  if (has("direccion","address","ubicacion","ciudad","city","pais","country")) entidades.push("ubicacion");
  if (has("precio","price","monto","total","subtotal","importe")) entidades.push("monetario");
  if (any(/fecha|date|created_at|updated_at/)) entidades.push("temporal");
  if (has("stock","cantidad","quantity","existencia")) entidades.push("inventario");
  if (has("estado","status","activo","active")) entidades.push("estado");
  return entidades;
}

// ── Hash de esquema ──────────────────────────────────────────────
function calcularHashEsquema(cols, rels) {
  const norm = {
    cols: cols.map((r) => ({
      t: r.table_name, c: r.column_name, d: r.data_type, p: r.ordinal_position,
    })),
    rels: rels.map((r) => ({
      o: r.tabla_origen, oc: r.columna_origen, d: r.tabla_destino, dc: r.columna_destino,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

function leerHashAnterior() {
  const f = path.join(KNOW_DIR, "schema_hash.json");
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}

// ── Patrones de SQL exitosos (semilla) ───────────────────────────
function generarPatronesSemilla(catalogo, relations) {
  const has = (t) => !!catalogo[t];
  const patterns = [];

  const tieneRel = (a, b) =>
    relations.find(
      (r) =>
        (r.origen.tabla === a && r.destino.tabla === b) ||
        (r.origen.tabla === b && r.destino.tabla === a)
    );

  if (has("compras") && has("proveedores") && tieneRel("compras","proveedores")) {
    const j = tieneRel("compras","proveedores").join;
    patterns.push({
      id: "compras_por_proveedor",
      pregunta_ejemplo: "Muéstrame las compras del proveedor ABC",
      sql: `SELECT c.* FROM compras c JOIN proveedores p ON ${j} WHERE p.nombre ILIKE '%ABC%' ORDER BY c.fecha DESC`,
      tablas: ["compras","proveedores"],
    });
  }
  if (has("facturas") && has("clientes") && tieneRel("facturas","clientes")) {
    const j = tieneRel("facturas","clientes").join;
    patterns.push({
      id: "facturas_por_cliente",
      pregunta_ejemplo: "Facturas del cliente X",
      sql: `SELECT f.* FROM facturas f JOIN clientes c ON ${j} WHERE c.nombre ILIKE '%X%' ORDER BY f.fecha DESC`,
      tablas: ["facturas","clientes"],
    });
  }
  if (has("compra_detalle") && has("productos") && tieneRel("compra_detalle","productos")) {
    const j = tieneRel("compra_detalle","productos").join;
    patterns.push({
      id: "productos_mas_comprados",
      pregunta_ejemplo: "Productos más comprados",
      sql: `SELECT p.nombre, SUM(d.cantidad) AS total FROM compra_detalle d JOIN productos p ON ${j} GROUP BY p.nombre ORDER BY total DESC LIMIT 20`,
      tablas: ["compra_detalle","productos"],
    });
  }
  if (has("ventas")) {
    patterns.push({
      id: "ventas_por_mes",
      pregunta_ejemplo: "Ventas por mes",
      sql: `SELECT DATE_TRUNC('month', fecha) AS mes, COUNT(*) AS n, SUM(total) AS total FROM ventas GROUP BY 1 ORDER BY 1 DESC`,
      tablas: ["ventas"],
    });
  }
  return patterns;
}

// ── Reglas SQL para la IA ────────────────────────────────────────
const REGLAS_MD = `# Reglas de Generación de SQL (obligatorias)

La IA debe seguir este orden estricto al construir cualquier consulta SQL:

1. **Consultar \`db_catalog.json\`** → confirmar que la tabla y columnas existen.
2. **Consultar \`db_relations.json\`** → usar el JOIN ya armado (\`origen.col = destino.col\`).
3. **Consultar \`db_samples.json\`** → entender el formato real de los valores (ej. nombre = "ABC SAC", documento = "20123456789").
4. **Consultar \`db_graph.json\`** → si necesita más de un JOIN, navegar el grafo de relaciones.
5. **Construir el JOIN** respetando dirección de la FK.
6. **Generar el SQL final**.
7. **Validar columnas** contra \`db_catalog.json\` antes de ejecutar.

## Prohibido

- ❌ Inventar tablas que no estén en \`db_catalog.json\`.
- ❌ Inventar columnas que no estén en \`db_catalog.json\`.
- ❌ Inventar relaciones que no estén en \`db_relations.json\`.
- ❌ Buscar entidades maestras (clientes/proveedores/productos) directamente en una tabla transaccional. Ej.: NO buscar "proveedor ABC" solo en \`compras\` — primero ir a \`proveedores\` y luego hacer JOIN.

## Tipos de tabla

- **maestra**: catálogo (clientes, proveedores, productos, empleados…). Filtrar por nombre/documento aquí.
- **transaccional**: operaciones (ventas, compras, facturas, pagos…). Filtrar por fecha, JOIN con maestras.
- **detalle**: líneas de una transacción (\`*_detalle\`, \`*_items\`). Siempre JOIN con su transaccional padre.
- **auxiliar**: tablas técnicas o secundarias.

## Patrones probados

Revisar primero \`query_patterns.json\` — si la pregunta del usuario coincide con un patrón, usar ese SQL como base.
`;

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("🔌 Conectando a PostgreSQL...");
  const pool = crearPool();
  try {
    await pool.query("SELECT 1");
    console.log("✅ Conexión OK\n");
  } catch (e) {
    console.error("❌ No pude conectar a la base de datos:", e.message);
    process.exit(1);
  }

  // Hash primero — para decidir si re-generar
  console.log("🔐 Calculando hash de esquema...");
  const cols = (await pool.query(Q_COLUMNAS)).rows;
  const rels = (await pool.query(Q_RELACIONES)).rows;
  const hash = calcularHashEsquema(cols, rels);
  const prev = leerHashAnterior();

  if (HASH_ONLY) {
    console.log("hash:", hash);
    await pool.end();
    return;
  }

  if (!FORCE && prev && prev.hash === hash && fs.existsSync(path.join(KNOW_DIR, "db_catalog.json"))) {
    console.log(`✅ Esquema sin cambios (hash ${hash.slice(0,12)}…). Reutilizando knowledge/ existente.`);
    console.log("   Usa --force para regenerar igualmente.");
    fs.writeFileSync(
      path.join(KNOW_DIR, "schema_hash.json"),
      JSON.stringify({ hash, verificado_en: new Date().toISOString(), cambios: false }, null, 2)
    );
    await pool.end();
    return;
  }

  if (prev && prev.hash !== hash) {
    console.log(`🔄 Esquema cambió (${prev.hash.slice(0,8)} → ${hash.slice(0,8)}). Regenerando todo.`);
  } else {
    console.log(`🆕 Primer descubrimiento o --force. Generando todo.`);
  }

  // Resto de queries
  const pks = (await pool.query(Q_PKS)).rows;
  console.log("📇 Índices..."); const indexes = (await pool.query(Q_INDEXES)).rows;
  console.log("👁️  Vistas..."); const views = (await pool.query(Q_VIEWS)).rows;
  console.log("💬 Comentarios...");
  const tableComments = (await pool.query(Q_TABLE_COMMENTS)).rows;
  const colComments = (await pool.query(Q_COMMENTS)).rows;
  console.log("📊 Estadísticas...");
  let stats = [];
  try { stats = (await pool.query(Q_STATS)).rows; } catch (e) {
    console.warn("   ⚠️  pg_stat_user_tables no disponible:", e.message);
  }

  // Armar estructura
  const tablas = {};
  for (const r of cols) {
    (tablas[r.table_name] ||= {
      columnas: [], pk: [], relaciones: {}, referenciada_por: {},
      indices: [], comentario: null, comentarios_columnas: {},
    });
    tablas[r.table_name].columnas.push({
      nombre: r.column_name, tipo: r.data_type,
      nullable: r.is_nullable === "YES",
      default: r.column_default, longitud: r.character_maximum_length,
    });
  }
  for (const r of pks) if (tablas[r.table_name]) tablas[r.table_name].pk.push(r.column_name);
  for (const r of rels) {
    const expr = `${r.tabla_origen}.${r.columna_origen} = ${r.tabla_destino}.${r.columna_destino}`;
    if (tablas[r.tabla_origen]) tablas[r.tabla_origen].relaciones[r.columna_origen] = expr;
    if (tablas[r.tabla_destino]) tablas[r.tabla_destino].referenciada_por[r.tabla_origen] = expr;
  }
  for (const r of indexes) if (tablas[r.tablename])
    tablas[r.tablename].indices.push({ nombre: r.indexname, def: r.indexdef });
  for (const r of tableComments)
    if (tablas[r.tabla] && r.description) tablas[r.tabla].comentario = r.description;
  for (const r of colComments)
    if (tablas[r.tabla] && r.columna && r.description)
      tablas[r.tabla].comentarios_columnas[r.columna] = r.description;

  const nombresTabla = Object.keys(tablas).sort();
  console.log(`\n📋 Tablas: ${nombresTabla.length}  |  🔗 FK: ${rels.length}  |  📇 Idx: ${indexes.length}  |  👁️  Vistas: ${views.length}\n`);

  // Conteo + muestras
  console.log("📥 Leyendo muestras y conteos...");
  const vacias = [], conDatos = [], samples = {};
  for (const t of nombresTabla) {
    let count = 0;
    try {
      count = parseInt((await pool.query(`SELECT COUNT(*)::int AS c FROM "${t}"`)).rows[0].c, 10);
    } catch (e) { tablas[t].error_conteo = e.message; }
    tablas[t].filas = count;
    if (count === 0) vacias.push(t); else conDatos.push({ tabla: t, filas: count });
    if (!NO_SAMPLE && ROWS > 0 && count > 0) {
      try {
        const rows = (await pool.query(`SELECT * FROM "${t}" LIMIT ${ROWS}`)).rows;
        tablas[t].muestra = rows; samples[t] = rows;
      } catch (e) { tablas[t].muestra_error = e.message; }
    }
  }

  // Catálogo + clasificación + entidades
  const catalogo = {};
  for (const t of nombresTabla) {
    const tipo = clasificarTabla(t, tablas[t]);
    const entidades = inferirEntidad(t, tablas[t]);
    catalogo[t] = {
      tipo,
      entidades,
      columnas: tablas[t].columnas.map((c) => c.nombre),
      tipos: Object.fromEntries(tablas[t].columnas.map((c) => [c.nombre, c.tipo])),
      pk: tablas[t].pk,
      relaciones: tablas[t].relaciones,
      referenciada_por: tablas[t].referenciada_por,
      tiene_empresa_id: tablas[t].columnas.some((c) =>
        ["empresa_id","empresaid","tenant_id","id_empresa"].includes(c.nombre)
      ),
      filas: tablas[t].filas,
      comentario: tablas[t].comentario || null,
    };
  }

  // Relaciones normalizadas
  const relations = rels.map((r) => ({
    origen: { tabla: r.tabla_origen, columna: r.columna_origen },
    destino: { tabla: r.tabla_destino, columna: r.columna_destino },
    constraint: r.constraint_name,
    join: `${r.tabla_origen}.${r.columna_origen} = ${r.tabla_destino}.${r.columna_destino}`,
  }));

  // Grafo de adyacencia (no dirigido — útil para path-finding de JOINs)
  const graph = {};
  for (const t of nombresTabla) graph[t] = [];
  for (const r of relations) {
    if (!graph[r.origen.tabla].includes(r.destino.tabla)) graph[r.origen.tabla].push(r.destino.tabla);
    if (!graph[r.destino.tabla].includes(r.origen.tabla)) graph[r.destino.tabla].push(r.origen.tabla);
  }

  // Tablas por tipo (índice rápido)
  const porTipo = { maestra: [], transaccional: [], detalle: [], auxiliar: [] };
  for (const [t, info] of Object.entries(catalogo)) porTipo[info.tipo]?.push(t);

  // Capa de NEGOCIO: clasificación automática de tablas → entidades canónicas
  // (supplier, customer, product, invoice, payment, inventory, employee, ...)
  const businessFull = {};
  const businessSimple = {};
  for (const [t, info] of Object.entries(catalogo)) {
    const c = businessEntities.clasificarTabla(t, info);
    if (!c) continue;
    if (!businessFull[c.entidad]) { businessFull[c.entidad] = { tipo: c.tipo, tablas: [], detalle: [] }; businessSimple[c.entidad] = []; }
    businessFull[c.entidad].detalle.push({ tabla: t, confidence: c.confidence, motivo: c.motivo });
  }
  for (const e of Object.keys(businessFull)) {
    businessFull[e].detalle.sort((a, b) => b.confidence - a.confidence);
    businessFull[e].tablas = businessFull[e].detalle.map((d) => d.tabla);
    businessSimple[e] = businessFull[e].tablas;
  }


  // Patrones semilla
  const patterns = generarPatronesSemilla(catalogo, relations);

  // Indices por tabla / vistas / comentarios / stats
  const indexesByTable = {};
  for (const r of indexes)
    (indexesByTable[r.tablename] ||= []).push({ nombre: r.indexname, def: r.indexdef });
  const viewsObj = {};
  for (const v of views) viewsObj[v.table_name] = v.view_definition;
  const commentsObj = {};
  for (const t of nombresTabla)
    commentsObj[t] = { tabla: tablas[t].comentario || null, columnas: tablas[t].comentarios_columnas };
  const statsObj = stats.map((s) => ({
    tabla: s.tabla,
    registros: parseInt(s.registros || 0, 10),
    seq_scan: parseInt(s.seq_scan || 0, 10),
    idx_scan: parseInt(s.idx_scan || 0, 10),
    inserts: parseInt(s.n_tup_ins || 0, 10),
    updates: parseInt(s.n_tup_upd || 0, 10),
    deletes: parseInt(s.n_tup_del || 0, 10),
  }));

  const informe = {
    generado_en: new Date().toISOString(),
    base_datos: process.env.PGDATABASE || "(DATABASE_URL)",
    schema_hash: hash,
    resumen: {
      tablas: nombresTabla.length,
      relaciones: rels.length,
      indices: indexes.length,
      vistas: views.length,
      tablas_vacias: vacias.length,
      tablas_con_datos: conDatos.length,
      maestras: porTipo.maestra.length,
      transaccionales: porTipo.transaccional.length,
      detalle: porTipo.detalle.length,
    },
    tipos: porTipo,
    tablas_vacias: vacias,
    tablas,
    vistas: viewsObj,
    estadisticas: statsObj,
  };

  const write = (name, data) =>
    fs.writeFileSync(path.join(KNOW_DIR, name), JSON.stringify(data, null, 2));

  write("db_discovery.json", informe);
  write("db_catalog.json", catalogo);
  write("db_relations.json", relations);
  write("db_graph.json", graph);
  write("db_indexes.json", indexesByTable);
  write("db_views.json", viewsObj);
  write("db_samples.json", samples);
  write("db_comments.json", commentsObj);
  write("db_stats.json", statsObj);
  write("db_types.json", porTipo);
  write("business_entities.json", businessSimple);
  write("business_entities_full.json", businessFull);

  // query_patterns.json: NO sobreescribir si el usuario ya añadió patrones manuales
  const qpFile = path.join(KNOW_DIR, "query_patterns.json");
  if (!fs.existsSync(qpFile)) write("query_patterns.json", patterns);
  else {
    try {
      const existing = JSON.parse(fs.readFileSync(qpFile, "utf8"));
      const ids = new Set(existing.map((p) => p.id));
      const merged = existing.concat(patterns.filter((p) => !ids.has(p.id)));
      write("query_patterns.json", merged);
    } catch { write("query_patterns.json", patterns); }
  }
  fs.writeFileSync(path.join(KNOW_DIR, "SQL_GENERATION_RULES.md"), REGLAS_MD);
  fs.writeFileSync(
    path.join(KNOW_DIR, "schema_hash.json"),
    JSON.stringify({ hash, generado_en: new Date().toISOString(), cambios: !!(prev && prev.hash !== hash) }, null, 2)
  );
  fs.writeFileSync(
    path.join(KNOW_DIR, "DB_REPORT.md"),
    generarMarkdown(informe, tablas, nombresTabla, viewsObj, statsObj, porTipo)
  );

  // Resumen
  console.log("─".repeat(60));
  console.log(`🏷️  Maestras: ${porTipo.maestra.length}  |  Transaccionales: ${porTipo.transaccional.length}  |  Detalle: ${porTipo.detalle.length}`);
  conDatos.sort((a, b) => b.filas - a.filas);
  console.log("\n✅ Tablas CON datos (top 10):");
  for (const d of conDatos.slice(0, 10)) console.log(`   • ${d.tabla.padEnd(28)} ${d.filas} filas`);
  if (vacias.length) console.log(`\n⚠️  ${vacias.length} tablas vacías`);
  console.log("\n📁 knowledge/ actualizado.");
  await pool.end();
}

function generarMarkdown(informe, tablas, nombres, viewsObj, statsObj, porTipo) {
  const L = [];
  L.push(`# Informe de Base de Datos — ${informe.base_datos}`);
  L.push(`\nGenerado: ${informe.generado_en}`);
  L.push(`Hash: \`${informe.schema_hash}\`\n`);
  L.push(`## Resumen`);
  L.push(`- Tablas: **${informe.resumen.tablas}** (maestras: ${informe.resumen.maestras}, transaccionales: ${informe.resumen.transaccionales}, detalle: ${informe.resumen.detalle})`);
  L.push(`- Relaciones (FK): **${informe.resumen.relaciones}**`);
  L.push(`- Índices: **${informe.resumen.indices}**  |  Vistas: **${informe.resumen.vistas}**`);
  L.push(`- Tablas con datos: **${informe.resumen.tablas_con_datos}**  |  vacías: **${informe.resumen.tablas_vacias}**\n`);

  L.push(`## Clasificación`);
  for (const tipo of ["maestra","transaccional","detalle","auxiliar"]) {
    if (porTipo[tipo]?.length) {
      L.push(`\n**${tipo}** (${porTipo[tipo].length}): ${porTipo[tipo].map((t) => "`" + t + "`").join(", ")}`);
    }
  }
  L.push("");

  if (statsObj.length) {
    L.push(`## 🔥 Tablas más usadas`);
    for (const s of statsObj.slice(0, 15))
      L.push(`- \`${s.tabla}\` — ${s.registros} filas (idx_scan: ${s.idx_scan}, seq_scan: ${s.seq_scan})`);
    L.push("");
  }

  L.push(`## Detalle por tabla`);
  for (const t of nombres) {
    const tb = tablas[t];
    L.push(`\n### ${t}  (${tb.filas} filas)`);
    if (tb.comentario) L.push(`> ${tb.comentario}`);
    L.push(`**Columnas:**`);
    L.push(tb.columnas.map((c) => {
      const cm = tb.comentarios_columnas[c.nombre];
      return `- \`${c.nombre}\` — ${c.tipo}${cm ? "  _(" + cm + ")_" : ""}`;
    }).join("\n"));
    const rel = Object.values(tb.relaciones);
    if (rel.length) { L.push(`\n**Relaciones (FK):**`); L.push(rel.map((r) => `- ${r}`).join("\n")); }
    const refBy = Object.values(tb.referenciada_por);
    if (refBy.length) { L.push(`\n**Referenciada por:**`); L.push(refBy.map((r) => `- ${r}`).join("\n")); }
    if (tb.indices?.length) { L.push(`\n**Índices:**`); L.push(tb.indices.map((i) => `- \`${i.nombre}\``).join("\n")); }
  }

  if (Object.keys(viewsObj).length) {
    L.push(`\n## Vistas`);
    for (const [name, def] of Object.entries(viewsObj)) {
      L.push(`\n### ${name}`);
      L.push("```sql\n" + (def || "").trim() + "\n```");
    }
  }
  return L.join("\n") + "\n";
}

main().catch((e) => { console.error("❌ Error inesperado:", e); process.exit(1); });
