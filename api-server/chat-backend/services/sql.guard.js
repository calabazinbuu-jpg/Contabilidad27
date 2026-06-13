// Sanitizador / validador para SQL generado por el LLM.
//  - Sólo permite SELECT (y WITH ... SELECT)
//  - Allow-list de tablas
//  - Forza LIMIT salvo agregaciones puras
//  - Bloquea palabras peligrosas

// Whitelist sincronizada con el esquema real de la BD (PostgreSQL).
const TABLAS_PERMITIDAS = new Set([
  // núcleo
  "empresas","sucursales","almacenes","monedas","tipo_cambio","categorias","marcas","unidades_medida",
  // comercial
  "clientes","proveedores","productos","cotizaciones","oportunidades",
  // ventas / facturación
  "ventas","facturas","factura_detalle","factura_items","notas_credito","notas_debito","guias_remision",
  // compras
  "compras","compra_detalle","compras_detalle",
  // inventario
  "movimientos","movimientos_inventario","kardex","lotes",
  // tesorería / contabilidad
  "caja","bancos","cuentas_bancarias","movimientos_tesoreria","pagos","gastos",
  "cuentas_contables","asientos","asientos_contables","asiento_detalle","asientos_detalle",
  "centros_costo","activos_fijos","depreciaciones",
  // RRHH / operaciones
  "empleados","planillas","asistencia","proyectos","tareas","tickets","documentos",
  // sistema / IA
  "configuracion","auditoria","roles","usuario_roles","usuarios","users",
  "sesiones","sesiones_chat","mensajes","mensajes_chat",
  "documentos_rag","embeddings_doc","logs_ia","feedback_ia","ia_memory","cache_consultas",
]);

// Alias frecuentes que el LLM suele escribir sin guion bajo o en plural/singular.
const ALIAS_TABLAS = {
  "facturadetalle":  "factura_detalle",
  "facturasdetalle": "factura_detalle",
  "facturaitems":    "factura_items",
  "ventasdetalle":   "factura_detalle",
  "ventas_detalle":  "factura_detalle",
  "compradetalle":   "compra_detalle",
  "comprasdetalle":  "compra_detalle",
  "compras_detalle": "compra_detalle",
  "asientodetalle":  "asiento_detalle",
  "asientosdetalle": "asientos_detalle",
};

const BLOQUEADAS = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|call|execute|do|merge)\b/i;

function aplicarAlias(sql) {
  // Reemplaza alias frecuentes (facturadetalle → factura_detalle, etc.)
  let s = sql;
  for (const [alias, real] of Object.entries(ALIAS_TABLAS)) {
    const re = new RegExp(`\\b${alias}\\b`, "gi");
    s = s.replace(re, real);
  }
  return s;
}

function validar(sql) {
  let s = (sql || "").trim().replace(/;+\s*$/,"");
  if (!s) throw new Error("SQL vacío");
  if (BLOQUEADAS.test(s)) throw new Error("Sólo se permiten consultas SELECT.");
  if (!/^(select|with)\b/i.test(s)) throw new Error("La consulta debe empezar con SELECT o WITH.");

  s = aplicarAlias(s);

  // tablas referenciadas (FROM y JOIN)
  const refs = [...s.matchAll(/\b(?:from|join)\s+([a-zA-Z_][\w]*)/gi)].map((m) => m[1].toLowerCase());
  for (const t of refs) {
    if (!TABLAS_PERMITIDAS.has(t)) {
      throw new Error(`Tabla no permitida o inexistente en el esquema: "${t}". Verifica el nombre en el catálogo (facturas, factura_detalle, factura_items, clientes, productos, ventas, compras, compra_detalle, gastos, pagos, proveedores, kardex, movimientos_inventario...).`);
    }
  }

  // forzar LIMIT en queries de filas (no en agregaciones sin GROUP BY)
  const esAgregacion = /\bselect\s+(count|sum|avg|min|max)\s*\(/i.test(s) && !/\bgroup\s+by\b/i.test(s);
  if (!esAgregacion && !/\blimit\s+\d+/i.test(s)) s += " LIMIT 500";
  return s;
}

module.exports = { validar, aplicarAlias, TABLAS_PERMITIDAS, ALIAS_TABLAS };
