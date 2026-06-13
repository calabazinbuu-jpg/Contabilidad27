"use strict";
/**
 * v7 - Distributed Event Bus
 * Adaptador unificado con backends pluggables: memory (default),
 * redis-streams, kafka. Mantiene API consistente con v6 event.bus.
 */
function createDistributedBus({ backend = "memory", driver, logger = console } = {}) {
  if (backend === "memory" || !driver) {
    const { createEventBus } = require("../v6/event.bus");
    return createEventBus({ logger });
  }
  // driver must implement: publish(topic, msg), subscribe(topic, handler)
  const handlers = new Map();
  return {
    on(topic, handler) {
      if (!handlers.has(topic)) {
        handlers.set(topic, []);
        driver.subscribe(topic, async (msg) => {
          for (const h of handlers.get(topic) || []) {
            try { await h(msg); } catch (e) { logger.error?.(`bus.${backend}: handler error ${e.message}`); }
          }
        });
      }
      handlers.get(topic).push(handler);
    },
    async emit(topic, payload) {
      await driver.publish(topic, payload);
      return { topic, backend };
    },
  };
}

/** Driver stub para Redis Streams (XADD/XREAD); el usuario debe inyectar el cliente. */
function redisStreamsDriver(redis) {
  return {
    async publish(topic, msg) { await redis.xadd(topic, "*", "data", JSON.stringify(msg)); },
    subscribe(topic, handler) {
      let lastId = "$";
      (async function loop() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const res = await redis.xread("BLOCK", 5000, "STREAMS", topic, lastId);
            if (res) for (const [, entries] of res) for (const [id, kv] of entries) {
              lastId = id;
              const idx = kv.indexOf("data");
              await handler(JSON.parse(kv[idx + 1]));
            }
          } catch { await new Promise((r) => setTimeout(r, 1000)); }
        }
      })();
    },
  };
}

module.exports = { createDistributedBus, redisStreamsDriver };
