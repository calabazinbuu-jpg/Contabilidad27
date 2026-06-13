"use strict";
/**
 * v7 - Observability Enterprise
 * Spans tipo OpenTelemetry, correlation IDs, SLA tracking.
 */
const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function createTracer({ slaMs = 1000, onSpan } = {}) {
  const spans = [];
  const slaViolations = [];

  function startSpan(name, attrs = {}) {
    const parent = als.getStore();
    const span = { id: uid(), traceId: parent?.traceId || uid(), parentId: parent?.id, name, attrs, startedAt: Date.now(), events: [] };
    return {
      span,
      end(extra = {}) {
        span.endedAt = Date.now();
        span.durationMs = span.endedAt - span.startedAt;
        Object.assign(span.attrs, extra);
        spans.push(span);
        if (span.durationMs > slaMs) slaViolations.push({ name, durationMs: span.durationMs, traceId: span.traceId });
        onSpan?.(span);
      },
      addEvent(msg, data) { span.events.push({ msg, data, at: Date.now() }); },
    };
  }

  async function withSpan(name, fn, attrs) {
    const s = startSpan(name, attrs);
    return als.run({ traceId: s.span.traceId, id: s.span.id }, async () => {
      try { const out = await fn(s); s.end({ ok: true }); return out; }
      catch (e) { s.end({ ok: false, error: e.message }); throw e; }
    });
  }

  function currentTraceId() { return als.getStore()?.traceId; }
  function getSpans(traceId) { return traceId ? spans.filter((s) => s.traceId === traceId) : [...spans]; }
  function errorHeatmap() {
    const map = {};
    for (const s of spans) if (s.attrs?.ok === false) map[s.name] = (map[s.name] || 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }
  function slaReport() { return { total: spans.length, violations: slaViolations.length, items: slaViolations.slice(-50) }; }

  return { startSpan, withSpan, currentTraceId, getSpans, errorHeatmap, slaReport, spans };
}

module.exports = { createTracer };
