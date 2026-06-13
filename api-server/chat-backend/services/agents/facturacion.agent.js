const connector = require("../../connectors");
const { explicar } = require("../explain.service");
module.exports = {
  nombre: "facturacion",
  async ejecutar({ pregunta, parsed }) {
    const estado = /pendiente|por cobrar/.test(parsed.texto) ? "pendiente"
                 : /pagad/.test(parsed.texto) ? "pagada"
                 : /anulad/.test(parsed.texto) ? "anulada" : null;
    const datos = await connector.getFacturas({
      estado, desde: parsed.rango?.desde, hasta: parsed.rango?.hasta,
    });
    const respuesta = await explicar({ pregunta, agente:"facturacion",
      intent: estado ? `facturas_${estado}` : "facturas_listado", datos, rango: parsed.rango });
    return { agente:"facturacion", intent: estado ? `facturas_${estado}` : "facturas_listado", datos, respuesta };
  },
};
