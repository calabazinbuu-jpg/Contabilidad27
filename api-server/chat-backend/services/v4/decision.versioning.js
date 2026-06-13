// =============================================================
//  v4 — Layer 10: Versionado de decisiones
// =============================================================
"use strict";

const fs = require("fs");
const path = require("path");

class DecisionLog {
  constructor({ filePath = null, max = 1000, version = "v4" } = {}) {
    this.filePath = filePath; this.max = max; this.version = version;
    this.entries = [];
    if (filePath && fs.existsSync(filePath)) {
      try { this.entries = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch {}
    }
  }
  record({ input, intent, table, sql, params, score, agent, error }) {
    const entry = {
      input, intent, table, sql, params, score, agent, error,
      version: this.version, timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.shift();
    if (this.filePath) {
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
      } catch {}
    }
    return entry;
  }
  recent(n = 20) { return this.entries.slice(-n); }
  all() { return this.entries.slice(); }
}

module.exports = { DecisionLog };
