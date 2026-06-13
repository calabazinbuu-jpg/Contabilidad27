const connector = require("../../connectors");
const { explicar } = require("../explain.service");
module.exports = {
  nombre: "compras",
  async ejecutar({ pregunta, parsed }) {
    const { rango } = parsed;
    const datos = await connector.query(
      `SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float total
         FROM compras WHERE empresa_id=$1
           AND ($2::date IS NULL OR fecha>=$2)
           AND ($3::date IS NULL OR fecha<=$3)`,
      [parseInt(process.env.EMPRESA_ID||"1",10),
       rango?.desde || null, rango?.hasta || null]);
    const respuesta = await explicar({ pregunta, agente:"compras", intent:"total_compras", datos, rango });
    return { agente:"compras", intent:"total_compras", datos, respuesta };
  },
};
