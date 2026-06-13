// =============================================================
//  v4 / index.js — Entrada del Engine PRO MAX v4
// =============================================================
"use strict";

module.exports = {
  ...require("./engine.v4"),
  linguistic:        require("./linguistic.normalizer"),
  globalScore:       require("./global.score"),
  sessionMemory:     require("./session.memory"),
  sqlValidator:      require("./sql.validator"),
  sqlNormalizer:     require("./sql.normalizer"),
  dbErrorHandler:    require("./db.error.handler"),
  queryCache:        require("./query.cache"),
  rateLimiter:       require("./rate.limiter"),
  decisionLog:       require("./decision.versioning"),
  autoRecovery:      require("./auto.recovery"),
  telemetry:         require("./telemetry"),
  agentRouter:       require("./agent.router"),
  dataset:           require("./dataset.erp"),
};
