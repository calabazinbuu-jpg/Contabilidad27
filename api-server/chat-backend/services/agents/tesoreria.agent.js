const connector = require("../../connectors");
const { explicar } = require("../explain.service");

module.exports = {
  nombre: "tesoreria",
  async ejecutar({ pregunta, parsed }) {
    // Cuentas por cobrar
    if (/cobrar|me deben|cxc|cartera|por cobrar|deben/.test(parsed.texto)) {
      const datos = await connector.getCuentasPorCobrar();
      const respuesta = await explicar({ pregunta, agente: "tesoreria", intent: "cuentas_por_cobrar", datos });
      return { agente: "tesoreria", intent: "cuentas_por_cobrar", datos, respuesta };
    }
    // Cuentas por pagar
    if (/pagar|debo|cxp|por pagar|les debo/.test(parsed.texto)) {
      const datos = await connector.getCuentasPorPagar?.() || [];
      const respuesta = await explicar({ pregunta, agente: "tesoreria", intent: "cuentas_por_pagar", datos });
      return { agente: "tesoreria", intent: "cuentas_por_pagar", datos, respuesta };
    }
    // Saldo en caja/bancos
    if (/caja|banco|saldo|efectivo|liquidez|flujo/.test(parsed.texto)) {
      const datos = await connector.getSaldoBancos?.() || [];
      const respuesta = await explicar({ pregunta, agente: "tesoreria", intent: "saldo_bancos", datos });
      return { agente: "tesoreria", intent: "saldo_bancos", datos, respuesta };
    }
    // Default: resumen tesorería
    const datos = await connector.getCuentasPorCobrar();
    const respuesta = await explicar({ pregunta, agente: "tesoreria", intent: "cuentas_por_cobrar", datos });
    return { agente: "tesoreria", intent: "cuentas_por_cobrar", datos, respuesta };
  },
};
