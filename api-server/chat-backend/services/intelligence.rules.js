// ─────────────────────────────────────────────────────────────────
// intelligence.rules.js  (v8.3 — FIX: gastos usa movimientos_tesoreria)
// ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(schemaText = "") {
  return `
Eres un asistente experto en PostgreSQL, contabilidad y finanzas ERP.
Respondes ÚNICAMENTE con datos reales de la base de datos.

🧠 REGLAS OBLIGATORIAS DE INTELIGENCIA
1. ANTES de ejecutar SQL: analiza qué tablas y columnas necesitas y
   verifica que existan en el ESQUEMA REAL provisto más abajo.
   Si una tabla/columna NO existe en el esquema, NO la uses: elige la
   alternativa más cercana del esquema o explica qué falta.
2. PLANIFICADOR DE CONSULTAS: piensa la consulta paso a paso:
   (a) tabla principal, (b) JOINs necesarios, (c) filtros (fechas,
   empresa_id), (d) agregaciones (SUM, COUNT, AVG), (e) GROUP BY, ORDER BY.
3. AUTOCORRECCIÓN: si una consulta falla, recibirás el error con el nombre
   exacto de la tabla/columna. Reescribe la consulta corregida.
4. FORZAR AGREGACIONES FINANCIERAS:
   • "ventas por mes" → SUM(total) GROUP BY date_trunc('month', fecha)
   • "producto más vendido" → SUM(cantidad) JOIN productos GROUP BY producto
   • "top clientes" → SUM(total) JOIN clientes GROUP BY cliente
5. FILTRADO POR FECHAS Y CONTEXTO:
   • Si la pregunta menciona mes/año/rango, usa BETWEEN o date_trunc.
   • Siempre filtra por empresa_id cuando exista esa columna.
6. CONTEXTO FINANCIERO REAL:
   UTILIDAD = SUM(ventas.total) - SUM(compras.total) - SUM(gastos).
   Los gastos pueden estar en tabla "gastos" (columna monto) O en
   "movimientos_tesoreria" (columna monto/importe WHERE tipo='egreso').
   Si una tabla no tiene datos, asume 0 y explícalo. NUNCA digas "no hay
   datos" sin haber comprobado las tablas relacionadas.
7. VALIDACIÓN DE RESULTADOS: si SUM da 0 pero COUNT(*) > 0, la consulta
   está mal: revisa filtros (fecha, empresa, estado).
8. NUNCA inventes tablas ni columnas. Si dudas, usa SELECT con COUNT(*)
   para validar antes de agregar.
9. MEMORIA DE ERRORES: te entregaré errores previos para que NO repitas
   los mismos patrones SQL.
10. REINTERPRETACIÓN: si la pregunta es ambigua, elige la interpretación
    más útil financieramente y aclara la suposición.

🧾 SQL INTELIGENTE
- Solo SELECT. Siempre LIMIT salvo agregaciones globales.
- Errores deben citar tabla y columna exactas.
- Prioridad: facturas → clientes → productos → ventas → compras → gastos.

📊 FORMATO FINANCIERO (cuando aplique)
📊 Resultado
💰 Ingresos: X
🧾 Costos:   X
📉 Gastos:   X
────────────────
❤️ Utilidad: X
📈 Margen:   X%

📦 ESQUEMA REAL DE LA BASE DE DATOS:
${schemaText || "(esquema no disponible — usa SOLO las tablas listadas: empresas, sucursales, almacenes, clientes, proveedores, productos, categorias, marcas, ventas, facturas, factura_detalle, factura_items, notas_credito, notas_debito, compras, compra_detalle, gastos, pagos, caja, bancos, cuentas_bancarias, movimientos_tesoreria, movimientos_inventario, kardex, lotes, cuentas_contables, asientos, asientos_contables, asiento_detalle, asientos_detalle, empleados, planillas, activos_fijos, usuarios)"}

⚠️ IMPORTANTE: Los detalles de venta/factura están en la tabla **factura_detalle** (NO existe ventas_detalle). Los detalles de compra están en **compra_detalle**. Para "productos más vendidos" usa: FROM factura_detalle fd JOIN productos p ON p.id = fd.producto_id GROUP BY p.id, p.nombre.

Devuelve SOLO JSON {"sql":"SELECT ..."} cuando se te pida SQL. Sin explicación.
`.trim();
}

// Prompt estático por compatibilidad
const SYSTEM_PROMPT = buildSystemPrompt("");

// ───────────────────────── helpers financieros ─────────────────────────
async function calcularUtilidad(db, empresaId, rango = null) {
  const notas = [];

  async function safeSum(table, col, fechaCol = "fecha", extraWhere = null) {
    const where = [];
    const params = [];
    if (empresaId != null) {
      params.push(empresaId);
      where.push(`empresa_id = $${params.length}`);
    }
    if (extraWhere) {
      where.push(extraWhere);
    }
    if (rango?.desde && rango?.hasta) {
      params.push(rango.desde, rango.hasta);
      where.push(`${fechaCol} BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
    try {
      const q = `SELECT COALESCE(SUM(${col}),0)::float AS v, COUNT(*)::int AS n FROM ${table} ${W}`;
      const r = await db.query(q, params);
      const v = Number(r.rows[0]?.v || 0);
      const n = Number(r.rows[0]?.n || 0);
      if (n > 0 && v === 0) notas.push(`⚠️ ${table}: ${n} registros pero SUM(${col})=0 (revisar columna).`);
      return v;
    } catch (e) {
      notas.push(`⚠️ ${table}.${col}: ${e.message} (asumido 0)`);
      return 0;
    }
  }

  /**
   * Calcula gastos con doble estrategia:
   *  1) tabla "gastos" (columna monto)
   *  2) movimientos_tesoreria WHERE tipo = 'egreso'
   */
  async function calcularGastos() {
    // Intento 1: tabla gastos
    const v1 = await safeSum("gastos", "monto");
    if (v1 > 0) return v1;

    // Intento 2: movimientos_tesoreria WHERE tipo = 'egreso'
    try {
      // Detectar columna de monto disponible
      const colCheck = await db.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'movimientos_tesoreria'
            AND column_name IN ('monto','importe','total')
          LIMIT 1`
      );
      if (colCheck.rows.length) {
        const colMonto = colCheck.rows[0].column_name;
        const v2 = await safeSum("movimientos_tesoreria", colMonto, "fecha", "tipo = 'egreso'");
        if (v2 > 0) {
          notas.push("Gastos obtenidos de movimientos_tesoreria (tipo='egreso').");
          return v2;
        }
      }
    } catch (_) {}

    return 0;
  }

  const ingresos = await safeSum("ventas", "total");
  const costos   = await safeSum("compras", "total");
  const gastos   = await calcularGastos();

  const utilidad = ingresos - costos - gastos;
  const margen   = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;

  return { ingresos, costos, gastos, utilidad, margen, notas };
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function formatoFinanciero({ ingresos, costos, gastos, utilidad, margen, notas = [] }) {
  const emoji = utilidad >= 0 ? "💚" : "❤️";
  let txt =
`📊 **Resultado financiero**

💰 Ingresos: S/ ${fmt(ingresos)}
🧾 Costos:   S/ ${fmt(costos)}
📉 Gastos:   S/ ${fmt(gastos)}
────────────────
${emoji} Utilidad: S/ ${fmt(utilidad)}
📈 Margen:   ${margen.toFixed(2)}%`;

  if (notas.length) txt += `\n\n_Notas:_\n• ${notas.join("\n• ")}`;
  return txt;
}

module.exports = { SYSTEM_PROMPT, buildSystemPrompt, calcularUtilidad, formatoFinanciero, fmt };
