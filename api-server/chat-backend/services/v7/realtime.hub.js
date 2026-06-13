"use strict";
/**
 * v7 - Realtime Streaming Engine
 * WebSocket-friendly hub: pub/sub por canal con backpressure ligero.
 */
const { EventEmitter } = require("events");

function createRealtimeHub() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const channels = new Map();

  function publish(channel, event) {
    const payload = { channel, event, at: Date.now() };
    const arr = channels.get(channel);
    if (arr) arr.push(payload);
    emitter.emit(channel, payload);
    emitter.emit("*", payload);
  }
  function subscribe(channel, handler) {
    if (!channels.has(channel)) channels.set(channel, []);
    emitter.on(channel, handler);
    return () => emitter.off(channel, handler);
  }

  /** Wrapper para usar con un WebSocket server (ws): attachToWs(ws, channels[]). */
  function attachToWs(ws, subs = []) {
    const unsubs = subs.map((ch) => subscribe(ch, (msg) => {
      try { ws.send(JSON.stringify(msg)); } catch { /* socket cerrado */ }
    }));
    ws.on?.("close", () => unsubs.forEach((u) => u()));
  }

  return { publish, subscribe, attachToWs, emitter };
}

module.exports = { createRealtimeHub };
