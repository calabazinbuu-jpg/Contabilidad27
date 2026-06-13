// =============================================================
//  v5 / index.js — Engine ENTERPRISE
// =============================================================
"use strict";

module.exports = {
  ...require("./engine.v5"),
  decisionEngine:    require("./decision.engine"),
  adversarial:       require("./adversarial.tests"),
  autoTuner:         require("./score.autotuner"),
  ambiguityDeep:     require("./ambiguity.deep"),
  querySplitter:     require("./query.splitter"),
  sqlSemantic:       require("./sql.semantic.validator"),
  knowledgeGraph:    require("./knowledge.graph"),
  smartCache:        require("./smart.cache"),
  circuitBreaker:    require("./circuit.breaker"),
  humanLoop:         require("./human.loop"),
  observability:     require("./observability"),
  performance:       require("./performance"),
  security:          require("./security.hardening"),
  selfDiagnosis:     require("./self.diagnosis"),
};
