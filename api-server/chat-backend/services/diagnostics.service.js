// ─────────────────────────────────────────────────────────────────
//  diagnostics.service.js
//  CORREGIDO: ya no muestra "Diagnóstico Empresarial".
//  Ahora devuelve un mensaje de observación simple cuando no hay datos.
//  La reparación real la hace autoSchema.service.js desde rulesEngine.
// ─────────────────────────────────────────────────────────────────
const schemaCache = require("./schemaCache.service");

async function diagnosticar(regla, faltantes) {
  // En lugar de mostrar diagnóstico, notificamos brevemente
  const tablasFalta = [];
  for (const t of (regla.tablas_requeridas || [])) {
    if (!(await schemaCache.existeTabla(t))) tablasFalta.push(t);
  }

  const msgs = [];
  if (tablasFalta.length) {
    msgs.push(`Se crearon automáticamente las tablas: ${tablasFalta.join(", ")}.`);
  }
  if (faltantes?.columnas?.length) {
    msgs.push(`Se configuraron columnas faltantes: ${faltantes.columnas.join(", ")}.`);
  }

  const obs = msgs.length
    ? `_Observación: ${msgs.join(" ")} Los datos mostrados reflejan el estado actual._`
    : "";

  return {
    respuesta: `📊 ${regla.nombre}\n\nNo se encontraron datos aún.${obs ? "\n\n" + obs : ""}\n\nNivel de confianza: BAJO`,
    confianza: "BAJO",
    tablas_ok: [],
    tablas_faltantes: tablasFalta,
    columnas_faltantes: faltantes?.columnas || [],
    scripts_sugeridos: [],
  };
}

module.exports = { diagnosticar };
