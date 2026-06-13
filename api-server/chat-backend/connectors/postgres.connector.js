const db = require("../config/db");
const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);

async function q(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows;
}

module.exports = {
  query: (sql, params) => q(sql, params),

  async getVentas({ desde, hasta, sucursalId } = {}) {
    const where = ["empresa_id = $1"];
    const params = [EMP];
    if (desde) { params.push(desde); where.push(`fecha >= $${params.length}`); }
    if (hasta) { params.push(hasta); where.push(`fecha <= $${params.length}`); }
    if (sucursalId) { params.push(sucursalId); where.push(`sucursal_id = $${params.length}`); }
    return q(
      `SELECT COUNT(*)::int AS n_ventas,
              COALESCE(SUM(total),0)::float AS total,
              COALESCE(AVG(total),0)::float AS ticket_promedio
         FROM ventas WHERE ${where.join(" AND ")}`, params);
  },

  async serieVentas({ dias = 30 } = {}) {
    return q(
      `SELECT DATE(fecha) AS dia, SUM(total)::float AS total
         FROM ventas
        WHERE empresa_id=$1 AND fecha >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY 1`, [EMP, dias]);
  },

  async getClientes({ buscar } = {}) {
    if (buscar)
      return q(
        `SELECT * FROM clientes
          WHERE empresa_id=$1 AND LOWER(nombre) LIKE '%'||LOWER($2)||'%'
          ORDER BY nombre LIMIT 50`, [EMP, buscar]);
    return q(`SELECT * FROM clientes WHERE empresa_id=$1 ORDER BY nombre LIMIT 100`, [EMP]);
  },

  async getProveedores() {
    return q(`SELECT * FROM proveedores WHERE empresa_id=$1 ORDER BY nombre`, [EMP]);
  },

  async getFacturas({ estado, desde, hasta } = {}) {
    const where = ["f.empresa_id=$1"]; const params = [EMP];
    if (estado) { params.push(estado); where.push(`f.estado=$${params.length}`); }
    if (desde)  { params.push(desde);  where.push(`f.fecha>=$${params.length}`); }
    if (hasta)  { params.push(hasta);  where.push(`f.fecha<=$${params.length}`); }
    return q(
      `SELECT f.id, f.serie, f.numero, f.fecha, c.nombre AS cliente,
              f.total, f.saldo, f.estado
         FROM facturas f LEFT JOIN clientes c ON c.id=f.cliente_id
        WHERE ${where.join(" AND ")} ORDER BY f.fecha DESC LIMIT 200`, params);
  },

  async getProductos({ bajoStock } = {}) {
    if (bajoStock)
      return q(
        `SELECT * FROM productos
          WHERE empresa_id=$1 AND stock <= stock_min ORDER BY stock ASC`, [EMP]);
    return q(`SELECT * FROM productos WHERE empresa_id=$1 ORDER BY nombre`, [EMP]);
  },

  async getInventario() {
    return q(
      `SELECT nombre, stock, stock_min,
              CASE WHEN stock<=stock_min THEN 'crítico'
                   WHEN stock<=stock_min*2 THEN 'bajo' ELSE 'ok' END AS estado
         FROM productos WHERE empresa_id=$1 ORDER BY stock ASC`, [EMP]);
  },

  async getTesoreria() {
    return q(
      `SELECT nombre, banco, moneda, saldo::float
         FROM cuentas_bancarias WHERE empresa_id=$1`, [EMP]);
  },

  async getRankingClientes({ orden = "desc", limite = 5 } = {}) {
    const ord = orden === "asc" ? "ASC" : "DESC";
    return q(
      `SELECT c.id, c.nombre, COALESCE(SUM(v.total),0)::float AS total_compras,
              COUNT(v.id)::int AS n_ventas
         FROM clientes c
         LEFT JOIN ventas v ON v.cliente_id=c.id
        WHERE c.empresa_id=$1
        GROUP BY c.id, c.nombre
        ORDER BY total_compras ${ord} NULLS LAST
        LIMIT $2`, [EMP, limite]);
  },

  async getRankingProductos({ orden = "desc", limite = 5 } = {}) {
    const ord = orden === "asc" ? "ASC" : "DESC";
    return q(
      `SELECT producto, SUM(cantidad)::int AS unidades, SUM(total)::float AS ingresos
         FROM ventas WHERE empresa_id=$1
        GROUP BY producto ORDER BY unidades ${ord} LIMIT $2`, [EMP, limite]);
  },

  async getCuentasPorCobrar() {
    return q(
      `SELECT c.nombre AS cliente, SUM(f.saldo)::float AS debe,
              COUNT(*)::int AS facturas_pendientes
         FROM facturas f JOIN clientes c ON c.id=f.cliente_id
        WHERE f.empresa_id=$1 AND f.estado IN ('pendiente','parcial')
        GROUP BY c.nombre ORDER BY debe DESC`, [EMP]);
  },

  async getCuentasPorPagar() {
    return q(
      `SELECT p.nombre AS proveedor, SUM(c.total)::float AS debemos
         FROM compras c JOIN proveedores p ON p.id=c.proveedor_id
        WHERE c.empresa_id=$1 AND c.estado='pendiente'
        GROUP BY p.nombre ORDER BY debemos DESC`, [EMP]);
  },

  async getResumenNegocio() {
    const [hoy, mes, mesAnt, cxc, cxp, stock] = await Promise.all([
      q(`SELECT COALESCE(SUM(total),0)::float t FROM ventas WHERE empresa_id=$1 AND DATE(fecha)=CURRENT_DATE`, [EMP]),
      q(`SELECT COALESCE(SUM(total),0)::float t FROM ventas WHERE empresa_id=$1 AND fecha>=date_trunc('month',CURRENT_DATE)`, [EMP]),
      q(`SELECT COALESCE(SUM(total),0)::float t FROM ventas WHERE empresa_id=$1
           AND fecha>=date_trunc('month',CURRENT_DATE - INTERVAL '1 month')
           AND fecha< date_trunc('month',CURRENT_DATE)`, [EMP]),
      q(`SELECT COALESCE(SUM(saldo),0)::float t FROM facturas WHERE empresa_id=$1 AND estado IN ('pendiente','parcial')`, [EMP]),
      q(`SELECT COALESCE(SUM(total),0)::float t FROM compras WHERE empresa_id=$1 AND estado='pendiente'`, [EMP]),
      q(`SELECT COUNT(*)::int n FROM productos WHERE empresa_id=$1 AND stock<=stock_min`, [EMP]),
    ]);
    return [{
      ventas_hoy: hoy[0].t, ventas_mes: mes[0].t, ventas_mes_anterior: mesAnt[0].t,
      cuentas_por_cobrar: cxc[0].t, cuentas_por_pagar: cxp[0].t,
      productos_bajo_stock: stock[0].n,
    }];
  },
};
