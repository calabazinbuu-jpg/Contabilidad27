"use strict";
/**
 * v6 - Event Bus
 * Arquitectura orientada a eventos para el ERP.
 *   bus.on("venta.creada", async (payload) => { ... })
 *   bus.emit("venta.creada", { ventaId, total })
 *
 * Soporta handlers async, captura de errores aislada por handler,
 * y reintentos opcionales.
 */

function createEventBus({ logger = console, defaultRetries = 0 } = {}) {
  const listeners = new Map();
  const history = [];
  const MAX_HISTORY = 500;

  function on(event, handler, opts = {}) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push({ handler, retries: opts.retries ?? defaultRetries, name: opts.name || handler.name || "anon" });
    return () => off(event, handler);
  }

  function off(event, handler) {
    const arr = listeners.get(event);
    if (!arr) return;
    listeners.set(event, arr.filter((l) => l.handler !== handler));
  }

  async function emit(event, payload = {}) {
    const arr = listeners.get(event) || [];
    const entry = { event, payload, at: Date.now(), handlers: [] };
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();

    const results = await Promise.all(
      arr.map(async ({ handler, retries, name }) => {
        let attempt = 0;
        let lastErr;
        while (attempt <= retries) {
          try {
            const out = await handler(payload, { event });
            entry.handlers.push({ name, ok: true, attempt });
            return { name, ok: true, result: out };
          } catch (err) {
            lastErr = err;
            attempt++;
          }
        }
        logger.error?.(`event.bus: handler "${name}" failed for "${event}":`, lastErr?.message);
        entry.handlers.push({ name, ok: false, error: lastErr?.message });
        return { name, ok: false, error: lastErr?.message };
      })
    );
    return { event, dispatched: results.length, results };
  }

  function getHistory(eventFilter) {
    return eventFilter ? history.filter((h) => h.event === eventFilter) : [...history];
  }

  function clear() {
    listeners.clear();
    history.length = 0;
  }

  return { on, off, emit, getHistory, clear, listeners };
}

/** Wiring por defecto del dominio ERP (ventas → inventario, contabilidad, impuestos). */
function attachErpDomain(bus, handlers = {}) {
  if (handlers.onSaleUpdateInventory) bus.on("venta.creada", handlers.onSaleUpdateInventory, { name: "inventory.sync" });
  if (handlers.onSalePostAccounting) bus.on("venta.creada", handlers.onSalePostAccounting, { name: "accounting.post" });
  if (handlers.onSaleCalcTax) bus.on("venta.creada", handlers.onSaleCalcTax, { name: "tax.calc" });
  if (handlers.onPurchaseUpdateInventory) bus.on("compra.creada", handlers.onPurchaseUpdateInventory, { name: "inventory.in" });
  if (handlers.onPurchasePostAccounting) bus.on("compra.creada", handlers.onPurchasePostAccounting, { name: "accounting.purchase" });
  return bus;
}

module.exports = { createEventBus, attachErpDomain };
