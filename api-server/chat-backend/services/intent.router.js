// ─────────────────────────────────────────────────────────────────
//  intent.router.js  (v11 — corregido)
//  Elige el agente correcto para consultas de BD/ERP.
//  Este router solo se invoca cuando hybrid/router.intent.js
//  ya clasificó la pregunta como "BD". Por eso NO incluye IGV/IVA
//  como analítico — eso pertenece al router híbrido (IA/Ollama).
// ─────────────────────────────────────────────────────────────────
const nlp = require("./nlp.engine");

// Preguntas de BD que son analíticas (requieren engine.v2 / aggregation)
// NOTA: IGV/IVA/impuest fueron eliminados — son conceptos → van a Ollama
const RX_ANALITICA = /\b(top\s*\d*|mejor(es)?|peor(es)?|m[aá]s\s+(vendid|comprad|rentab|alto|alta|grande|caro|cara|frecuent)|menor(es)?|mayor(es)?|cu[aá]nt[oa][s]?|cu[aá]l(es)?|ranking|promedio|ticket\s+(promedio|medio)|m[aá]rgen|margen\s+(bruto|neto)|utilidad|ganancia|rentabilidad|flujo\s+(de\s+caja)?|ingres|egres|gast|saldo|deuda|por\s+mes|por\s+d[ií]a|mensual|anual|tendencia|crec(i|er|iendo)|baj(o|ando)|predic|proyecci[oó]n|comparar|vs\.?|versus|inactiv|abandono|stock\s+(bajo|cr[ií]tico|m[ií]nimo)|valor\s+(total\s+)?(del?)?\s*inventario|debo\s+eliminar|sin\s+(ventas|movimiento)|rotaci[oó]n|dependo|dependencia|resume\s*(la\s*)?empresa|estado\s*(de\s+la\s*)?empresa|detect(a|ar)\s+(problem|anomal)|roi\b|roe\b)\b/i;

// Proyección de campos: "dame los proveedores y su email"
const RX_PROYECCION = /\b(dame|mu[eé]strame|lista|listar|ver|enseñame)\b.*\b(solo|s[oó]lo|y\s+su|y\s+sus|con\s+su|con\s+sus|[uú]nicamente)\b/i;

// Preguntas que SIEMPRE son conversacionales/IA (nunca van a BD)
const RX_CONCEPTUAL = /^\s*(qu[eé]\s+(es|son|significa[n]?)|c[oó]mo\s+(funciona|se\s+calcula|se\s+aplica)|para\s+qu[eé]\s+sirve[n]?|defin(e|ici[oó]n)|explica(me)?|cu[aá]l\s+es\s+la\s+(definici[oó]n|f[oó]rmula|diferencia))/i;

function elegirAgente(pregunta, historial = []) {
  // Si la pregunta es conceptual, NO ir a BD — devolver "charla" como señal
  // (el pipeline de server.js debería haberla redirigido a IA antes de llegar aquí)
  if (RX_CONCEPTUAL.test(pregunta)) return "charla";

  const p = nlp.parse(pregunta);
  const t = (p.texto || "").toLowerCase();

  // 1. Conversacional / aritmética
  if (p.charla) return "charla";
  if (p.aritm)  return "calc";

  // 2. Soporte / ayuda (sin contexto de negocio)
  if (/\b(c[oó]mo|ayuda|manual|instrucciones?)\b/.test(t) &&
      !/\b(venta|compra|fact|cliente|proveedor|producto|inventario|pago|cobro)\b/.test(t)) {
    return "soporte";
  }

  // 3. Analítica / métricas → siempre smart (usa engine.v2 internamente)
  if (RX_ANALITICA.test(t)) return "smart";
  if (RX_PROYECCION.test(t)) return "smart";

  // 4. Listados completos
  if (/\b(muestra|mu[eé]strame|listame|lista|dame|ver)\b.*\b(todos|todas|todas\s+las|todos\s+los)\b/.test(t)) {
    return "smart";
  }

  // 5. Entidades ERP específicas
  if (/\b(proveedor|cliente|producto|factura|boleta|comprobante|venta|compra|inventario|stock|pago|cobro|nota\s+de)\b/.test(t)) {
    return "smart";
  }

  // 6. Tesorería / caja / bancos
  if (/\b(caja|banco[s]?|efectivo|saldo|liquidez|flujo|tesorer)\b/.test(t)) return "smart";

  // 7. Reportes / exportaciones
  if (/\b(reporte|informe|exporta|descarga|excel|pdf)\b/.test(t)) return "reportes";

  // 8. Fallback universal → smart (mejor agente general del ERP)
  return "smart";
}

module.exports = { elegirAgente };
