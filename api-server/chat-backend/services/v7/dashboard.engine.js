"use strict";
/**
 * v7 - Real-time Dashboard Engine
 * Calcula KPIs en vivo + streaming de cambios via subscripciones.
 */
const { EventEmitter } = require("events");

function createDashboardEngine({ kpi, intervalMs = 5000 } = {}) {
  const emitter = new EventEmitter();
  const widgets = new Map(); // id -> { compute, lastValue }
  let timer = null;

  function register(id, compute) { widgets.set(id, { compute, lastValue: undefined }); }
  function unregister(id) { widgets.delete(id); }

  async function tick() {
    for (const [id, w] of widgets.entries()) {
      try {
        const value = await w.compute({ kpi });
        if (JSON.stringify(value) !== JSON.stringify(w.lastValue)) {
          w.lastValue = value;
          emitter.emit("update", { id, value, at: Date.now() });
        }
      } catch (e) { emitter.emit("error", { id, error: e.message }); }
    }
  }

  function start() { if (!timer) timer = setInterval(tick, intervalMs); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function subscribe(handler) { emitter.on("update", handler); return () => emitter.off("update", handler); }
  function snapshot() {
    const out = {};
    for (const [id, w] of widgets.entries()) out[id] = w.lastValue;
    return out;
  }

  return { register, unregister, start, stop, subscribe, snapshot, tick, emitter };
}

module.exports = { createDashboardEngine };
