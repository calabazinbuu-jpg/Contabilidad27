// =============================================================
//  v3 — Layer 9: Fallback Inteligente a Agentes
//  Decide a qué agente delegar cuando el engine no resuelve.
// =============================================================
"use strict";

const RULES = [
  { agent: "financial.agent", when: c => ["PROFIT_CALC","TAX_REPORT"].includes(c.intent) },
  { agent: "inventory.agent", when: c => c.table === "inventario" || c.table === "productos" },
  { agent: "ventas.agent",    when: c => c.table === "ventas" || c.table === "facturas" },
  { agent: "compras.agent",   when: c => c.table === "compras" },
  { agent: "clientes.agent",  when: c => c.table === "clientes" },
  { agent: "proveedores.agent", when: c => c.table === "proveedores" },
  { agent: "tesoreria.agent", when: c => c.table === "pagos" || c.table === "tesoreria" },
  { agent: "charla.agent",    when: c => ["GREETING","HELP"].includes(c.intent) },
];

function pickAgent(ctx) {
  for (const r of RULES) {
    try { if (r.when(ctx)) return r.agent; } catch(e){}
  }
  return "generic.sql.agent";
}

async function delegate(ctx, agentsRegistry = {}) {
  const name = pickAgent(ctx);
  const agent = agentsRegistry[name];
  if (!agent || typeof agent.handle !== "function") {
    return { delegated: name, ok: false, motivo: "AGENT_NOT_AVAILABLE" };
  }
  try {
    const data = await agent.handle(ctx);
    return { delegated: name, ok: true, data };
  } catch (e) {
    return { delegated: name, ok: false, motivo: "AGENT_ERROR", error: String(e?.message || e) };
  }
}

module.exports = { pickAgent, delegate, RULES };
