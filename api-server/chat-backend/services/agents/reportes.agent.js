const connector = require("../../connectors");
const { explicar } = require("../explain.service");
module.exports = {
  nombre: "reportes",
  async ejecutar({ pregunta }) {
    const datos = await connector.getResumenNegocio();
    const respuesta = await explicar({ pregunta, agente:"reportes", intent:"resumen", datos });
    return { agente:"reportes", intent:"resumen", datos, respuesta };
  },
};
