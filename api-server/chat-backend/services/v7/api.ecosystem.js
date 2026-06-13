"use strict";
/**
 * v7 - API Ecosystem
 * Versionado (v1, v2, v3...), router de integraciones externas (bancos, SUNAT, POS)
 * y sistema de webhooks salientes con reintentos y firma HMAC.
 */
const crypto = require("crypto");

function createApiVersionRouter() {
  const versions = new Map();
  function register(version, routes) { versions.set(version, routes); }
  function handle(version, name, ...args) {
    const v = versions.get(version);
    if (!v || !v[name]) throw new Error(`api: ${version}.${name} not found`);
    return v[name](...args);
  }
  function listVersions() { return [...versions.keys()]; }
  return { register, handle, listVersions };
}

function createIntegrationHub() {
  const integrations = {};
  function register(name, adapter) { integrations[name] = adapter; }
  async function call(name, action, payload) {
    const i = integrations[name];
    if (!i || !i[action]) throw new Error(`integration: ${name}.${action} not found`);
    return i[action](payload);
  }
  return { register, call, integrations };
}

function createOutboundWebhooks({ fetcher = fetch, secret = "default", maxRetries = 3 } = {}) {
  const subs = []; // { url, event }
  function subscribe(event, url) { subs.push({ event, url }); }
  function unsubscribe(url) { for (let i = subs.length - 1; i >= 0; i--) if (subs[i].url === url) subs.splice(i, 1); }

  function sign(body) { return crypto.createHmac("sha256", secret).update(body).digest("hex"); }

  async function dispatch(event, payload) {
    const targets = subs.filter((s) => s.event === event || s.event === "*");
    const body = JSON.stringify({ event, payload, at: Date.now() });
    const signature = sign(body);
    const results = [];
    for (const t of targets) {
      let ok = false, err;
      for (let i = 0; i < maxRetries && !ok; i++) {
        try {
          const res = await fetcher(t.url, { method: "POST", headers: { "content-type": "application/json", "x-signature": signature }, body });
          ok = res.ok ?? (res.status >= 200 && res.status < 300);
        } catch (e) { err = e.message; await new Promise((r) => setTimeout(r, 100 * (i + 1))); }
      }
      results.push({ url: t.url, ok, error: err });
    }
    return results;
  }

  return { subscribe, unsubscribe, dispatch, sign, subs };
}

module.exports = { createApiVersionRouter, createIntegrationHub, createOutboundWebhooks };
