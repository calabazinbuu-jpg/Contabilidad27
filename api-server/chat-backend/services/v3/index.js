// =============================================================
//  v3 / index.js — Punto de entrada del Engine PRO v3
// =============================================================
"use strict";

module.exports = {
  ...require("./engine.v3"),
  intentNormalizer: require("./intent.normalizer"),
  ambiguity:        require("./ambiguity.detector"),
  contextMemory:    require("./context.memory"),
  entityExtractor:  require("./entity.extractor"),
  dateNormalizer:   require("./date.normalizer.pro"),
  filterBuilder:    require("./filter.builder"),
  sqlSecurity:      require("./sql.security"),
  explainability:   require("./explainability"),
  agentFallback:    require("./agent.fallback"),
  learning:         require("./learning.feedback"),
};
