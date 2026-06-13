"use strict";
/**
 * v7 - Compliance Engine (SUNAT / Perú por defecto)
 * Validación RUC (mod 11), DNI, factura electrónica básica.
 */
function validateRucPeru(ruc) {
  if (!/^\d{11}$/.test(String(ruc))) return { ok: false, reason: "RUC debe tener 11 dígitos" };
  const w = [5,4,3,2,7,6,5,4,3,2];
  const sum = w.reduce((acc, x, i) => acc + x * Number(ruc[i]), 0);
  const r = 11 - (sum % 11);
  const dv = r === 10 ? 0 : r === 11 ? 1 : r;
  return { ok: dv === Number(ruc[10]), tipo: String(ruc).startsWith("20") ? "juridica" : String(ruc).startsWith("10") ? "natural" : "otro" };
}
function validateDniPeru(dni) {
  return { ok: /^\d{8}$/.test(String(dni)) };
}

function validateInvoice(inv, { country = "PE" } = {}) {
  const errors = [];
  if (!inv?.serie || !/^[FB]\w{3}$/.test(inv.serie)) errors.push("serie inválida (ej: F001 o B001)");
  if (!inv?.correlativo || !/^\d{1,8}$/.test(String(inv.correlativo))) errors.push("correlativo inválido");
  if (!inv?.emisor?.ruc || !validateRucPeru(inv.emisor.ruc).ok) errors.push("RUC emisor inválido");
  if (inv?.cliente?.ruc && !validateRucPeru(inv.cliente.ruc).ok) errors.push("RUC cliente inválido");
  if (inv?.cliente?.dni && !validateDniPeru(inv.cliente.dni).ok) errors.push("DNI cliente inválido");
  if (!Array.isArray(inv?.items) || inv.items.length === 0) errors.push("items requeridos");
  const totalCalc = (inv?.items || []).reduce((a, it) => a + Number(it.cantidad) * Number(it.precio), 0);
  if (Math.abs((inv?.total ?? 0) - totalCalc) > 0.01) errors.push(`total no coincide con suma de items (${totalCalc.toFixed(2)})`);
  return { ok: errors.length === 0, errors, country };
}

function createComplianceEngine({ country = "PE" } = {}) {
  return { validateRuc: validateRucPeru, validateDni: validateDniPeru, validateInvoice: (i) => validateInvoice(i, { country }), country };
}

module.exports = { createComplianceEngine, validateRucPeru, validateDniPeru, validateInvoice };
