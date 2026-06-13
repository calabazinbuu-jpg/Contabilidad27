const connector = require("../../connectors");
const { explicar } = require("../explain.service");
module.exports = {
  nombre: "inventario",
  async ejecutar({ pregunta, parsed }) {
    const bajo = /bajo|critic|minim|agot|falt/.test(parsed.texto);
    const datos = bajo
      ? await connector.getProductos({ bajoStock: true })
      : await connector.getInventario();
    const respuesta = await explicar({ pregunta, agente:"inventario",
      intent: bajo ? "stock_bajo" : "inventario_general", datos });
    return { agente:"inventario", intent: bajo?"stock_bajo":"inventario_general", datos, respuesta };
  },
};
