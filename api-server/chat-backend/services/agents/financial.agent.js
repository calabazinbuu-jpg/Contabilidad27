// ─────────────────────────────────────────────────────────────────
// financial.agent.js — Agente financiero BI offline
// FIX v8.3: reintento sin empresa_id con SQL y params renumerados
// ─────────────────────────────────────────────────────────────────
const db          = require("../../config/db");
const planner     = require("../query.planner");
const retry       = require("../sql.retry");
const validator   = require("../result.validator");
const rules       = require("../intelligence.rules");

const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);

function fmt(n) { return rules.fmt(n); }

function humanizar(intent, rows, extra = {}) {
  if (!rows || !rows.length) return "📭 No hay datos para esta consulta.";
  switch (intent) {
    case "ventas_por_mes":
    case "compras_por_mes":
    case "gastos_por_mes": {
      const tit = { ventas_por_mes: "💰 Ventas por mes",
                    compras_por_mes: "🧾 Compras por mes",
                    gastos_por_mes: "📉 Gastos por mes" }[intent];
      const lines = rows.map(r => {
        const mes = String(r.mes).slice(0, 7);
        return `• ${mes} — ${r.n} reg · $ ${fmt(r.total)}`;
      });
      const total = rows.reduce((a, r) => a + Number(r.total || 0), 0);
      return [tit, ...lines, `────────────────`, `Σ Total: $ ${fmt(total)}`].join("\n");
    }
    case "total_ventas":
    case "total_compras":
    case "total_gastos": {
      const r = rows[0]; const label = intent.replace("total_", "");
      return `📊 ${label.toUpperCase()}: ${r.n} registros · Total $ ${fmt(r.total)}`;
    }
    case "top_productos": {
      const lines = rows.map((r, i) => `${i + 1}. ${r.producto} — ${fmt(r.cantidad)} u · ${r.ventas} ventas`);
      return [`🏆 Top productos más vendidos`, ...lines].join("\n");
    }
    case "top_clientes": {
      const lines = rows.map((r, i) => `${i + 1}. ${r.cliente} — $ ${fmt(r.total)} (${r.facturas} fact.)`);
      return [`🏆 Top clientes`, ...lines].join("\n");
    }
    case "stock_critico": {
      const lines = rows.map((r, i) => `${i + 1}. ${r.nombre} — stock ${r.stock}${r.stock_min != null ? ` / min ${r.stock_min}` : ""}`);
      const head = `📦 Productos con stock crítico (${rows.length})`;
      return [head, ...lines, extra.nota ? `_${extra.nota}_` : ""].filter(Boolean).join("\n");
    }
  }
  return `📊 ${rows.length} resultados.`;
}

/**
 * Quita el filtro empresa_id del SQL y renumera los $N restantes.
 * Maneja 3 casos:
 *   WHERE empresa_id = $1 AND ...  → WHERE ...  (y renumera $2→$1, $3→$2, …)
 *   AND empresa_id = $1            → (elimina)
 *   WHERE empresa_id = $1          → (elimina WHERE)
 */
function quitarEmpresaFiltro(sql, params) {
  // Eliminar filtro de empresa_id en sus distintas posiciones
  let sql2 = sql
    // Caso 1: WHERE empresa_id = $1 AND → WHERE
    .replace(/WHERE\s+\w*\.?empresa_id\s*=\s*\$1\s+AND\s+/i, "WHERE ")
    // Caso 2: AND empresa_id = $1 (al final o en medio)
    .replace(/\s+AND\s+\w*\.?empresa_id\s*=\s*\$1\b/i, "")
    // Caso 3: WHERE empresa_id = $1 (único filtro)
    .replace(/WHERE\s+\w*\.?empresa_id\s*=\s*\$1\b/i, "");

  // Renumerar $2→$1, $3→$2, … (el $1 era empresa_id que se eliminó)
  sql2 = sql2.replace(/\$(\d+)/g, (_, n) => `$${Number(n) - 1}`);

  // Params sin el primer elemento (empresa_id)
  const params2 = params.slice(1);

  return { sql: sql2.replace(/\s+/g, " ").trim(), params: params2 };
}

async function ejecutar({ pregunta }) {
  // 1) Si pregunta sobre utilidad/margen/ganancia → cálculo obligatorio
  if (/utilidad|ganancia|margen|rentab/i.test(pregunta)) {
    const rango = planner.detectarRango(pregunta);
    const data = await rules.calcularUtilidad(db, EMP, rango);
    return {
      agente: "financial",
      intent: "utilidad",
      datos: [data],
      respuesta: rules.formatoFinanciero(data),
    };
  }

  // 2) Planificador: construye SQL con agregaciones correctas
  const plan = await planner.planificar(pregunta);
  if (plan) {
    try {
      const r = await db.query(plan.sql, plan.params);
      let rows = r.rows;

      // Validación de coherencia
      const tablas = validator.extraerTablas(plan.sql);
      const chk = await validator.validar({ rows, tablasReferidas: tablas });
      let nota = plan.nota || null;

      if (!chk.ok) {
        // Reintento sin filtro empresa_id — con SQL y params correctamente renumerados
        if (plan.params.length && /empresa_id\s*=\s*\$1/i.test(plan.sql)) {
          try {
            const { sql: sql2, params: params2 } = quitarEmpresaFiltro(plan.sql, plan.params);
            const r2 = await db.query(sql2, params2);
            if (!validator.pareceVacio(r2.rows)) {
              rows = r2.rows;
              nota = "Filtro empresa_id quitado: no había coincidencias con la empresa actual.";
            }
          } catch (retryErr) {
            console.warn("financial.agent retry sin empresa_id falló:", retryErr.message);
          }
        }
        if (validator.pareceVacio(rows)) {
          return {
            agente: "financial", intent: plan.intent, datos: rows, sql: plan.sql,
            respuesta: `📭 ${chk.motivo}`,
          };
        }
      }

      return {
        agente: "financial", intent: plan.intent, datos: rows, sql: plan.sql,
        respuesta: humanizar(plan.intent, rows, { nota }),
      };
    } catch (e) {
      // 3) Autocorrección con LLM
      const out = await retry.ejecutarConRetry(pregunta, plan.sql);
      if (out.ok) {
        return {
          agente: "financial", intent: plan.intent + "_retry",
          datos: out.rows, sql: out.sql,
          respuesta: humanizar(plan.intent, out.rows),
        };
      }
      return {
        agente: "financial", intent: "error", datos: null,
        respuesta: `⚠️ No pude ejecutar la consulta: ${out.error}`,
      };
    }
  }

  // 4) Sin plan → devuelve null para que el controller delegue al LLM
  return { agente: "financial", intent: "delegar", datos: null, respuesta: null };
}

module.exports = { nombre: "financial", ejecutar };
