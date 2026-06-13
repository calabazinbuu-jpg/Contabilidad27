"use strict";
/**
 * v7 - AI Agent Layer
 * Equipo de agentes especializados (contable, tributario, financiero, inventario)
 * con router por intent y delegación.
 */
function createAgentTeam({ semantic, kpi, accounting, compliance } = {}) {
  const agents = {
    contable: {
      keywords: ["asiento","contabilidad","libro","cuenta"],
      async handle(query, ctx) {
        if (accounting && ctx.event && ctx.payload) {
          return { agent: "contable", result: accounting.generate(ctx.event, ctx.payload) };
        }
        return { agent: "contable", answer: "Procesando consulta contable", query };
      },
    },
    tributario: {
      keywords: ["igv","iva","impuesto","sunat","tributo"],
      async handle(query, ctx) {
        if (kpi && ctx.ventasBrutas != null) {
          return { agent: "tributario", result: kpi.igvBreakdown({ ventasBrutas: ctx.ventasBrutas, comprasBrutas: ctx.comprasBrutas || 0 }) };
        }
        if (compliance && ctx.invoice) return { agent: "tributario", result: compliance.validateInvoice(ctx.invoice) };
        return { agent: "tributario", answer: "Análisis tributario", query };
      },
    },
    financiero: {
      keywords: ["utilidad","margen","ganancia","flujo","cashflow","ratio"],
      async handle(query, ctx) {
        if (kpi && ctx.snapshot) return { agent: "financiero", result: kpi.snapshot(ctx.snapshot) };
        return { agent: "financiero", answer: "Análisis financiero", query };
      },
    },
    inventario: {
      keywords: ["stock","inventario","existencias","almacen","rotacion"],
      async handle(query, ctx) {
        if (kpi && ctx.costoVentas != null && ctx.inventarioPromedio != null) {
          return { agent: "inventario", result: { rotacion: kpi.rotacionInventario({ costoVentas: ctx.costoVentas, inventarioPromedio: ctx.inventarioPromedio }) } };
        }
        return { agent: "inventario", answer: "Consulta inventario", query };
      },
    },
  };

  function route(query) {
    const tokens = semantic ? semantic.rewrite(query).rewritten : String(query).toLowerCase().split(/\s+/);
    const scores = {};
    for (const [name, agent] of Object.entries(agents)) {
      scores[name] = tokens.reduce((acc, t) => acc + (agent.keywords.includes(t) ? 1 : 0), 0);
    }
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0 ? top[0] : "financiero";
  }

  async function dispatch(query, ctx = {}) {
    const name = route(query);
    return agents[name].handle(query, ctx);
  }

  function register(name, agent) { agents[name] = agent; }

  return { dispatch, route, register, agents };
}

module.exports = { createAgentTeam };
