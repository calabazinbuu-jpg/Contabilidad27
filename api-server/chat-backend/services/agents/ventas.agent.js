const connector = require("../../connectors");
const { explicar } = require("../explain.service");

module.exports = {
  nombre: "ventas",
  async ejecutar({ pregunta, parsed, contexto }) {
    const { rango } = parsed;

    // Comparativo mes vs mes pasado
    if (parsed.contiene("comparar") || /respecto|mes pasado|mes anterior|compara/.test(parsed.texto)) {
      const hoy   = new Date();
      const desdeM = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const desdeP = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const hastaP = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
      const [a] = await connector.getVentas({ desde: desdeM, hasta: hoy });
      const [b] = await connector.getVentas({ desde: desdeP, hasta: hastaP });
      const diff = (a.total || 0) - (b.total || 0);
      const pct  = b.total ? (diff / b.total) * 100 : 0;
      const datos = { actual: a.total, anterior: b.total, diff, pct };
      const respuesta = await explicar({ pregunta, agente: "ventas", intent: "comparativo_mes", datos, rango });
      return { agente: "ventas", intent: "comparativo_mes", datos, respuesta };
    }

    // Ranking de productos más vendidos
    if (parsed.contiene("ranking_top") || /producto|m[aá]s vendido|estrella/.test(parsed.texto)) {
      try {
        const datos = await connector.getRankingProductos({ limite: parsed.limite || 5 });
        const respuesta = await explicar({ pregunta, agente: "ventas", intent: "ranking_productos", datos, rango });
        return { agente: "ventas", intent: "ranking_productos", datos, respuesta };
      } catch (_) {}
    }

    // Total ventas por rango
    const datos = await connector.getVentas({ desde: rango?.desde, hasta: rango?.hasta });
    const respuesta = await explicar({ pregunta, agente: "ventas", intent: "total_ventas", datos, rango });
    return { agente: "ventas", intent: "total_ventas", datos, respuesta };
  },
};
