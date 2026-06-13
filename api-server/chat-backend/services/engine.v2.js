// =============================================================
//  engine.v2.js — v8.1 PERFECT
//  Cambios vs v8.0:
//   + Conversacional rápido ("que dia es hoy", "que hora es", "que clima")
//   + Detector de filtros NUMÉRICOS (stock<10, deuda>0, precio>=50)
//   + Detector de columna por palabra clave (stock, precio, costo, saldo, deuda)
//   + Detector de "creados/registrados [este mes|hoy|este año]" → created_at
//   + Query splitter ("proveedores y clientes juntos")
//   + Fix SUM-heuristic agresivo (solo SUM si hay palabra de suma)
//   + Detección IGV / utilidad / margen reforzada
//   + Ordering DESC por fecha o id (no por col 1)
//   + Devuelve fallback estructurado si tabla sin score
// =============================================================
const db = require("../config/db");
const textNumbers = require("./textNumbers.service");
let analytics = null;
try { analytics = require("./v8/analytics.engine"); } catch (_) {}

// ── 1) DICCIONARIO ───────────────────────────────────────────
const schema = {
  facturas: { table:"facturas", fechaCol:"fecha", totalCol:"total", igvCol:"impuesto", priority:10,
    strong:["factura","facturas","comprobante","comprobantes","boleta","boletas"], weak:[],
    contextHints:["serie","numero","emitida","emitir"] },
  pagos:    { table:"pagos", fechaCol:"fecha", totalCol:"monto", priority:7,
    strong:["pago","pagos"], weak:["cobro","cobros","abono"], contextHints:["metodo","transferencia","efectivo"] },
  ventas:   { table:"ventas", fechaCol:"fecha", totalCol:"total", priority:6,
    strong:["venta","ventas","vendi","vendido","vendimos","vendidos"], weak:["ingreso","ingresos","facturado"],
    contextHints:["cliente","vendedor"] },
  compras:  { table:"compras", fechaCol:"fecha", totalCol:"total", priority:6,
    strong:["compra","compras","compre","comprado"], weak:["egreso","egresos","desembolso"],
    contextHints:["proveedor","orden de compra"] },
  clientes: { table:"clientes", totalCol:"saldo", priority:8,
    strong:["cliente","clientes"], weak:["comprador","compradores"], contextHints:["ruc","telefono","correo"] },
  proveedores:{table:"proveedores", totalCol:"saldo", priority:10,
    strong:["proveedor","proveedores","supplier","abastecedor","suplidor","suplidores","proevedor","proevedores"],
    weak:[], contextHints:["ruc","razon social"] },
  productos:{ table:"productos", totalCol:"stock", priority:7,
    strong:["producto","productos","sku"], weak:["item","items","articulo","articulos","mercaderia"],
    contextHints:["precio","costo","categoria"] },
  movimientos_inventario:{ table:"movimientos_inventario", fechaCol:"fecha", totalCol:"cantidad", priority:8,
    strong:["inventario","kardex"], weak:["stock","existencia","existencias","almacen"],
    contextHints:["entrada","salida","ajuste","movimiento"] },
  cuentas_bancarias:{ table:"cuentas_bancarias", totalCol:"saldo", priority:9,
    strong:["cuenta bancaria","cuentas bancarias"], weak:["banco","bancos"], contextHints:["saldo","moneda"] },
  movimientos_tesoreria:{ table:"movimientos_tesoreria", fechaCol:"fecha", totalCol:"monto", priority:8,
    strong:["tesoreria","movimientos de caja","flujo de caja"], weak:["caja","flujo","efectivo"],
    contextHints:["ingreso","egreso","transferencia"] },
};

const MIN_CONFIDENCE = 3;

const sinonimos = {
  "ingresos":"ventas","ganancias":"utilidad","ganancia":"utilidad",
  "iva":"igv","mas vendidos":"top_ventas","mas vendido":"top_ventas",
};

const metricas = {
  igv:{keywords:["igv","iva","impuesto","impuestos"],table:"facturas",column:"impuesto",label:"IGV"},
  utilidad:{keywords:["utilidad","ganancia","ganancias","rentabilidad","beneficio","profit"],compuesta:true,label:"Utilidad"},
  margen:{keywords:["margen"],compuesta:"margen",label:"Margen %"},
  ticket:{keywords:["ticket promedio","ticket medio"],table:"facturas",column:"total",op:"AVG",label:"Ticket promedio"},
};

const INTENCIONES = { SELECT:"SELECT", COUNT:"COUNT", SUM:"SUM", FILTER:"FILTER", JOIN:"JOIN" };

function normalizar(s){
  let t=(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[¿?¡!.,;:]/g," ").replace(/\s+/g," ").trim();
  for (const [k,v] of Object.entries(sinonimos)) t=t.replace(new RegExp(`\\b${k}\\b`,"g"),v);
  // typo fixes
  t = t.replace(/\bvntas\b/g,"ventas").replace(/\bproevedores?\b/g,"proveedores");
  return t;
}
function contienePalabra(t,f){ if(f.includes(" ")) return t.includes(f); return new RegExp(`\\b${f}\\b`).test(t); }

function resolverUnidadTemporal(pregunta) {
  const t = normalizar(pregunta);
  const n = textNumbers.detectarLimite(t, 120) || textNumbers.detectarOrdinal(t);
  const unidad = /\b(dia|dias)\b/.test(t) ? "dias"
    : /\b(semana|semanas)\b/.test(t) ? "semanas"
    : /\b(mes|meses)\b/.test(t) ? "meses"
    : /\b(ano|anos|año|años)\b/.test(t) ? "anos"
    : null;
  if (!n || !unidad) return null;
  return { n, unidad };
}

// ── CONVERSACIONAL (no toca DB) ──────────────────────────────
function respConversacional(pregunta){
  const t = normalizar(pregunta);
  if (/\b(que (dia|fecha) es( hoy)?|fecha de hoy|dime la fecha|cual es la fecha)\b/.test(t)){
    const hoy=new Date();
    const dias=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    const meses=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `📅 Hoy es ${dias[hoy.getDay()]}, ${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}.`;
  }
  if (/\b(que hora es|hora actual|dime la hora)\b/.test(t)){
    return `🕐 Son las ${new Date().toLocaleTimeString("es-PE")}.`;
  }
  if (/\b(que clima|clima de hoy|tiempo de hoy|temperatura)\b/.test(t)){
    return `🌦️ No tengo acceso a datos meteorológicos en tiempo real, pero puedo ayudarte con todos tus datos del ERP (ventas, clientes, inventario, etc.).`;
  }
  return null;
}

// ── DETECTOR DE TABLA con SCORING ────────────────────────────
function detectarTabla(pregunta, opciones = {}) {
  const t = normalizar(pregunta);
  const op = opciones.operacion || null;
  const metricaKey = opciones.metricaKey || null;
  const ranking = [];
  for (const key of Object.keys(schema)) {
    const def = schema[key]; let score = 0;
    for (const w of def.strong || []) if (contienePalabra(t, w)) score += 3;
    for (const w of def.weak   || []) if (contienePalabra(t, w)) score += 1;
    for (const w of def.contextHints || []) if (contienePalabra(t, w)) score += 2;
    if (metricaKey && metricas[metricaKey]?.table === def.table) score += 4;
    if (op === "SUM" && (def.totalCol === "total" || def.totalCol === "monto" || def.totalCol === "impuesto") && score>0) score += 1;
    if (score > 0) ranking.push({ key, def, score, priority: def.priority || 1 });
  }
  if (!ranking.length) return null;
  ranking.sort((a,b)=>(b.score-a.score)||(b.priority-a.priority));
  return { key:ranking[0].key, ...ranking[0].def, score:ranking[0].score, candidatos:ranking.slice(0,3).map(r=>r.def.table) };
}

// ── DETECTOR DE OPERACIÓN ────────────────────────────────────
function detectarOperacion(pregunta){
  const t = normalizar(pregunta);
  if (/\b(cuantos|cuantas|numero de|cantidad de)\b/.test(t)) return INTENCIONES.COUNT;
  // SUM solo si hay palabra clave explícita de suma
  if (/\b(total|suma|sumatoria|monto total|importe total|cuanto (vend|compr|gast|gan|pag|cobr)|cuanto es)\b/.test(t)) return INTENCIONES.SUM;
  if (/\b(lista|listar|mostrar|muestrame|muéstrame|dame|ver|enseña|enseñame|qué hay en)\b/.test(t)) return INTENCIONES.SELECT;
  return INTENCIONES.SELECT;
}

// ── DETECTOR DE LÍMITE EXPLÍCITO ─────────────────────────────
// Parsea el número exacto que el usuario pidió.
// "dame 5 proveedores" → 5
// "top 10 clientes"    → 10
// "primeros 3 pedidos" → 3
// "3 facturas de hoy"  → 3
// Si no se especifica → null (el caller usa su default)
function detectarLimite(pregunta){
  return textNumbers.detectarLimite(pregunta, 500);
}

// ── FECHAS ───────────────────────────────────────────────────
const MESES = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
function finDeMes(y,m){ return new Date(y,m,0).getDate(); }
function fmt(y,m,d){ return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function detectarFecha(pregunta){
  const t = normalizar(pregunta);
  const hoy = new Date(); const yA = hoy.getFullYear();
  const rel = resolverUnidadTemporal(pregunta);
  if (rel && /\b(ultim|ultimo|ultimos|ultima|ultimas|pasad|pasados|pasadas)\b/.test(t)) {
    const ini = new Date(hoy);
    if (rel.unidad === "dias") ini.setDate(ini.getDate() - rel.n);
    if (rel.unidad === "semanas") ini.setDate(ini.getDate() - rel.n * 7);
    if (rel.unidad === "meses") ini.setMonth(ini.getMonth() - rel.n);
    if (rel.unidad === "anos") ini.setFullYear(ini.getFullYear() - rel.n);
    return { inicio: fmt(ini.getFullYear(), ini.getMonth()+1, ini.getDate()), fin: fmt(yA, hoy.getMonth()+1, hoy.getDate()), etiqueta: `ultimos_${rel.n}_${rel.unidad}` };
  }
  if (/\bhoy\b/.test(t)){ const m=hoy.getMonth()+1,d=hoy.getDate(); return {inicio:fmt(yA,m,d),fin:fmt(yA,m,d),etiqueta:"hoy"}; }
  if (/\bayer\b/.test(t)){ const a=new Date(hoy); a.setDate(a.getDate()-1); return {inicio:fmt(a.getFullYear(),a.getMonth()+1,a.getDate()),fin:fmt(a.getFullYear(),a.getMonth()+1,a.getDate()),etiqueta:"ayer"}; }
  if (/\b(este mes|mes actual|del mes)\b/.test(t)){ const m=hoy.getMonth()+1; return {inicio:fmt(yA,m,1),fin:fmt(yA,m,finDeMes(yA,m)),etiqueta:"mes_actual"}; }
  if (/\b(mes pasado|mes anterior|ultimo mes|último mes)\b/.test(t)){ const a=new Date(yA,hoy.getMonth()-1,1); const y=a.getFullYear(),m=a.getMonth()+1; return {inicio:fmt(y,m,1),fin:fmt(y,m,finDeMes(y,m)),etiqueta:"mes_pasado"}; }
  if (/\b(ano pasado|año pasado|ano anterior)\b/.test(t)) return {inicio:fmt(yA-1,1,1),fin:fmt(yA-1,12,31),etiqueta:`ano_${yA-1}`};
  if (/\b(este ano|este año|ano actual|anual)\b/.test(t)) return {inicio:fmt(yA,1,1),fin:fmt(yA,12,31),etiqueta:`ano_${yA}`};
  for (const [n,i] of Object.entries(MESES)){
    if (new RegExp(`\\b${n}\\b`).test(t)){ const ya=t.match(/\b(20\d{2})\b/); const y=ya?+ya[1]:yA; return {inicio:fmt(y,i,1),fin:fmt(y,i,finDeMes(y,i)),etiqueta:`${n}_${y}`}; }
  }
  const ya=t.match(/\b(20\d{2})\b/); if (ya) return {inicio:fmt(+ya[1],1,1),fin:fmt(+ya[1],12,31),etiqueta:`ano_${ya[1]}`};
  return null;
}

// ── MÉTRICA ──────────────────────────────────────────────────
function detectarMetrica(pregunta){
  const t = normalizar(pregunta);
  for (const k of Object.keys(metricas))
    if (metricas[k].keywords.some(w=>contienePalabra(t,w))) return {key:k,...metricas[k]};
  return null;
}

// ── DETECTOR ESTADO FACTURA ("pendientes", "pagadas", "vencidas") ─
function detectarEstadoFactura(pregunta) {
  const t = normalizar(pregunta);
  if (/\b(pendiente[s]?|por\s+cobrar|sin\s+pagar|no\s+pagada[s]?|impaga[s]?)\b/.test(t))
    return { col:"pagada", op:"=", val:"false", label:"pendientes" };
  if (/\b(pagada[s]?|cobrada[s]?|cancelada[s]?|liquidada[s]?)\b/.test(t))
    return { col:"pagada", op:"=", val:"true", label:"pagadas" };
  if (/\b(vencida[s]?|mora|atrasada[s]?|expirada[s]?|caducada[s]?)\b/.test(t))
    return { col:"vencida", op:"=", val:"true", label:"vencidas" };
  return null;
}

// ── FILTRO NUMÉRICO (stock<10, precio>=50, deuda>0) ──────────
const COLS_NUMERICAS = ["stock","precio","costo","saldo","deuda","cantidad","total","monto","impuesto"];
function detectarFiltroNumerico(pregunta){
  const t = normalizar(pregunta);
  // limpiar ruido: "0ooo" → "0"
  const limpio = t.replace(/(\d)[oO]+\b/g,"$1");
  // patrón: <col> <op> <num>
  for (const col of COLS_NUMERICAS){
    if (!contienePalabra(limpio,col)) continue;
    // mayor/menor/igual
    const re = new RegExp(`${col}[^0-9]*?(mayor( o igual)? a|mayor que|menor( o igual)? a|menor que|igual a|=|>=|<=|>|<)\\s*(\\d+(?:\\.\\d+)?)`);
    const m = limpio.match(re);
    if (m){
      const opTxt = m[1]; const val = parseFloat(m[5]);
      let op = ">";
      if (/menor o igual|<=/.test(opTxt)) op="<=";
      else if (/menor/.test(opTxt) || /^</.test(opTxt)) op="<";
      else if (/mayor o igual|>=/.test(opTxt)) op=">=";
      else if (/mayor|^>/.test(opTxt)) op=">";
      else if (/igual|=/.test(opTxt)) op="=";
      return { col, op, val };
    }
    // "sin stock" / "sin saldo"
    if (new RegExp(`\\bsin ${col}\\b`).test(limpio)) return { col, op:"=", val:0 };
  }
  return null;
}

// ── "creados este mes" → fecha sobre created_at ──────────────
function detectarFechaCreacion(pregunta){
  const t = normalizar(pregunta);
  if (/\b(creados?|registrados?|nuevos?|agregados?)\b/.test(t)){
    return detectarFecha(pregunta) || (function(){
      const h=new Date(); const m=h.getMonth()+1; const y=h.getFullYear();
      return {inicio:fmt(y,m,1),fin:fmt(y,m,finDeMes(y,m)),etiqueta:"mes_actual"};
    })();
  }
  return null;
}

// ── SQL ──────────────────────────────────────────────────────
const LIMITE_DEFAULT = 20; // cuántos traer cuando el usuario no especifica
const LIMITE_MAX     = 500;

function generarSQL({tabla,operacion,fecha,campo="*",fechaCol="fecha",filtroNum,fechaCreacion,orderCol,limite,extraWhere}){
  const where = [];
  if (fecha && fechaCol) where.push(`${fechaCol} BETWEEN '${fecha.inicio}' AND '${fecha.fin}'`);
  if (fechaCreacion) where.push(`created_at::date BETWEEN '${fechaCreacion.inicio}' AND '${fechaCreacion.fin}'`);
  if (filtroNum) where.push(`${filtroNum.col} ${filtroNum.op} ${filtroNum.val}`);
  if (extraWhere) where.push(extraWhere);
  let sql;
  if (operacion === INTENCIONES.SUM) sql = `SELECT COALESCE(SUM(${campo}),0)::numeric AS total FROM ${tabla}`;
  else if (operacion === INTENCIONES.COUNT) sql = `SELECT COUNT(*)::int AS total FROM ${tabla}`;
  else sql = `SELECT * FROM ${tabla}`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  if (operacion === INTENCIONES.SELECT) {
    const lim = Math.min(limite || LIMITE_DEFAULT, LIMITE_MAX);
    sql += ` ORDER BY ${orderCol || "id"} DESC LIMIT ${lim}`;
  }
  return sql;
}

function dinero(n){ return Number(n||0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function rangoLabel(f){ return f ? ` (${f.etiqueta} · ${f.inicio} → ${f.fin})` : ""; }

// ── EJECUTAR UNA SOLA "SUBPREGUNTA" ──────────────────────────
async function ejecutarUna(pregunta){
  const operacion = detectarOperacion(pregunta);
  const fecha     = detectarFecha(pregunta);
  const fechaCre  = detectarFechaCreacion(pregunta);
  const metrica   = detectarMetrica(pregunta);
  const filtroNum = detectarFiltroNumerico(pregunta);
  const limite    = detectarLimite(pregunta);   // ← número explícito del usuario (o null)
  const tabla     = detectarTabla(pregunta,{operacion,metricaKey:metrica?.key});

  console.log("════════ ENGINE v2 ════════");
  console.log("Q:",pregunta,"| op:",operacion,"| fecha:",fecha?.etiqueta,"| metrica:",metrica?.key,"| filtroNum:",filtroNum,"| limite:",limite,"| tabla:",tabla?.table);

  // UTILIDAD
  if (metrica && metrica.key === "utilidad"){
    const where = fecha ? ` WHERE fecha BETWEEN '${fecha.inicio}' AND '${fecha.fin}'` : "";
    try {
      const [rv,rc] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(total),0)::numeric AS v FROM ventas${where}`),
        db.query(`SELECT COALESCE(SUM(total),0)::numeric AS c FROM compras${where}`),
      ]);
      const v=+rv.rows[0].v, c=+rc.rows[0].c, u=v-c;
      return { agente:"engine.v2", intent:"utilidad", datos:{ventas:v,compras:c,utilidad:u},
        respuesta:`💰 Utilidad${rangoLabel(fecha)}\n• Ventas:  S/ ${dinero(v)}\n• Compras: S/ ${dinero(c)}\n• Utilidad: S/ ${dinero(u)}` };
    } catch(e){ return null; }
  }
  // IGV
  if (metrica && metrica.key === "igv"){
    const sql = `SELECT COALESCE(SUM(impuesto),0)::numeric AS total FROM facturas` + (fecha?` WHERE fecha BETWEEN '${fecha.inicio}' AND '${fecha.fin}'`:"");
    try { const r=await db.query(sql); return { agente:"engine.v2", intent:"igv", datos:{igv:+r.rows[0].total}, sql,
      respuesta:`🧾 IGV${rangoLabel(fecha)}: S/ ${dinero(r.rows[0].total)}` }; }
    catch(e){ return null; }
  }
  // MARGEN
  if (metrica && metrica.key === "margen"){
    const where = fecha?` WHERE fecha BETWEEN '${fecha.inicio}' AND '${fecha.fin}'`:"";
    try {
      const [rv,rc]=await Promise.all([db.query(`SELECT COALESCE(SUM(total),0)::numeric v FROM ventas${where}`),db.query(`SELECT COALESCE(SUM(total),0)::numeric c FROM compras${where}`)]);
      const v=+rv.rows[0].v,c=+rc.rows[0].c,m=v>0?((v-c)/v)*100:0;
      return { agente:"engine.v2", intent:"margen", datos:{margen_pct:m}, respuesta:`📈 Margen${rangoLabel(fecha)}: ${m.toFixed(2)}%` };
    } catch(e){ return null; }
  }

  if (!tabla) return { fallback:true, motivo:"sin_tabla" };
  if (tabla.score < MIN_CONFIDENCE && !filtroNum && !fechaCre) return { fallback:true, motivo:"baja_confianza" };

  let campo="*";
  if (operacion===INTENCIONES.SUM) campo = tabla.totalCol || "total";

  // orderCol: si la tabla tiene fechaCol → ORDER BY fechaCol DESC; si no → id DESC
  const orderCol = tabla.fechaCol || "id";

  // Filtro de estado para facturas: pendientes/pagadas/vencidas
  let extraWhere = null;
  let estadoLabel = null;
  if (tabla.table === "facturas") {
    const ef = detectarEstadoFactura(pregunta);
    if (ef) {
      estadoLabel = ef.label;
      if (ef.label === "pagadas")     extraWhere = "pagada = true";
      else if (ef.label === "pendientes") extraWhere = "pagada = false";
      else if (ef.label === "vencidas")   extraWhere = "pagada = false";
    }
  }

  const sql = generarSQL({tabla:tabla.table,operacion,fecha,campo,fechaCol:tabla.fechaCol,filtroNum,fechaCreacion:fechaCre,orderCol,limite,extraWhere});
  console.log("SQL:",sql,"| limite_explicito:",limite,"| estadoFactura:",estadoLabel);

  try {
    const r = await db.query(sql);
    if (operacion===INTENCIONES.SUM){
      const total=+r.rows[0].total;
      return { agente:"engine.v2", intent:"sum", datos:{total}, sql,
        respuesta:`📊 Total de ${tabla.table}${rangoLabel(fecha)}${filtroNum?` (${filtroNum.col} ${filtroNum.op} ${filtroNum.val})`:""}: S/ ${dinero(total)}` };
    }
    if (operacion===INTENCIONES.COUNT){
      const total=+r.rows[0].total;
      return { agente:"engine.v2", intent:"count", datos:{total}, sql,
        respuesta:`🔢 ${tabla.table}${rangoLabel(fecha)}${filtroNum?` (${filtroNum.col} ${filtroNum.op} ${filtroNum.val})`:""}: ${total} registros` };
    }
    const filas = r.rows;
    const tag = (fecha?` (${fecha.etiqueta} · ${fecha.inicio} → ${fecha.fin})`:"") + (fechaCre?` [creados ${fechaCre.etiqueta}]`:"") + (filtroNum?` [${filtroNum.col} ${filtroNum.op} ${filtroNum.val}]`:"") + (estadoLabel?` · ${estadoLabel}`:"");
    return { agente:"engine.v2", intent:"select", datos:filas, sql,
      respuesta: renderListado(tabla.table, filas, pregunta, tag, limite) };
  } catch(e){
    console.warn("engine.v2 SQL error:", e.message);
    // fallback: si el filtro/columna no existe, reintenta sin filtroNum
    if (filtroNum){
      try {
        const sql2 = generarSQL({tabla:tabla.table,operacion,fecha,campo,fechaCol:tabla.fechaCol,fechaCreacion:fechaCre,orderCol,limite});
        const r2 = await db.query(sql2);
        const filas = r2.rows;
        return { agente:"engine.v2", intent:"select", datos:filas, sql:sql2,
          respuesta:`⚠️ No pude aplicar el filtro \`${filtroNum.col} ${filtroNum.op} ${filtroNum.val}\`. Lista general:\n` + renderListado(tabla.table, filas, pregunta, "", limite) };
      } catch(_){}
    }
    return { fallback:true, motivo:"sql_error", error:e.message };
  }
}



// ── PROYECCIÓN / RENDER LISTADO (v11) ────────────────────────
function camposPedidos(pregunta){
  const t = normalizar(pregunta);
  const extra = [];
  if (/\bstock|inventario|existencia\b/.test(t))                       extra.push("stock");
  if (/\bprecio|valor de venta\b/.test(t))                              extra.push("precio");
  if (/\bcosto|costos\b/.test(t))                                       extra.push("costo");
  if (/\bcorreo|email|e-?mail|mail\b/.test(t))                          extra.push("correo");
  if (/\btelefono|tel[eé]fono|celular|whatsapp|wsp|m[oó]vil\b/.test(t)) extra.push("telefono");
  if (/\bruc|dni|documento\b/.test(t))                                  extra.push("ruc");
  if (/\bciudad|direcci[oó]n|ubicaci[oó]n\b/.test(t))                   extra.push("ciudad","direccion");
  if (/\bsaldo|deuda|debe\b/.test(t))                                   extra.push("saldo");
  if (/\bcategoria|categor[ií]a\b/.test(t))                             extra.push("categoria");
  return [...new Set(extra)];
}
function _fmtVal(col, v){
  if (["precio","costo","saldo","total","monto"].includes(col)) return `S/ ${dinero(v)}`;
  return v;
}
// limiteExplicito: número que el usuario pidió (null = sin especificar)
function renderListado(table, filas, pregunta, tag, limiteExplicito){
  if (!filas?.length) return `📭 Sin resultados en ${table}${tag||""}.`;

  // Si el usuario pidió N explícito, mostrar exactamente esos N (ya limitados por SQL).
  // Si no pidió, mostrar lo que llegó (máximo LIMITE_DEFAULT=20 del SQL).
  const muestra = filas; // SQL ya limitó — mostramos todo lo que llegó
  const extras  = camposPedidos(pregunta);
  const sample  = muestra[0] || {};
  const nameKey = ["nombre","razon_social","descripcion","titulo"].find(k => k in sample)
                || Object.keys(sample).find(k => k !== "id") || "id";

  const lineas = muestra.map((row, i) => {
    let base = `${i+1}. ${row[nameKey] ?? "(sin nombre)"}`;
    if (extras.length){
      const pares = extras.map(c => row[c] != null ? `${c}: ${_fmtVal(c,row[c])}` : null).filter(Boolean);
      if (pares.length) base += ` — ${pares.join(" · ")}`;
    }
    return base;
  });

  // Cabecera informativa
  const pedidos = limiteExplicito ? ` (pedidos: ${limiteExplicito})` : "";
  const head    = `📋 ${table}${tag||""}${pedidos} — ${muestra.length} resultado${muestra.length!==1?"s":""}:`;

  // Tip solo cuando no se pidió un límite explícito (usa el nombre de la entidad actual)
  const entidadAmigable = {
    facturas:"facturas", ventas:"ventas", compras:"compras", clientes:"clientes",
    proveedores:"proveedores", productos:"productos", pagos:"pagos",
    movimientos_inventario:"movimientos", cuentas_bancarias:"cuentas bancarias",
    movimientos_tesoreria:"movimientos de tesorería",
  }[table] || table;
  const tip = !limiteExplicito
    ? `\n💡 Tip: pide "dame 5 ${entidadAmigable}" para un número exacto, o "en excel" para descargar todo.`
    : (muestra.length < limiteExplicito
        ? `\n⚠️ Solo hay ${muestra.length} registros disponibles.`
        : "");

  return [head, ...lineas].join("\n") + (extras.length ? "" : tip);
}

function _quiereExcel(p){ return /\b(excel|xlsx|exportar|export[aá]me|descargar|descarga|hoja de calculo|hoja de cálculo)\b/i.test(p||""); }

// ── QUERY SPLITTER: "proveedores y clientes" / "ventas y compras de mayo" ──
function dividirPregunta(pregunta){
  const t = normalizar(pregunta);
  // detectar dos tablas distintas en la misma frase
  const presentes = [];
  for (const [key,def] of Object.entries(schema)){
    for (const w of def.strong){
      if (contienePalabra(t,w)) { presentes.push(key); break; }
    }
  }
  const unicas = [...new Set(presentes)];
  if (unicas.length < 2) return null;
  // construye subpreguntas conservando fecha/filtros
  const resto = t.replace(/\b(y|junto a|junto|con|mas|más|reporte de|reporte)\b/g," ").trim();
  // toma rango de fecha de la frase original y lo añade a cada sub
  const ctx = (pregunta.match(/(este mes|mes pasado|este año|hoy|ayer|\b20\d{2}\b|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i) || [""])[0];
  return unicas.map(k => `${schema[k].strong[1] || schema[k].strong[0]} ${ctx}`.trim());
}

// ── FLUJO PRINCIPAL ──────────────────────────────────────────
async function responder(pregunta){
  // 0) Si pide Excel → no respondemos aquí; smart.agent generará el archivo
  if (_quiereExcel(pregunta)) return { fallback:true, motivo:"excel" };
  // 0) Conversacional rápido
  const conv = respConversacional(pregunta);
  if (conv) return { agente:"engine.v2", intent:"conversacional", datos:null, respuesta:conv };

  // 0.5) ANALYTICS v8 — patrones analíticos con SQL agregado correcto
  if (analytics) {
    try {
      const a = await analytics.resolver(pregunta);
      if (a) return a;
    } catch (e) { console.warn("analytics error:", e.message); }
  }

  // 1) Query splitter
  const subs = dividirPregunta(pregunta);
  if (subs && subs.length>=2){
    const results = [];
    for (const s of subs){
      const r = await ejecutarUna(s);
      if (r && !r.fallback) results.push(r);
    }
    if (results.length){
      const respuesta = "📦 Reporte combinado:\n\n" + results.map(r=>`▸ ${r.respuesta}`).join("\n\n");
      return { agente:"engine.v2", intent:"multi", datos:results.map(r=>r.datos), respuesta };
    }
  }

  // 2) Pregunta única
  return await ejecutarUna(pregunta);
}

module.exports = { responder, ejecutarUna, detectarTabla, detectarOperacion, detectarFecha };
