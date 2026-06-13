const connector = require("../../connectors");
const { explicar } = require("../explain.service");
module.exports = {
  nombre: "contabilidad",
  async ejecutar({ pregunta }) {
    const datos = await connector.query(
      `SELECT
         (SELECT COALESCE(SUM(total),0) FROM ventas WHERE empresa_id=$1
           AND fecha>=date_trunc('month',CURRENT_DATE))::float AS ingresos_mes,
         (SELECT COALESCE(SUM(total),0) FROM compras WHERE empresa_id=$1
           AND fecha>=date_trunc('month',CURRENT_DATE))::float AS gastos_mes`,
      [parseInt(process.env.EMPRESA_ID||"1",10)]);
    datos[0].utilidad_mes = (datos[0].ingresos_mes||0) - (datos[0].gastos_mes||0);
    const respuesta = await explicar({ pregunta, agente:"contabilidad", intent:"utilidad_mes", datos });
    return { agente:"contabilidad", intent:"utilidad_mes", datos, respuesta };
  },
};
