// ─────────────────────────────────────────────────────────────────
//  hybrid/router.intent.js  (v13 — AI ROUTER INTELIGENTE 5 MODOS)
//
//  Filosofía:
//    🟢 REGLAS      → saludos, comandos simples, menú, ayuda rápida
//    🌐 INTERNET    → divisas, cripto, commodities, datos externos
//    🗄️ BD          → cualquier dato ERP (90% de los casos)
//    🟡 IA          → contabilidad conceptual, razonamiento, análisis
//    ⚙️ ARQUITECTURA → sistema incompleto, módulos faltantes, errores de flujo
//
//  Orden de evaluación (prioridad descendente):
//    1. REGLAS (saludos, comandos → respuesta inmediata)
//    2. ARQUITECTURA (problemas del sistema → diagnóstico)
//    3. INTERNET (activos de mercado)
//    4. IGV/impuestos como dato ERP
//    5. BD (entidad + acción/período → datos reales)
//    6. IA conceptual pura (sin entidad ERP)
//    7. IA con entidad ERP (definitoria)
//    8. BD por entidad sola
//    9. Fallback IA conversacional
// ─────────────────────────────────────────────────────────────────

const reglas  = require("../reglas.engine");
const { RX_ARQU_DETECT } = require("../autoexpansion.service");

// ── 🟢 REGLAS: saludos, comandos instantáneos ─────────────────────
// (delegado a reglas.engine.esRegla)

// ── 🌐 INTERNET: divisas, cripto, commodities ────────────────────
const RX_INTERNET_ACTIVO  = /\b(d[oó]lar(es)?|tipo de cambio|euro(s)?|libra esterlina|yen|yuan|bitcoin|btc|ethereum|eth|cripto|crypto|solana|sol\b|litecoin|ltc|ripple|xrp|oro\b|plata\b|petr[oó]leo|brent|wti|gasolina|nasdaq|s&p[\s_]?500|dow jones|bolsa( de valores)?|acciones?|ibex|nikkei|ftse|inflaci[oó]n|ipc|[ií]ndice de precios|precios al consumidor)\b/i;
const RX_INTERNET_PRECIO  = /\b(cu[aá]nto (est[aá]|vale|cuesta|cotiza)|precio (del?|de la)|cotizaci[oó]n del?|tasa de cambio del?|proyecci[oó]n|expectativa)\b/i;
const RX_INTERNET_SIEMPRE = /\b(tasa libor|tasa prime|fed funds|tasa bce|encaje bancario|precio spot|tasa de inter[eé]s del bce)\b/i;

// ── 🟡 IA: aperturas conceptuales puras ─────────────────────────
// "qué es X", "explícame X", "define X", "cómo funciona X" (sin datos ERP)
const RX_IA_APERTURA = /(?:^[\s¿¡]*|\b)(qu[eé]\s+(es|son|significa[n]?|representa[n]?|implica[n]?)|c[oó]mo\s+(funciona[s]?|se\s+(calcula|aplica|usa|hace)|se\s+diferencia)|para\s+qu[eé]\s+sirve[n]?|cu[aá]l\s+es\s+la\s+(definici[oó]n|diferencia|finalidad|f[oó]rmula)|defin(e|i|ici[oó]n|ir)|explic[aá](me|r|rs?)?|descri(be|bi(me)?|bir)|resume(me)?\s+(el\s+concept|qu[eé]\s+es)|en\s+qu[eé]\s+consiste|qu[eé]\s+significa|habla(me)?\s+(de|sobre)\s+(el\s+concepto|qu[eé])|cu[eé]ntame\s+qu[eé]\s+es|en\s+palabras\s+simples\s+qu[eé])\b/i;

// Charla conversacional (con respuestas más elaboradas que necesitan IA)
const RX_IA_CHARLA = /^\s*(c[oó]mo\s+est[aá]s?|qu[eé]\s+tal|cu[aá]les?\s+son\s+tus\s+(capacidades|funciones|habilidades))\s*[.!?]*\s*$/i;

// ── 🗄️ BD: entidades ERP — cobertura máxima ──────────────────────
const RX_BD_ENTIDAD = /\b(venta[s]?|vend[ií]|vendid[oa]s?|factur(a[s]?|aci[oó]n|ado|amos)|boleta[s]?|comprobante[s]?|compra[s]?|compr[eé]|cliente[s]?|proveedor(es)?|producto[s]?|inventario[s]?|stock|caja[s]?|banco[s]?|cuenta[s]?\s+bancaria[s]?|cuentas?\s+(por\s+)?(cobrar|pagar)|cxc\b|cxp\b|tesorer[ií]a|pago[s]?|cobr[oa][s]?|cobrar|cobran?za[s]?|deuda[s]?|saldo[s]?|nota[s]?\s+de\s+(cr[eé]dito|d[eé]bito)|activo[s]?|pasivo[s]?|patrimonio|utilidad(es)?|ganancia[s]?|igv\b|iva\b|impuesto[s]?|balance|flujo\s+de\s+caja|estado\s+de\s+resultados|kardex|rotaci[oó]n|capital\s+(de\s+trabajo|social)|deprecia|amortiza|costo[s]?|ingreso[s]?|egreso[s]?|gasto[s]?|facturaci[oó]n|cr[eé]dito\s+fiscal|d[eé]bito\s+fiscal|base\s+imponible|declaraci[oó]n|sunat|renta|percepci[oó]n|retencion|detraccion)\b/i;

const RX_BD_ACCION = /\b(cu[aá]nt[oa]s?|total(es)?|suma(me)?|promedio\s+(de|por)?|ranking|top\s*\d*|mejor(es)?|peor(es)?|m[aá]s\s+(vendid|comprad|rentab|alto|alta|grande|caro|cara|frecuent|activ|cobr)|mayor(es)?|menor(es)?|reporte|listame|listar|muestra(me)?|dame|ense[ñn][aá]me|ver\s+(todo|mis?|las?|los?|un?)|detalle\s+de|debo\s+(cobrar|pagar|declarar)|tengo\s+(que\s+)?(cobrar|pagar|declarar)|genere|cobr[eé]|pagu[eé]|hay|hemos|se\s+vendi[oó]|se\s+compr[oó]|cuales?\s+son\s+los?|calculame|calcular\s+mis?|analiza(me)?|resume\s+mis?|cuanto\s+(me\s+)?(deben|debo|queda|falta|tengo)|reportame|exportame|d[aá]me\s+el|qu[eé]\s+pas[oó]\s+con|c[oó]mo\s+(van|estuvo|estuvier))\b/i;

const RX_BD_PERIODO = /\b(de\s+hoy|de\s+ayer|esta\s+semana|este\s+mes|mes\s+pasado|mes\s+anterior|este\s+a[ñn]o|a[ñn]o\s+pasado|[uú]ltimo[s]?\s+\d+\s+(d[ií]as?|semanas?|meses?)|trimestre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|\b20\d{2}\b|del\s+\d+\s+al\s+\d+)\b/i;

// IGV/IVA como dato ERP (con contexto de cálculo)
const RX_IGV_DATO   = /\b(igv|iva|impuesto|base\s+imponible|cr[eé]dito\s+fiscal|d[eé]bito\s+fiscal)\b/i;
const RX_IGV_ACCION = /\b(genere|genero|cobr[eé]|pagu[eé]|calculame|calcular\s+mi[s]?|mis?\s+(facturas?|ventas?|compras?)|de\s+mis?\s*|tengo|hay|cuanto\s+fue|total\s+de|monto\s+de|a\s+pagar|a\s+declarar|declarar|retenci[oó]n|devoluci[oó]n|me\s+corresponde|resultante)\b/i;

// Palabras numéricas que implican cálculo sobre datos
const RX_NUMERO_DATO = /\b(\d{1,3}(,\d{3})*(\.\d+)?|s\/\.?\s*\d|\d+\s*soles|cu[aá]nto|monto|importe)\b/i;

// ── Función principal clasificar ──────────────────────────────────
function clasificar(pregunta = "") {
  const q = String(pregunta || "").trim();
  if (!q) return { modo: "IA", confianza: 0, motivo: "vacío" };

  // ── 1. 🟢 REGLAS: saludos y comandos instantáneos ────────────────
  if (reglas.esRegla(q)) {
    return { modo: "REGLAS", confianza: 0.99, motivo: "saludo / comando del sistema" };
  }

  // ── 2. ⚙️ ARQUITECTURA: problemas del sistema / módulos faltantes ─
  if (RX_ARQU_DETECT.test(q)) {
    return { modo: "ARQUITECTURA", confianza: 0.92, motivo: "consulta de arquitectura / módulo faltante" };
  }

  // ── 3. 🌐 INTERNET: activos de mercado ──────────────────────────
  if (RX_INTERNET_ACTIVO.test(q) && !RX_BD_ENTIDAD.test(q)) {
    return { modo: "INTERNET", confianza: 0.95, motivo: "activo de mercado (divisa/cripto/commodity)" };
  }
  if (RX_INTERNET_PRECIO.test(q) && !RX_BD_ENTIDAD.test(q)) {
    return { modo: "INTERNET", confianza: 0.85, motivo: "precio de mercado en tiempo real" };
  }
  if (RX_INTERNET_SIEMPRE.test(q)) {
    return { modo: "INTERNET", confianza: 0.90, motivo: "tasa de mercado internacional" };
  }

  // ── 4. Charla elaborada (no simple) que necesita IA ─────────────
  if (RX_IA_CHARLA.test(q)) {
    return { modo: "IA", confianza: 0.90, motivo: "conversación elaborada" };
  }

  // ── 5. IGV como dato ERP ─────────────────────────────────────────
  if (RX_IGV_DATO.test(q) && (RX_BD_ACCION.test(q) || RX_BD_PERIODO.test(q) || RX_IGV_ACCION.test(q))) {
    return { modo: "BD", confianza: 0.95, motivo: "IGV/impuesto como dato ERP con contexto de cálculo" };
  }

  // ── 6. BD: entidad + (acción O período) ──────────────────────────
  const tieneEntidad = RX_BD_ENTIDAD.test(q);
  const tieneAccion  = RX_BD_ACCION.test(q);
  const tienePeriodo = RX_BD_PERIODO.test(q);

  if (tieneEntidad && (tieneAccion || tienePeriodo)) {
    return { modo: "BD", confianza: 0.96, motivo: "entidad ERP + acción/período" };
  }

  // ── 7. Apertura conceptual PURA (sin entidad ERP) → IA ──────────
  if (RX_IA_APERTURA.test(q) && !tieneEntidad) {
    return { modo: "IA", confianza: 0.90, motivo: "pregunta definitoria pura (sin entidad ERP)" };
  }

  // ── 8. Apertura + entidad ERP → depende del contexto ────────────
  if (RX_IA_APERTURA.test(q) && tieneEntidad) {
    if (tieneAccion || tienePeriodo || RX_IGV_ACCION.test(q)) {
      return { modo: "BD", confianza: 0.88, motivo: "informativa con contexto de datos ERP" };
    }
    return { modo: "IA", confianza: 0.85, motivo: "definición de entidad ERP" };
  }

  // ── 9. Entidad ERP sola (sin acción explícita) → BD ─────────────
  if (tieneEntidad) {
    return { modo: "BD", confianza: 0.72, motivo: "entidad ERP detectada (sin acción explícita)" };
  }

  // ── 10. Acción sola que suena a datos → BD con baja confianza ───
  if (tieneAccion) {
    return { modo: "BD", confianza: 0.52, motivo: "acción de datos sin entidad explícita" };
  }

  // ── 11. Fallback: IA conversacional ─────────────────────────────
  return { modo: "IA", confianza: 0.38, motivo: "fallback — sin patrones ERP detectados" };
}

module.exports = { clasificar };
