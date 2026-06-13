// ─────────────────────────────────────────────────────────────────
//  hybrid/internet.tools.js  (v11 — más fuentes, más rápido)
//  Datos en tiempo real vía APIs públicas (sin API key requerida).
//
//  Fuentes:
//    • Tipo de cambio:  https://open.er-api.com/v6/latest/USD
//    • Cripto:         https://api.coingecko.com/api/v3/simple/price
//    • Cripto alt:     https://min-api.cryptocompare.com (fallback)
//  
//  Regla: NUNCA usar el modelo local para cotizaciones de mercado.
// ─────────────────────────────────────────────────────────────────

const fetchFn = (typeof fetch !== "undefined")
  ? fetch
  : (...args) => import("node-fetch").then(m => m.default(...args));

const TTL_FX        = 2  * 60 * 1000;  // 2 min para divisas
const TTL_CRYPTO    = 1  * 60 * 1000;  // 1 min para cripto (más volátil)
const TTL_ECONOMIA  = 30 * 60 * 1000;  // 30 min para macro / búsquedas
const cache = new Map();

function _cacheGet(k, ttl) {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() - v.t > ttl) { cache.delete(k); return null; }
  return v.data;
}
function _cacheSet(k, d) { cache.set(k, { t: Date.now(), data: d }); }

async function _getJSON(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal,
      headers: { "Accept": "application/json", "User-Agent": "ia-empresarial/11" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} desde ${url}`);
    return await r.json();
  } finally { clearTimeout(to); }
}

async function _getText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal,
      headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "User-Agent": "Mozilla/5.0 ia-empresarial/16" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} desde ${url}`);
    return await r.text();
  } finally { clearTimeout(to); }
}

function _decode(s = "") {
  return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ntilde;/g, "ñ").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú")
    .replace(/&nbsp;/g, " ");
}

function _strip(html = "") {
  return _decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// ─── Tipo de cambio: USD → PEN (y cualquier par) ─────────────────
async function tipoCambio(base = "USD", destino = "PEN") {
  const key = `fx:${base}:${destino}`;
  const hit = _cacheGet(key, TTL_FX);
  if (hit) return { ...hit, cache: true };

  // Fuente primaria: open.er-api.com (gratuita, sin key)
  try {
    const j = await _getJSON(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    if (j?.result !== "success") throw new Error("fuente FX no disponible");
    const rate = j.rates?.[destino];
    if (rate == null) throw new Error(`par ${base}/${destino} no soportado`);
    const data = { base, destino, rate, fecha: j.time_last_update_utc, fuente: "open.er-api.com" };
    _cacheSet(key, data);
    return data;
  } catch (err) {
    // Fuente alternativa: frankfurter.app
    const j2 = await _getJSON(`https://api.frankfurter.app/latest?from=${base}&to=${destino}`);
    const rate2 = j2?.rates?.[destino];
    if (!rate2) throw new Error(`No se pudo obtener el tipo de cambio ${base}/${destino}`);
    const data2 = { base, destino, rate: rate2, fecha: j2.date, fuente: "frankfurter.app" };
    _cacheSet(key, data2);
    return data2;
  }
}

// ─── Precio cripto en USD (con fallback a CryptoCompare) ─────────
async function precioCripto(symbol = "bitcoin", vs = "usd") {
  const key = `cx:${symbol}:${vs}`;
  const hit = _cacheGet(key, TTL_CRYPTO);
  if (hit) return { ...hit, cache: true };

  try {
    const j = await _getJSON(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbol)}&vs_currencies=${encodeURIComponent(vs)}`
    );
    const price = j?.[symbol]?.[vs];
    if (price == null) throw new Error(`símbolo ${symbol} no en CoinGecko`);
    const data = { symbol, vs, price, fuente: "coingecko.com" };
    _cacheSet(key, data);
    return data;
  } catch (_) {
    // Fallback: CryptoCompare
    const symUpper = symbol === "bitcoin" ? "BTC"
      : symbol === "ethereum" ? "ETH"
      : symbol === "solana" ? "SOL"
      : symbol === "binancecoin" ? "BNB"
      : symbol === "dogecoin" ? "DOGE"
      : symbol.toUpperCase();
    const j2 = await _getJSON(
      `https://min-api.cryptocompare.com/data/price?fsym=${symUpper}&tsyms=${vs.toUpperCase()}`
    );
    const price2 = j2?.[vs.toUpperCase()];
    if (!price2) throw new Error(`No se pudo obtener precio de ${symbol}`);
    const data2 = { symbol, vs, price: price2, fuente: "cryptocompare.com" };
    _cacheSet(key, data2);
    return data2;
  }
}

async function inflacionPeru(pregunta = "") {
  const key = `inflacion:peru:${pregunta.toLowerCase().replace(/\s+/g, ":")}`;
  const hit = _cacheGet(key, TTL_ECONOMIA);
  if (hit) return { ...hit, cache: true };

  const anio = (String(pregunta).match(/\b(20\d{2})\b/) || [])[1] || String(new Date().getFullYear());
  const [wb, ddg] = await Promise.allSettled([
    _getJSON("https://api.worldbank.org/v2/country/PER/indicator/FP.CPI.TOTL.ZG?format=json&per_page=10", 7000),
    _getText(`https://duckduckgo.com/html/?q=${encodeURIComponent(`inflación Perú ${anio} BCRP`)}`, 9000),
  ]);

  const historicos = [];
  if (wb.status === "fulfilled" && Array.isArray(wb.value?.[1])) {
    for (const row of wb.value[1].filter(x => x?.value != null).slice(0, 5)) {
      historicos.push({ anio: row.date, valor: Number(row.value) });
    }
  }

  const noticias = [];
  if (ddg.status === "fulfilled") {
    const html = ddg.value;
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && noticias.length < 5) {
      const title = _strip(m[2]);
      let url = _decode(m[1]);
      const u = url.match(/[?&]uddg=([^&]+)/);
      if (u) url = decodeURIComponent(u[1]);
      if (/inflaci|bcrp|per[uú]/i.test(title)) noticias.push({ titulo: title, url });
    }
  }

  if (!historicos.length && !noticias.length) throw new Error("No se pudo obtener información de inflación");
  const ultimo = historicos[0];
  const lineas = [];
  if (ultimo) lineas.push(`• Último dato anual Banco Mundial: **${ultimo.valor.toFixed(2)}%** (${ultimo.anio}).`);
  if (noticias.length) {
    lineas.push(`• Encontré referencias actuales para ${anio}: **${noticias[0].titulo}**`);
    if (noticias[1]) lineas.push(`• Otra referencia: ${noticias[1].titulo}`);
  }
  if (Number(anio) > Number(ultimo?.anio || 0)) {
    lineas.push("• Para años futuros o en curso, tómalo como proyección/expectativa; el dato final se confirma al cierre del año.");
  }
  const data = {
    tipo: "inflacion_peru", anio, historicos, noticias, fuente: noticias.length ? "DuckDuckGo/BCRP + Banco Mundial" : "Banco Mundial",
    texto: `📈 **Inflación en Perú ${anio}**\n${lineas.join("\n")}\n📡 Fuente: ${noticias.length ? "búsqueda web + Banco Mundial" : "Banco Mundial"}`,
  };
  _cacheSet(key, data);
  return data;
}

// ─── Mapa: términos del usuario → IDs canónicos ───────────────────
const MAPA_CRIPTO = {
  bitcoin: "bitcoin",   btc: "bitcoin",
  ethereum: "ethereum", eth: "ethereum",
  solana: "solana",     sol: "solana",
  cardano: "cardano",   ada: "cardano",
  bnb: "binancecoin",   binance: "binancecoin",
  dogecoin: "dogecoin", doge: "dogecoin",
  xrp: "ripple",        ripple: "ripple",
  polkadot: "polkadot", dot: "polkadot",
  litecoin: "litecoin", ltc: "litecoin",
  tron: "tron",         trx: "tron",
  avalanche: "avalanche-2", avax: "avalanche-2",
};

const MAPA_FX = {
  // Monedas más consultadas
  "dollar|dólar|dolares|usd|us dollar": { base: "USD", destino: "PEN" },
  "euro|euros|eur":                     { base: "EUR", destino: "PEN" },
  "libra|gbp|libra esterlina":          { base: "GBP", destino: "PEN" },
  "yen|jpy|yenes":                      { base: "JPY", destino: "PEN" },
  "yuan|cny|renminbi":                  { base: "CNY", destino: "PEN" },
  "real|brl|real brasileño":            { base: "BRL", destino: "PEN" },
  "peso mexicano|mxn":                  { base: "MXN", destino: "PEN" },
  "peso colombiano|cop":                { base: "COP", destino: "PEN" },
  "peso chileno|clp":                   { base: "CLP", destino: "PEN" },
};

// ─── Resolver desde texto natural ────────────────────────────────
async function resolverDesdeTexto(pregunta) {
  const q = String(pregunta || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/\b(inflacion|ipc|indice de precios|precios al consumidor)\b/.test(q) && /\b(peru|peruano|bcrp)\b/.test(q)) {
    const r = await inflacionPeru(pregunta);
    return { tipo: r.tipo, texto: r.texto, datos: r };
  }

  // 1) Detectar cripto
  for (const [term, id] of Object.entries(MAPA_CRIPTO)) {
    if (new RegExp(`\\b${term}\\b`, "i").test(q)) {
      const vs = /\b(soles?|pen)\b/.test(q) ? "pen"
               : /\beuros?\b/.test(q) ? "eur"
               : "usd";
      const r = await precioCripto(id, vs);
      const price = typeof r.price === "number"
        ? r.price.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : r.price;
      return {
        tipo: "cripto",
        texto: `💰 **${id.toUpperCase()}** = **${price} ${vs.toUpperCase()}**\n📡 Fuente: ${r.fuente}${r.cache ? " (caché)" : ""}`,
        datos: r,
      };
    }
  }

  // 2) Detectar divisas / tipo de cambio
  let base = "USD";
  let destino = "PEN";
  let descripcion = "Dólar";

  for (const [pattern, par] of Object.entries(MAPA_FX)) {
    if (new RegExp(pattern, "i").test(q)) {
      base = par.base;
      destino = par.destino;
      descripcion = pattern.split("|")[0].charAt(0).toUpperCase() + pattern.split("|")[0].slice(1);
      break;
    }
  }

  // Si pregunta por compra/venta (Perú usa tipo de cambio bancario)
  const esCompra = /\b(compra|comprar|vender\s+d[oó]lar)\b/.test(q);
  const esVenta  = /\b(venta|comprar\s+d[oó]lar|vender\s+sol)\b/.test(q);

  const r = await tipoCambio(base, destino);
  const rate = typeof r.rate === "number"
    ? r.rate.toFixed(4)
    : r.rate;

  let nota = "";
  if (base === "USD" && destino === "PEN") {
    nota = "\n_ℹ️ Tipo interbancario. El tipo bancario para público puede diferir ±0.02-0.05._";
  }

  return {
    tipo: "fx",
    texto: `💱 **1 ${base} = ${rate} ${destino}**\n🕐 Actualizado: ${r.fecha || "reciente"}\n📡 Fuente: ${r.fuente}${r.cache ? " (caché)" : ""}${nota}`,
    datos: r,
  };
}

module.exports = { tipoCambio, precioCripto, inflacionPeru, resolverDesdeTexto };
