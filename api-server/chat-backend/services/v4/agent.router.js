// =============================================================
//  v4 — Layer 5: Router inteligente por dominio
// =============================================================
"use strict";

const DOMAINS = {
  sales:      { keywords:["venta","ventas","ingreso","ingresos","vendido"], tables:["ventas","facturas"] },
  purchases:  { keywords:["compra","compras","egreso","egresos"],           tables:["compras"] },
  accounting: { keywords:["contabilidad","balance","libro","mayor","asiento"], tables:[] },
  inventory:  { keywords:["stock","inventario","existencia","almacen"],     tables:["inventario","productos"] },
  tax:        { keywords:["igv","iva","impuesto","impuestos","retencion","tributo"], tables:[] },
  finance:    { keywords:["utilidad","ganancia","rentabilidad","margen","cashflow","flujo"], tables:[] },
  suppliers:  { keywords:["proveedor","proveedores"], tables:["proveedores"] },
  customers:  { keywords:["cliente","clientes","comprador"], tables:["clientes"] },
  payments:   { keywords:["pago","pagos","cobro","cobranza"], tables:["pagos"] },
};

function detectDomain(normalizedText, table) {
  const t = " " + (normalizedText || "") + " ";
  let best = { domain: "generic", hits: 0 };
  for (const [domain, def] of Object.entries(DOMAINS)) {
    let hits = 0;
    for (const kw of def.keywords) if (t.includes(" " + kw + " ")) hits++;
    if (table && def.tables.includes(table)) hits += 2;
    if (hits > best.hits) best = { domain, hits };
  }
  return best.domain;
}

async function route(parsed, agents = {}) {
  const domain = detectDomain(parsed._normText || parsed.input, parsed.table);
  const map = {
    sales:      agents.sales      || agents.ventas,
    purchases:  agents.purchases  || agents.compras,
    accounting: agents.accounting || agents.contabilidad,
    inventory:  agents.inventory  || agents.inventario,
    tax:        agents.tax        || agents.impuestos,
    finance:    agents.finance    || agents.financial,
    suppliers:  agents.suppliers  || agents.proveedores,
    customers:  agents.customers  || agents.clientes,
    payments:   agents.payments,
    generic:    agents.smart      || agents.generic,
  };
  const handler = map[domain];
  if (handler && typeof handler.handle === "function") {
    const r = await handler.handle(parsed);
    return { agent: domain, result: r };
  }
  return { agent: domain, result: null };
}

module.exports = { route, detectDomain, DOMAINS };
