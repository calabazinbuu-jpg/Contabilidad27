// =============================================================
//  v5 — Layer 15: Self-diagnosis mode
//  Detecta módulos/tablas con error_rate alto y auto-ajusta.
// =============================================================
"use strict";

function diagnose({ tuner, breaker, tracer }) {
  const findings = [];
  const recommendations = [];

  // 1) tablas con error rate alto
  if (tuner) {
    const snap = tuner.snapshot();
    for (const [key, s] of Object.entries(snap.stats || {})) {
      if (s.total >= 5 && s.rate > 0.2) {
        findings.push({ kind: "high_error_rate", key, rate: s.rate, total: s.total });
        recommendations.push(`Aumentar peso de keywords para "${key}" (error_rate=${s.rate})`);
      }
    }
  }

  // 2) breakers abiertos
  if (breaker) {
    for (const [k, v] of Object.entries(breaker.snapshot())) {
      if (v.open) {
        findings.push({ kind: "circuit_open", key: k, rate: v.rate });
        recommendations.push(`Agente "${k}" deshabilitado temporalmente (cooldown).`);
      }
    }
  }

  // 3) heatmap de errores por módulo
  if (tracer) {
    const heat = tracer.heatmap();
    for (const [mod, count] of Object.entries(heat)) {
      if (count >= 5) {
        findings.push({ kind: "module_errors", module: mod, count });
        recommendations.push(`Revisar módulo "${mod}" — ${count} errores recientes.`);
      }
    }
  }

  const status = findings.length === 0 ? "healthy"
              : findings.length < 3 ? "degraded" : "critical";

  return {
    status,
    findings,
    recommendations,
    autoApplied: tuner ? tuner.tune() : null,
    at: new Date().toISOString(),
  };
}

module.exports = { diagnose };
