// ─────────────────────────────────────────────────────────────────
//  queryValidator.service.js
//
//  VALIDACIÓN PREVIA A LA EJECUCIÓN + RANKING DE CONFIANZA.
//
//  Antes de ejecutar cualquier SQL responde a:
//    · ¿Existe la tabla?
//    · ¿Existen las columnas?
//    · ¿Existe la FK / es válido el JOIN?
//    · ¿Hay filtro empresa_id disponible?
//
//  Devuelve una puntuación de confianza con motivos:
//  {
//    "ok": true,
//    "confidence": 0.96,
//    "motivo": ["tabla encontrada","FK encontrada","columnas verificadas"],
//    "errores": [],
//    "empresaFilter": "facturas.empresa_id = 1"
//  }
//
//  Si la confianza baja del umbral (0.70), el llamador debería
//  PREGUNTAR o EXPLICAR la ambigüedad antes de ejecutar.
// ─────────────────────────────────────────────────────────────────
const schemaCatalog = require("./schemaCatalog.service");

const UMBRAL_CONFIANZA = 0.70;

// Extrae nombres de tabla muy simples de un SQL (FROM / JOIN)
function tablasEnSQL(sql) {
  const out = new Set();
  const re = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * Valida una intención de consulta antes de ejecutarla.
 *
 * @param {object} opts
 *   sql            SQL a validar (opcional si pasas tabla/columnas)
 *   tabla          tabla principal esperada
 *   columnas       columnas que la consulta necesita
 *   joins          [{ tabla, on }] joins esperados
 *   empresaId      id de empresa para filtro multiempresa
 * @returns {{ ok, confidence, motivo[], errores[], empresaFilter, sugerencias[] }}
 */
async function validar({ sql = "", tabla = null, columnas = [], joins = [], empresaId = null } = {}) {
  const catalogo = await schemaCatalog.get();
  const motivo = [];
  const errores = [];
  const sugerencias = [];
  let score = 0;

  // Tablas a verificar: la principal + las del SQL + las de los joins
  const tablas = new Set();
  if (tabla) tablas.add(tabla.toLowerCase());
  tablasEnSQL(sql).forEach((t) => tablas.add(t));
  joins.forEach((j) => j.tabla && tablas.add(j.tabla.toLowerCase()));

  if (tablas.size === 0) {
    return { ok: false, confidence: 0, motivo: [], errores: ["no se identificó ninguna tabla"], empresaFilter: "", sugerencias };
  }

  // 1) ¿Existe cada tabla?
  let tablasOk = 0;
  for (const t of tablas) {
    if (catalogo[t]) { tablasOk++; }
    else {
      errores.push(`tabla no existe: ${t}`);
      // sugerir tablas parecidas
      const parecidas = Object.keys(catalogo).filter((x) => x.includes(t) || t.includes(x));
      if (parecidas.length) sugerencias.push(`¿quizás '${parecidas[0]}' en lugar de '${t}'?`);
    }
  }
  if (tablasOk === tablas.size) { score += 0.4; motivo.push("tabla(s) encontrada(s)"); }
  else { score += 0.4 * (tablasOk / tablas.size); }

  // 2) ¿Existen las columnas en la tabla principal?
  const principal = tabla ? tabla.toLowerCase() : [...tablas][0];
  const meta = catalogo[principal];
  if (meta && columnas.length) {
    const reales = new Set(meta.columnas.map((c) => c.toLowerCase()));
    const faltan = columnas.filter((c) => !reales.has(String(c).toLowerCase()));
    if (faltan.length === 0) { score += 0.3; motivo.push("columnas verificadas"); }
    else {
      score += 0.3 * ((columnas.length - faltan.length) / columnas.length);
      errores.push(`columnas inexistentes en ${principal}: ${faltan.join(", ")}`);
    }
  } else if (!columnas.length) {
    score += 0.15; // sin columnas específicas que validar
  }

  // 3) ¿Son válidos los JOIN / existe la FK?
  if (joins.length && meta) {
    let joinsOk = 0;
    for (const j of joins) {
      const rel = Object.values(meta.relaciones || {});
      const existe = rel.some((on) => j.tabla && on.includes(j.tabla.toLowerCase())) ||
                     (catalogo[j.tabla?.toLowerCase()] && Object.values(catalogo[j.tabla.toLowerCase()].relaciones || {}).some((on) => on.includes(principal)));
      if (existe) joinsOk++;
      else errores.push(`relación/JOIN no verificada: ${principal} ↔ ${j.tabla}`);
    }
    if (joinsOk === joins.length) { score += 0.2; motivo.push("FK / JOIN encontrada"); }
    else score += 0.2 * (joinsOk / joins.length);
  } else {
    score += 0.1; // sin joins => menos riesgo
  }

  // 4) ¿Hay filtro empresa_id disponible?
  let empresaFilter = "";
  if (meta) {
    if (meta.tiene_empresa_id) {
      empresaFilter = schemaCatalog.empresaFilter(principal, empresaId);
      if (empresaId != null) { score += 0.1; motivo.push("filtro empresa_id aplicado"); }
      else sugerencias.push(`la tabla '${principal}' es multiempresa: agrega WHERE ${meta.columna_empresa} = ?`);
    } else {
      score += 0.05; // no requiere filtro multiempresa
    }
  }

  const confidence = Number(Math.min(1, score).toFixed(2));
  return {
    ok: errores.length === 0 && confidence >= UMBRAL_CONFIANZA,
    confidence,
    motivo,
    errores,
    empresaFilter,
    sugerencias,
    requiereConfirmacion: confidence < UMBRAL_CONFIANZA,
    umbral: UMBRAL_CONFIANZA,
  };
}

module.exports = { validar, UMBRAL_CONFIANZA, tablasEnSQL };
