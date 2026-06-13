// =============================================================
//  v3 — Layer 5: Normalizador de Fechas Avanzado
//  Soporta: primer/segundo/tercer/cuarto trimestre, últimos N días,
//  últimas N semanas/meses, este año fiscal, mes anterior exacto,
//  YTD, MTD, "del [mes] al [mes]".
// =============================================================
"use strict";

const NOW = () => new Date();
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const MES_ALIASES = { setiembre: "septiembre" };
const FISCAL_START_MONTH = 0; // enero = 0 (ajusta según país)

function pad(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function rng(desde, hasta, tipo) {
  const d = new Date(desde); d.setHours(0,0,0,0);
  const h = new Date(hasta); h.setHours(23,59,59,999);
  return { tipo, desde: d, hasta: h, desdeYmd: ymd(d), hastaYmd: ymd(h) };
}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x;}

function normalizeText(s) {
  return (s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[¿?¡!.,;:]/g," ").replace(/\s+/g," ").trim();
}

function trimestre(idx, year) {
  const startMonth = idx*3;
  return rng(new Date(year, startMonth, 1), new Date(year, startMonth+3, 0), `Q${idx+1}_${year}`);
}

function normalizeDate(text) {
  const t = normalizeText(text);
  const now = NOW();

  // últimos N días/semanas/meses
  let m = t.match(/ultim[oa]s? (\d+) dias?/);
  if (m) { const n=+m[1]; return rng(addDays(now,-n), now, `ultimos_${n}_dias`); }
  m = t.match(/ultim[oa]s? (\d+) semanas?/);
  if (m) { const n=+m[1]; return rng(addDays(now,-7*n), now, `ultimas_${n}_semanas`); }
  m = t.match(/ultim[oa]s? (\d+) mes(?:es)?/);
  if (m) { const n=+m[1]; return rng(addMonths(now,-n), now, `ultimos_${n}_meses`); }

  // trimestres
  const TRIM = { primer:0, "1":0, segundo:1, "2":1, tercer:2, "3":2, cuarto:3, "4":3 };
  m = t.match(/(primer|segundo|tercer|cuarto|[1-4])\s+trimestre(?:\s+(?:de\s+)?(20\d{2}))?/);
  if (m) {
    const idx = TRIM[m[1]];
    const y = m[2] ? +m[2] : now.getFullYear();
    return trimestre(idx, y);
  }
  if (/\bq([1-4])\b/.test(t)) {
    const idx = (+t.match(/\bq([1-4])\b/)[1])-1;
    return trimestre(idx, now.getFullYear());
  }

  // año fiscal / YTD / MTD
  if (/\b(este )?ano fiscal\b/.test(t) || /\baño fiscal\b/.test(t)) {
    const y = now.getMonth() >= FISCAL_START_MONTH ? now.getFullYear() : now.getFullYear()-1;
    return rng(new Date(y, FISCAL_START_MONTH, 1), addDays(new Date(y+1, FISCAL_START_MONTH, 1), -1), `ano_fiscal_${y}`);
  }
  if (/\bytd\b|year to date|en lo que va del an[oñ]/.test(t)) {
    return rng(new Date(now.getFullYear(),0,1), now, `ytd`);
  }
  if (/\bmtd\b|en lo que va del mes/.test(t)) {
    return rng(new Date(now.getFullYear(), now.getMonth(), 1), now, `mtd`);
  }

  // mes anterior exacto
  if (/\b(mes (?:anterior|pasado)|ultimo mes)\b/.test(t)) {
    const ref = addMonths(now, -1);
    return rng(new Date(ref.getFullYear(), ref.getMonth(), 1),
               new Date(ref.getFullYear(), ref.getMonth()+1, 0), `mes_anterior`);
  }
  if (/\b(ano|año) (anterior|pasado)\b/.test(t)) {
    const y = now.getFullYear()-1;
    return rng(new Date(y,0,1), new Date(y,11,31), `ano_anterior`);
  }
  if (/\b(este mes|mes actual|del mes|mensual)\b/.test(t)) {
    return rng(new Date(now.getFullYear(), now.getMonth(), 1),
               new Date(now.getFullYear(), now.getMonth()+1, 0), `mes_actual`);
  }
  if (/\b(este (an[oñ])|an[oñ] actual|anual)\b/.test(t)) {
    return rng(new Date(now.getFullYear(),0,1), new Date(now.getFullYear(),11,31), `ano_actual`);
  }
  if (/\b(hoy|el dia de hoy)\b/.test(t)) return rng(now, now, "hoy");
  if (/\bayer\b/.test(t)) { const y=addDays(now,-1); return rng(y,y,"ayer"); }

  // "del [mesA] al [mesB] [año]"
  m = t.match(/del?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+al?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(20\d{2}))?/);
  if (m) {
    const a = MESES.indexOf(MES_ALIASES[m[1]]||m[1]);
    const b = MESES.indexOf(MES_ALIASES[m[2]]||m[2]);
    const y = m[3] ? +m[3] : now.getFullYear();
    return rng(new Date(y,a,1), new Date(y,b+1,0), `${m[1]}_${m[2]}_${y}`);
  }

  // mes nombrado + año?
  for (let i=0;i<MESES.length;i++) {
    if (t.includes(MESES[i]) || (i===8 && t.includes("setiembre"))) {
      const ya = t.match(/\b(20\d{2})\b/);
      const y = ya ? +ya[1] : now.getFullYear();
      return rng(new Date(y,i,1), new Date(y,i+1,0), `${MESES[i]}_${y}`);
    }
  }
  // solo año
  const ya = t.match(/\b(20\d{2})\b/);
  if (ya) { const y=+ya[1]; return rng(new Date(y,0,1), new Date(y,11,31), `ano_${y}`); }
  return null;
}

module.exports = { normalizeDate };
