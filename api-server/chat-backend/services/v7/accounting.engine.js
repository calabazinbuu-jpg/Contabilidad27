"use strict";
/**
 * v7 - Double Entry Accounting Engine
 * Valida partida doble y genera asientos desde eventos de dominio.
 */
function n(x) { return Number(x) || 0; }

function createAccounting({ tolerance = 0.01, rules = {} } = {}) {
  const defaultRules = {
    "venta.creada": ({ total, igv }) => ([
      { cuenta: "1212_cobrar", debe: total, haber: 0 },
      { cuenta: "7011_ventas", debe: 0, haber: total - igv },
      { cuenta: "4011_igv",    debe: 0, haber: igv },
    ]),
    "compra.creada": ({ total, igv }) => ([
      { cuenta: "6011_compras", debe: total - igv, haber: 0 },
      { cuenta: "4011_igv",     debe: igv,         haber: 0 },
      { cuenta: "4212_pagar",   debe: 0,           haber: total },
    ]),
    "pago.realizado": ({ monto }) => ([
      { cuenta: "4212_pagar",   debe: monto, haber: 0 },
      { cuenta: "1011_caja",    debe: 0,     haber: monto },
    ]),
    "cobro.recibido": ({ monto }) => ([
      { cuenta: "1011_caja",    debe: monto, haber: 0 },
      { cuenta: "1212_cobrar",  debe: 0,     haber: monto },
    ]),
    ...rules,
  };

  function validate(asiento) {
    const debe = asiento.reduce((a, l) => a + n(l.debe), 0);
    const haber = asiento.reduce((a, l) => a + n(l.haber), 0);
    const balanced = Math.abs(debe - haber) <= tolerance;
    return { balanced, debe, haber, diff: debe - haber };
  }

  function generate(eventName, payload) {
    const rule = defaultRules[eventName];
    if (!rule) throw new Error(`accounting: no rule for ${eventName}`);
    const asiento = rule(payload);
    const v = validate(asiento);
    if (!v.balanced) throw new Error(`accounting: unbalanced entry (debe=${v.debe} haber=${v.haber})`);
    return { asiento, ...v, event: eventName };
  }

  function registerRule(eventName, fn) { defaultRules[eventName] = fn; }

  return { validate, generate, registerRule, rules: defaultRules };
}

module.exports = { createAccounting };
