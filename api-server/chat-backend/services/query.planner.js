// ─────────────────────────────────────────────────────────────────
// query.planner.js — Planificador de consultas SQL
// FIX v8.3:
//   - gastos_por_mes / total_gastos: tabla "gastos" → fallback a
//     movimientos_tesoreria WHERE tipo = 'egreso'
//   - top_productos: "ventas_detalle" no existe → usa "ventas"
//     con columna "producto" o JOIN productos via producto_id
// ─────────────────────────────────────────────────────────────────
const schema = require("./schema.introspect");

const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);

function detectarRango(t) {
  const m = (t || "").toLowerCase();
  const hoy = new Date();
  const y = hoy.getFullYear();
  if (/este a[ñn]o|del a[ñn]o/.test(m))
    return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  if (/a[ñn]o pasado/.test(m))
    return { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
  if (/este mes|del mes/.test(m)) {
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const last = new Date(y, hoy.getMonth() + 1, 0).getDate();
    return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${last}` };
  }
  if (/mes pasado/.test(m)) {
    const d = new Date(y, hoy.getMonth() - 1, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { desde: `${d.getFullYear()}-${mm}-01`, hasta: `${d.getFullYear()}-${mm}-${last}` };
  }
  return null;
}

function detectarIntent(t) {
  const m = (t || "").toLowerCase();
  if (/ventas? por mes|mensual.*venta|venta.*mensual/.test(m)) return "ventas_por_mes";
  if (/compras? por mes|mensual.*compra/.test(m))              return "compras_por_mes";
  if (/gastos? por mes|mensual.*gasto/.test(m))                return "gastos_por_mes";
  if (/producto.*(m[aá]s vendid|top|ranking)/.test(m))         return "top_productos";
  if (/(top|mejores?).*cliente|cliente.*(top|m[aá]s)/.test(m)) return "top_clientes";
  if (/utilidad|ganancia|margen|rentab/.test(m))               return "utilidad";
  if (/stock (bajo|cr[ií]tic)|reposici[oó]n/.test(m))          return "stock_critico";
  if (/total.*venta|cu[aá]nto vend|ingresos? total/.test(m))   return "total_ventas";
  if (/total.*compra|cu[aá]nto compr/.test(m))                 return "total_compras";
  if (/total.*gasto|cu[aá]nto gast/.test(m))                   return "total_gastos";
  return null;
}

// Detecta número explícito en la pregunta: "top 5", "dame 3", "5 clientes"
function detectarLimitePregunta(pregunta) {
  const t = (pregunta || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!]/g," ");
  let m;
  m = t.match(/\btop\s+(\d+)\b/);  if (m) return Math.min(+m[1], 500);
  m = t.match(/\b(?:primeros?|los?)\s+(\d+)\b/); if (m) return Math.min(+m[1], 500);
  m = t.match(/\b(\d+)\s+(?:mejores?|mayores?|primeros?|clientes?|productos?|proveedores?)\b/); if (m) return Math.min(+m[1], 500);
  m = t.match(/\b(?:dame|lista|muestra|muestrame|trae)\s+(\d{1,4})\b/); if (m) return Math.min(+m[1], 500);
  return null;
}

async function planificar(pregunta) {
  const intent = detectarIntent(pregunta);
  if (!intent) return null;
  const rango = detectarRango(pregunta);
  const limiteExplicito = detectarLimitePregunta(pregunta);
  const s = await schema.getSchema();

  /**
   * Construye WHERE + params para una tabla dada.
   * Devuelve { W, params, hasTotal, hasFecha } o null si la tabla no existe.
   */
  const make = async (tabla, colTotal, colFecha = "fecha") => {
    if (!s[tabla]) return null;
    const cols = s[tabla];
    const where = [];
    const params = [];
    if (cols.some(c => c.col === "empresa_id")) {
      params.push(EMP); where.push(`empresa_id = $${params.length}`);
    }
    if (rango && cols.some(c => c.col === colFecha)) {
      params.push(rango.desde, rango.hasta);
      where.push(`${colFecha} BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return {
      W, params,
      hasTotal: cols.some(c => c.col === colTotal),
      hasFecha: cols.some(c => c.col === colFecha),
    };
  };

  /**
   * Para gastos: intenta tabla "gastos"; si no existe, usa
   * movimientos_tesoreria WHERE tipo = 'egreso'.
   * Devuelve { tabla, colMonto, W, params, nota } o null.
   */
  const makeGastos = async () => {
    // Intento 1: tabla gastos
    if (s["gastos"]) {
      const m = await make("gastos", "monto");
      if (m?.hasTotal) return { tabla: "gastos", colMonto: "monto", ...m, nota: null };
    }
    // Intento 2: movimientos_tesoreria WHERE tipo = 'egreso'
    if (s["movimientos_tesoreria"]) {
      const cols = s["movimientos_tesoreria"];
      const colMonto = cols.some(c => c.col === "monto") ? "monto"
                     : cols.some(c => c.col === "importe") ? "importe"
                     : cols.some(c => c.col === "total") ? "total"
                     : null;
      const colFecha = cols.some(c => c.col === "fecha") ? "fecha" : null;
      if (!colMonto) return null;
      const where = ["tipo = 'egreso'"];
      const params = [];
      if (cols.some(c => c.col === "empresa_id")) {
        params.push(EMP); where.unshift(`empresa_id = $${params.length}`);
      }
      if (rango && colFecha) {
        params.push(rango.desde, rango.hasta);
        where.push(`${colFecha} BETWEEN $${params.length - 1} AND $${params.length}`);
      }
      const W = `WHERE ${where.join(" AND ")}`;
      return {
        tabla: "movimientos_tesoreria", colMonto, W, params,
        hasTotal: true, hasFecha: !!colFecha,
        nota: "Gastos tomados de movimientos_tesoreria (tipo='egreso').",
      };
    }
    return null;
  };

  switch (intent) {
    // ─── Ventas por mes ──────────────────────────────────────────
    case "ventas_por_mes": {
      const m = await make("ventas", "total");
      if (!m?.hasFecha || !m.hasTotal) return null;
      return {
        intent, rango,
        sql: `SELECT date_trunc('month', fecha)::date AS mes,
                     COUNT(*)::int AS n,
                     COALESCE(SUM(total),0)::float AS total
                FROM ventas ${m.W}
            GROUP BY 1 ORDER BY 1`,
        params: m.params,
      };
    }

    // ─── Compras por mes ─────────────────────────────────────────
    case "compras_por_mes": {
      const m = await make("compras", "total");
      if (!m?.hasFecha || !m.hasTotal) return null;
      return {
        intent, rango,
        sql: `SELECT date_trunc('month', fecha)::date AS mes,
                     COUNT(*)::int AS n,
                     COALESCE(SUM(total),0)::float AS total
                FROM compras ${m.W}
            GROUP BY 1 ORDER BY 1`,
        params: m.params,
      };
    }

    // ─── Gastos por mes (FIX: fallback a movimientos_tesoreria) ─
    case "gastos_por_mes": {
      const g = await makeGastos();
      if (!g?.hasFecha) return null;
      return {
        intent, rango,
        sql: `SELECT date_trunc('month', fecha)::date AS mes,
                     COUNT(*)::int AS n,
                     COALESCE(SUM(${g.colMonto}),0)::float AS total
                FROM ${g.tabla} ${g.W}
            GROUP BY 1 ORDER BY 1`,
        params: g.params,
        nota: g.nota,
      };
    }

    // ─── Totales ─────────────────────────────────────────────────
    case "total_ventas": {
      const m = await make("ventas", "total");
      if (!m?.hasTotal) return null;
      return { intent, rango,
        sql: `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS total FROM ventas ${m.W}`,
        params: m.params };
    }
    case "total_compras": {
      const m = await make("compras", "total");
      if (!m?.hasTotal) return null;
      return { intent, rango,
        sql: `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS total FROM compras ${m.W}`,
        params: m.params };
    }
    case "total_gastos": {
      const g = await makeGastos();
      if (!g) return null;
      return { intent, rango,
        sql: `SELECT COUNT(*)::int AS n, COALESCE(SUM(${g.colMonto}),0)::float AS total FROM ${g.tabla} ${g.W}`,
        params: g.params, nota: g.nota };
    }

    // ─── Top productos (FIX: sin ventas_detalle) ─────────────────
    case "top_productos": {
      // Opción A: ventas tiene columna "producto" directamente
      if (s["ventas"]) {
        const colsV = s["ventas"];
        const colProd    = colsV.find(c => /^producto$|^producto_nombre$|^descripcion$/i.test(c.col))?.col;
        const colCant    = colsV.find(c => /^cantidad$/i.test(c.col))?.col;
        const colTotal   = colsV.find(c => /^total$/i.test(c.col))?.col;

        const limTop = limiteExplicito || 10;
        if (colProd) {
          // Ventas tiene nombre de producto directo
          const where = []; const params = [];
          if (colsV.some(c => c.col === "empresa_id")) { params.push(EMP); where.push(`empresa_id = $${params.length}`); }
          if (rango && colsV.some(c => c.col === "fecha")) {
            params.push(rango.desde, rango.hasta);
            where.push(`fecha BETWEEN $${params.length - 1} AND $${params.length}`);
          }
          const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
          return {
            intent, rango, limiteExplicito,
            sql: `SELECT ${colProd} AS producto,
                         ${colCant ? `COALESCE(SUM(${colCant}),0)::float` : "COUNT(*)::float"} AS cantidad,
                         COUNT(*)::int AS ventas
                    FROM ventas ${W}
                   WHERE ${colProd} IS NOT NULL ${W ? "AND" : ""}${W.replace("WHERE ", W ? " " : "")}
                GROUP BY ${colProd}
                ORDER BY cantidad DESC
                   LIMIT ${limTop}`.replace(/WHERE\s+WHERE/gi, "WHERE"),
            params,
            nota: "Top productos calculado desde tabla ventas directamente.",
          };
        }

        // Opción B: ventas tiene producto_id → JOIN productos
        const colProdId = colsV.find(c => /^producto_id$/i.test(c.col))?.col;
        if (colProdId && s["productos"]) {
          const colsP = s["productos"];
          const colNom = colsP.find(c => /^nombre$|^descripcion$/i.test(c.col))?.col || "nombre";
          const where = []; const params = [];
          if (colsV.some(c => c.col === "empresa_id")) { params.push(EMP); where.push(`v.empresa_id = $${params.length}`); }
          if (rango && colsV.some(c => c.col === "fecha")) {
            params.push(rango.desde, rango.hasta);
            where.push(`v.fecha BETWEEN $${params.length - 1} AND $${params.length}`);
          }
          const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
          return {
            intent, rango, limiteExplicito,
            sql: `SELECT p.${colNom} AS producto,
                         ${colCant ? `COALESCE(SUM(v.${colCant}),0)::float` : "COUNT(*)::float"} AS cantidad,
                         COUNT(*)::int AS ventas
                    FROM ventas v
                    JOIN productos p ON p.id = v.${colProdId}
                    ${W}
                GROUP BY p.${colNom}
                ORDER BY cantidad DESC
                   LIMIT ${limTop}`,
            params,
            nota: "Top productos: JOIN ventas → productos.",
          };
        }

        // Opción C: ventas_detalle existe (caso original)
        if (s["ventas_detalle"]) {
          const colsVD = s["ventas_detalle"];
          const colCantVD = colsVD.find(c => /^cantidad$/i.test(c.col))?.col;
          const colProdVD = colsVD.find(c => /^producto_id$/i.test(c.col))?.col;
          const colsP = s["productos"];
          const colNom = colsP?.find(c => /^nombre$|^descripcion$/i.test(c.col))?.col || "nombre";
          if (!colCantVD || !colProdVD || !colsP) return null;
          const where = []; const params = [];
          if (colsV.some(c => c.col === "empresa_id")) { params.push(EMP); where.push(`v.empresa_id = $${params.length}`); }
          if (rango && colsV.some(c => c.col === "fecha")) {
            params.push(rango.desde, rango.hasta);
            where.push(`v.fecha BETWEEN $${params.length - 1} AND $${params.length}`);
          }
          const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
          return {
            intent, rango, limiteExplicito,
            sql: `SELECT p.${colNom} AS producto,
                         SUM(vd.${colCantVD})::float AS cantidad,
                         COUNT(DISTINCT vd.venta_id)::int AS ventas
                    FROM ventas_detalle vd
                    JOIN ventas v    ON v.id = vd.venta_id
                    JOIN productos p ON p.id = vd.${colProdVD}
                    ${W}
                GROUP BY p.${colNom}
                ORDER BY cantidad DESC
                   LIMIT ${limTop}`,
            params,
          };
        }
      }
      return null;
    }

    // ─── Top clientes ─────────────────────────────────────────────
    case "top_clientes": {
      if (!s.ventas || !s.clientes) return null;
      const colCli = s.ventas.find(c => /^cliente_id$/i.test(c.col))?.col;
      const colNom = s.clientes.find(c => /^nombre$|^razon_social$/i.test(c.col))?.col;
      if (!colCli || !colNom) return null;
      const where = []; const params = [];
      if (s.ventas.some(c => c.col === "empresa_id")) { params.push(EMP); where.push(`v.empresa_id = $${params.length}`); }
      if (rango && s.ventas.some(c => c.col === "fecha")) {
        params.push(rango.desde, rango.hasta);
        where.push(`v.fecha BETWEEN $${params.length - 1} AND $${params.length}`);
      }
      const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const lim = limiteExplicito || 10;
      return {
        intent, rango, limiteExplicito,
        sql: `SELECT c.${colNom} AS cliente,
                     COUNT(*)::int AS facturas,
                     COALESCE(SUM(v.total),0)::float AS total
                FROM ventas v
                JOIN clientes c ON c.id = v.${colCli}
                ${W}
            GROUP BY c.${colNom}
            ORDER BY total DESC
               LIMIT ${lim}`,
        params,
      };
    }

    // ─── Stock crítico ────────────────────────────────────────────
    case "stock_critico": {
      if (!s.productos) return null;
      const hasMin = s.productos.some(c => c.col === "stock_min");
      const where = []; const params = [];
      if (s.productos.some(c => c.col === "empresa_id")) {
        params.push(EMP); where.push(`empresa_id = $${params.length}`);
      }
      where.push(hasMin ? `stock <= COALESCE(stock_min, 10)` : `stock <= 10`);
      return {
        intent,
        sql: `SELECT id, nombre, stock${hasMin ? ", stock_min" : ""}
                FROM productos
               WHERE ${where.join(" AND ")}
            ORDER BY stock ASC
               LIMIT 50`,
        params, rango: null,
        nota: hasMin ? null : "stock_min no existe en productos — se asume umbral 10.",
      };
    }
  }
  return null;
}

module.exports = { planificar, detectarRango, detectarIntent };
