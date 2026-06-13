// =============================================================
//  Motor NLP OFFLINE v6 — Mucho más capaz
//  - Normaliza acentos / typos (Levenshtein)
//  - Diccionario amplio de sinónimos empresariales
//  - Detecta OPERACIÓN (contar, sumar, promediar, máx, mín, restar)
//  - Detecta ENTIDAD (facturas, ventas, clientes, productos, compras, pagos…)
//  - Detecta RANGO de fechas (hoy, ayer, "5 de enero", mes, "últimos N días")
//  - Detecta ARITMÉTICA pura ("cuánto es 250 + 30")
//  - Detecta SALUDO / IDENTIDAD / AYUDA / CHISTE / OFF-TOPIC
// =============================================================
const NOW = () => new Date();
const textNumbers = require("./textNumbers.service");

function normaliza(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1]===b[j-1]?0:1));
  return dp[m][n];
}

// ── Diccionarios ───────────────────────────────────────────────
const SINONIMOS = {
  ventas:      ["venta","ventas","vendi","vendido","vendimos","ingreso","ingresos","facturado","facturacion","colocacion","colocaciones"],
  compras:     ["compra","compras","compre","comprado","gasto","gastos","egreso","egresos","pagamos","desembolso"],
  inventario:  ["inventario","stock","existencia","existencias","almacen","mercaderia","articulo","articulos"],
  clientes:    ["cliente","clientes","comprador","compradores","consumidor","consumidores"],
  proveedores: ["proveedor","proveedores","suplidor","suplidores","abastecedor","abastecedores","supplier","suppliers","vendor","vendors"],
  facturas:    ["factura","facturas","comprobante","comprobantes","boleta","boletas","ticket","tickets","recibo","recibos"],
  productos:   ["producto","productos","item","items","articulo","articulos","sku"],
  pagos:       ["pago","pagos","cobro","cobros","recibo","recibos"],
  cobrar:      ["cobrar","deben","me deben","cuentas por cobrar","cxc","cartera","por cobrar"],
  pagar:       ["pagar","debo","cuentas por pagar","cxp","por pagar","les debo"],
  tesoreria:   ["tesoreria","caja","banco","bancos","efectivo","saldo","saldos","liquidez","flujo"],
  resumen:     ["resumen","panorama","situacion","ejecutivo","como vamos","como voy","como va","como esta","como estamos","reporte"],
  utilidad:    ["utilidad","ganancia","ganancias","margen","beneficio","rentabilidad","profit"],
  comparar:    ["compara","comparar","comparativo","vs","versus","contra","respecto","diferencia","diferenciar"],
  ranking_top: ["top","mejor","mejores","mas","mayor","mayores","grandes","estrella","estrellas"],
  ranking_low: ["menos","menor","menores","peor","peores","bajo","pequeño","pequenos","flojos"],
};

// Operaciones que el usuario pide
const OPERACIONES = {
  contar:    ["cuantas","cuantos","numero de","cantidad de","total de","count","conteo"],
  sumar:     ["cuanto","total","suma","sumatoria","monto","importe","facturado","vendido","ingresos","gasto","gastos"],
  promedio:  ["promedio","media","average","ticket promedio"],
  maximo:    ["maximo","mas alto","mayor","pico","tope","record"],
  minimo:    ["minimo","mas bajo","menor","piso"],
  listar:    ["lista","listar","mostrar","muestrame","dame","ver","enseña"],
};

// Mapeo entidad → posibles tablas (orden de preferencia)
const ENTIDAD_TABLA = {
  facturas:    ["facturas","factura","comprobantes","boletas","invoices"],
  ventas:      ["ventas","venta","sales"],
  compras:     ["compras","compra","purchases"],
  clientes:    ["clientes","cliente","customers"],
  proveedores: ["proveedores","proveedor","suppliers","vendors"],
  productos:   ["productos","producto","items","sku","articles"],
  pagos:       ["pagos","movimientos_tesoreria","cobros"],
  inventario:  ["movimientos_inventario","inventario","stock_movements"],
};

const TIEMPO = {
  hoy:        ["hoy","el dia de hoy"],
  ayer:       ["ayer"],
  semana:     ["esta semana","semana actual","semanal","ultima semana"],
  semana_pas: ["semana pasada","semana anterior"],
  mes:        ["este mes","del mes","mensual","mes actual"],
  mes_pasado: ["mes pasado","mes anterior","el mes pasado","ultimo mes"],
  ano:        ["este año","ano actual","anual","del año","del ano"],
  ano_pasado: ["año pasado","ano pasado","el año pasado","el ano pasado"],
};

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","setiembre","octubre","noviembre","diciembre"];

// ── Helpers ────────────────────────────────────────────────────
function contiene(texto, lista) {
  const t = ` ${texto} `;
  for (const w of lista) if (t.includes(` ${w} `)) return true;
  const words = texto.split(" ");
  for (const w of lista) {
    if (w.includes(" ") || w.length < 5) continue;
    for (const x of words) {
      if (x.length >= 4 && lev(x, w) <= Math.min(2, Math.floor(w.length / 4))) return true;
    }
  }
  return false;
}

function detectOperacion(t) {
  // 1) Match exacto por palabra: prioridad sumar/promedio/max/min antes que contar
  //    para que "cuanto vendi" no se confunda con "cuantos"
  const ordenExacto = ["sumar","promedio","maximo","minimo","contar","listar"];
  const words = new Set(t.split(" "));
  for (const op of ordenExacto) {
    for (const w of OPERACIONES[op]) {
      if (w.includes(" ")) { if ((" "+t+" ").includes(" "+w+" ")) return op; }
      else if (words.has(w)) return op;
    }
  }
  // 2) Fallback con fuzzy
  for (const op of ordenExacto) {
    if (contiene(t, OPERACIONES[op])) return op;
  }
  return null;
}

function detectEntidad(t) {
  // Prioriza facturas/boletas (más específico) antes que ventas
  const orden = ["facturas","proveedores","clientes","pagos","compras","ventas","productos","inventario"];
  for (const e of orden) if (contiene(t, SINONIMOS[e] || [])) return e;
  return null;
}

function detectRangoFecha(t) {
  // últimos N días
  const limiteTiempo = textNumbers.detectarLimite(t, 120);
  const ordinalTiempo = textNumbers.detectarOrdinal(t);
  const nTiempo = limiteTiempo || ordinalTiempo;
  if (nTiempo && /\b(ultim|ultimo|ultimos|ultima|ultimas|pasad|pasados|pasadas)\b/.test(t)) {
    if (/\bdias?\b/.test(t)) return { tipo:`ultimos_${nTiempo}_dias`, desde: addDays(NOW(),-nTiempo), hasta: NOW() };
    if (/\bsemanas?\b/.test(t)) return { tipo:`ultimas_${nTiempo}_semanas`, desde: addDays(NOW(),-nTiempo*7), hasta: NOW() };
    if (/\bmes(es)?\b/.test(t)) return { tipo:`ultimos_${nTiempo}_meses`, desde: addMonths(NOW(),-nTiempo), hasta: NOW() };
    if (/\b(años?|anos?)\b/.test(t)) return { tipo:`ultimos_${nTiempo}_anos`, desde: addMonths(NOW(),-nTiempo*12), hasta: NOW() };
  }
  const m = t.match(/ultimos? (\d+) dias?/);
  if (m) { const d=+m[1]; return { tipo:`ultimos_${d}_dias`, desde: addDays(NOW(),-d), hasta: NOW() }; }
  // "el 5 de enero" / "5 enero" / "5 enero 2026"
  const dm = t.match(/\b(\d{1,2}) (?:de )?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: (?:de )?(20\d{2}))?\b/);
  if (dm) {
    const dia = +dm[1]; const mes = MESES.indexOf(dm[2] === "setiembre" ? "septiembre" : dm[2]);
    const año = dm[3] ? +dm[3] : NOW().getFullYear();
    return rangoDia(new Date(año, mes, dia), `${dia}_${dm[2]}_${año}`);
  }
  if (contiene(t, TIEMPO.hoy))        return rangoDia(NOW(),"hoy");
  if (contiene(t, TIEMPO.ayer))       return rangoDia(addDays(NOW(),-1),"ayer");
  if (contiene(t, TIEMPO.mes_pasado)) return rangoMes(addMonths(NOW(),-1),"mes_pasado");
  if (contiene(t, TIEMPO.ano_pasado)) return rangoAno(NOW().getFullYear()-1,"ano_pasado");
  if (contiene(t, TIEMPO.semana_pas)) return rangoSemana(addDays(NOW(),-7),"semana_pasada");
  if (contiene(t, TIEMPO.mes))        return rangoMes(NOW(),"mes_actual");
  if (contiene(t, TIEMPO.semana))     return rangoSemana(NOW(),"semana_actual");
  if (contiene(t, TIEMPO.ano))        return rangoAno(NOW().getFullYear(),"ano_actual");
  // mes nombrado
  for (let i = 0; i < MESES.length; i++) {
    if (t.includes(MESES[i])) {
      const ya = t.match(/\b(20\d{2})\b/);
      const year = ya ? +ya[1] : NOW().getFullYear();
      const mIdx = MESES[i]==="setiembre"?8:i;
      return rangoMes(new Date(year, mIdx, 15), `${MESES[i]}_${year}`);
    }
  }
  const ya = t.match(/\b(20\d{2})\b/);
  if (ya) return rangoAno(+ya[1], `ano_${ya[1]}`);
  return null;
}

function rangoDia(d,tipo){ const x=new Date(d);x.setHours(0,0,0,0); const y=new Date(d);y.setHours(23,59,59,999); return {tipo,desde:x,hasta:y}; }
function rangoMes(d,tipo){ return { tipo, desde:new Date(d.getFullYear(),d.getMonth(),1), hasta:new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999) }; }
function rangoAno(y,tipo){ return { tipo, desde:new Date(y,0,1), hasta:new Date(y,11,31,23,59,59,999) }; }
function rangoSemana(d,tipo="semana"){ const x=new Date(d);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);x.setHours(0,0,0,0);const y=new Date(x);y.setDate(y.getDate()+6);y.setHours(23,59,59,999);return {tipo,desde:x,hasta:y}; }
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x;}

function detectLimite(t){
  return textNumbers.detectarLimite(t, 500) || 10;
}

// Aritmética pura
function detectAritmetica(t) {
  // "cuanto es 25 + 30", "suma 100 y 250", "200 - 50", "150 * 3"
  const m = t.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-x×*\/])\s*(-?\d+(?:[.,]\d+)?)/);
  if (m) {
    const a = parseFloat(m[1].replace(",","."));
    const b = parseFloat(m[3].replace(",","."));
    const op = m[2];
    let r; switch(op){case "+":r=a+b;break;case "-":r=a-b;break;case "/":r=a/b;break;default:r=a*b;}
    return { a, b, op, resultado: r };
  }
  // suma palabras: "suma 100 y 250"
  const s = t.match(/\b(?:suma|sumar|mas)\s+(-?\d+(?:[.,]\d+)?)\s+(?:y|mas|\+)\s+(-?\d+(?:[.,]\d+)?)/);
  if (s) { const a=+s[1].replace(",","."),b=+s[2].replace(",","."); return {a,b,op:"+",resultado:a+b}; }
  const r = t.match(/\b(?:resta|restar|menos)\s+(-?\d+(?:[.,]\d+)?)\s+(?:de|menos|\-)\s+(-?\d+(?:[.,]\d+)?)/);
  if (r) { const a=+r[1].replace(",","."),b=+r[2].replace(",","."); return {a,b,op:"-",resultado:a-b}; }
  return null;
}

// Categoría conversacional
function detectCharla(t) {
  if (/^(hola|holaa|holi|buenos? dias|buenas tardes|buenas noches|hey|que tal|saludos)\b/.test(t)) return "saludo";
  if (/(quien eres|que eres|como te llamas|tu nombre|eres una ia|eres humano|eres robot)/.test(t)) return "identidad";
  if (/(gracias|muchas gracias|te lo agradezco|excelente|perfecto|bien hecho)/.test(t)) return "gracias";
  if (/(adios|chau|hasta luego|nos vemos|bye)/.test(t)) return "despedida";
  if (/(que puedes hacer|ayuda|que sabes|para que sirves|que haces)/.test(t)) return "ayuda";
  if (/(chiste|broma|risa|hazme reir)/.test(t)) return "chiste";
  if (/(eres tonto|inutil|no sirves|malo|estupido|idiota)/.test(t)) return "insulto";
  if (/(te amo|te quiero|me caes|eres genial|eres bueno)/.test(t)) return "elogio";
  if (/(clima|tiempo|futbol|deporte|politica|presidente|noticia)/.test(t)) return "offtopic";
  if (/^(como estas|cómo estas|como te va|cómo te va|como andas|cómo andas|que tal estas|qué tal estás)/.test(t)) return "estado";
  return null;
}

function parse(pregunta) {
  const t = normaliza(pregunta);
  return {
    texto:    t,
    original: pregunta,
    charla:   detectCharla(t),
    aritm:    detectAritmetica(t),
    op:       detectOperacion(t),
    entidad:  detectEntidad(t),
    rango:    detectRangoFecha(t),
    limite:   detectLimite(t),
    contiene: (clave) => contiene(t, SINONIMOS[clave] || []),
    matchAny: (claves) => claves.some((c) => contiene(t, SINONIMOS[c] || [])),
  };
}

module.exports = { parse, normaliza, lev, SINONIMOS, ENTIDAD_TABLA, OPERACIONES, contiene };
