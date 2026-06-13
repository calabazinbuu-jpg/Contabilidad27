// ─────────────────────────────────────────────────────────────────
//  explain.service.js — Convierte datos en explicaciones ejecutivas
//  Online:  GPT redacta resumen ejecutivo + recomendaciones.
//  Offline: plantillas enriquecidas con análisis automático.
// ─────────────────────────────────────────────────────────────────
const ai = require("../config/ai");

const fmtMoney = (n) =>
  "S/ " + (n == null ? 0 : Number(n)).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

function pct(a, b) {
  if (!b) return null;
  return ((Number(a) - Number(b)) / Math.abs(Number(b))) * 100;
}

function tendencia(p) {
  if (p == null) return "";
  if (p > 10)  return `📈 subió ${p.toFixed(1)}%`;
  if (p > 0)   return `↗ subió ${p.toFixed(1)}%`;
  if (p < -10) return `📉 bajó ${Math.abs(p).toFixed(1)}%`;
  if (p < 0)   return `↘ bajó ${Math.abs(p).toFixed(1)}%`;
  return "→ sin cambios";
}

// ── PLANTILLAS OFFLINE ─────────────────────────────────────────
function plantilla({ agente, intent, datos, rango }) {
  const r = rango ? ` (${rango.tipo.replace(/_/g," ")})` : "";

  if (!datos || (Array.isArray(datos) && !datos.length))
    return `📭 No encontré datos para **${agente}**${r}. Verifica que haya registros en el sistema.`;

  // Ventas: total
  if (agente === "ventas" && Array.isArray(datos) && datos[0]?.total !== undefined) {
    const d = datos[0];
    const total    = fmtMoney(d.total);
    const nVentas  = fmtNum(d.n_ventas);
    const ticket   = fmtMoney(d.ticket_promedio);
    return [
      `💰 **Ventas${r}: ${total}**`,
      `• Número de ventas: ${nVentas}`,
      `• Ticket promedio: ${ticket}`,
      d.total > 0
        ? `\n💡 Mantén el ritmo. Con este ticket promedio, necesitas ${Math.ceil(1000/Number(d.ticket_promedio||1))} ventas más para alcanzar un siguiente umbral de referencia.`
        : `\n⚠️ Sin ventas${r}. Revisa si hay pedidos pendientes de registrar.`
    ].join("\n");
  }

  // Ventas: comparativo
  if (intent === "comparativo_mes") {
    const { actual, anterior, diff, pct: p } = datos;
    const dir  = tendencia(p);
    const linea = diff >= 0
      ? `✅ Estás **${fmtMoney(Math.abs(diff))}** por encima del mes pasado.`
      : `⚠️ Estás **${fmtMoney(Math.abs(diff))}** por debajo del mes pasado.`;
    return [
      `📊 **Comparativo de ventas**`,
      `• Este mes: **${fmtMoney(actual)}**`,
      `• Mes anterior: **${fmtMoney(anterior)}**`,
      `• Diferencia: ${dir}`,
      linea,
    ].join("\n");
  }

  // Tesorería: cuentas por cobrar
  if (agente === "tesoreria" && intent === "cuentas_por_cobrar") {
    const total = datos.reduce((s, x) => s + Number(x.debe || 0), 0);
    const top   = datos.slice(0, 5).map((x, i) => `${i+1}. **${x.cliente}** — ${fmtMoney(x.debe)}`).join("\n");
    const venc  = datos.filter(x => x.vencida).length;
    return [
      `📤 **Cuentas por cobrar: ${fmtMoney(total)}**`,
      `• ${datos.length} clientes con saldo pendiente`,
      venc ? `• ⚠️ ${venc} facturas vencidas` : "",
      `\n**Top deudores:**\n${top}`,
      `\n💡 Gestiona primero los clientes con mayor deuda para mejorar tu flujo de caja.`,
    ].filter(Boolean).join("\n");
  }

  // Tesorería: cuentas por pagar
  if (agente === "tesoreria" && intent === "cuentas_por_pagar") {
    const total = datos.reduce((s, x) => s + Number(x.monto || 0), 0);
    const top   = datos.slice(0, 5).map((x, i) => `${i+1}. **${x.proveedor}** — ${fmtMoney(x.monto)}`).join("\n");
    return [
      `📥 **Cuentas por pagar: ${fmtMoney(total)}**`,
      `• ${datos.length} proveedores pendientes de pago`,
      `\n**Próximos a vencer:**\n${top}`,
      `\n💡 Prioriza los vencimientos más cercanos para evitar intereses o bloqueos.`,
    ].join("\n");
  }

  // Inventario
  if (agente === "inventario") {
    const criticos = datos.filter(x => x.estado === "crítico" || Number(x.stock) <= Number(x.stock_min));
    const bajos    = datos.filter(x => x.estado === "bajo");
    if (criticos.length) {
      const list = criticos.slice(0, 5).map(x =>
        `• **${x.nombre}** — stock: ${x.stock} / mínimo: ${x.stock_min}`
      ).join("\n");
      return [
        `⚠️ **${criticos.length} productos en stock crítico**`,
        list,
        bajos.length ? `\n🟡 También hay ${bajos.length} productos en nivel bajo.` : "",
        `\n💡 Genera órdenes de compra para los críticos antes de que se agoten.`,
      ].filter(Boolean).join("\n");
    }
    return `✅ **Inventario en niveles normales** (${datos.length} productos revisados).\n${
      bajos.length ? `🟡 ${bajos.length} productos en nivel bajo, monitorea su rotación.` : "Todo en orden."}`;
  }

  // Reportes: resumen ejecutivo
  if (agente === "reportes" && intent === "resumen") {
    const d = Array.isArray(datos) ? datos[0] : datos;
    const p = pct(d.ventas_mes, d.ventas_mes_anterior);
    return [
      `📊 **Resumen ejecutivo del negocio**`,
      ``,
      `**Ventas**`,
      `• Hoy: ${fmtMoney(d.ventas_hoy)}`,
      `• Este mes: ${fmtMoney(d.ventas_mes)} ${tendencia(p)}`,
      `• Mes anterior: ${fmtMoney(d.ventas_mes_anterior)}`,
      ``,
      `**Finanzas**`,
      `• Por cobrar: ${fmtMoney(d.cuentas_por_cobrar)}`,
      `• Por pagar:  ${fmtMoney(d.cuentas_por_pagar)}`,
      ``,
      `**Operaciones**`,
      `• Productos bajo stock: ${d.productos_bajo_stock}`,
      d.productos_bajo_stock > 0 ? `⚠️ Revisa tu inventario crítico.` : `✅ Inventario en orden.`,
    ].join("\n");
  }

  // Ranking clientes
  if (datos[0]?.nombre && datos[0]?.total_compras !== undefined) {
    const top = datos.slice(0, 8).map((x, i) =>
      `${i+1}. **${x.nombre}** — ${fmtMoney(x.total_compras)} (${fmtNum(x.n_ventas)} ventas)`
    ).join("\n");
    const totalTop = datos.slice(0,3).reduce((s,x) => s + Number(x.total_compras||0), 0);
    const totalAll = datos.reduce((s,x) => s + Number(x.total_compras||0), 0);
    const concentracion = totalAll ? ((totalTop/totalAll)*100).toFixed(0) : 0;
    return [
      `🏆 **Ranking de clientes**`,
      top,
      `\n💡 Tus 3 principales clientes concentran el **${concentracion}%** de las ventas.`,
      concentracion > 60
        ? `⚠️ Alta concentración — considera diversificar tu cartera de clientes.`
        : `✅ Buena diversificación de clientes.`,
    ].join("\n");
  }

  // Ranking productos
  if (datos[0]?.producto !== undefined) {
    const top = datos.slice(0, 8).map((x, i) =>
      `${i+1}. **${x.producto}** — ${fmtNum(x.unidades)} uds (${fmtMoney(x.ingresos)})`
    ).join("\n");
    return `🏆 **Ranking de productos**\n${top}\n\n💡 Asegura stock suficiente de tus productos estrella.`;
  }

  // Facturas
  if (agente === "facturacion") {
    if (Array.isArray(datos) && datos[0]?.total !== undefined) {
      const d = datos[0];
      return `🧾 **Facturación${r}: ${fmtMoney(d.total)}**\n• ${fmtNum(d.n_facturas)} facturas emitidas\n• Promedio por factura: ${fmtMoney(d.promedio)}`;
    }
    const pend = datos.filter(x => x.estado === "pendiente").length;
    const ven  = datos.filter(x => x.estado === "vencida").length;
    return [
      `🧾 **${datos.length} facturas**`,
      pend ? `• ${pend} pendientes de cobro` : "",
      ven  ? `• ⚠️ ${ven} vencidas — acción requerida` : "",
    ].filter(Boolean).join("\n");
  }

  // ─── Lista de proveedores ────────────────────────────────────
  if (agente === "proveedores" || intent === "lista_proveedores") {
    const LIM = 10;
    const muestra = datos.slice(0, LIM);
    const sobran  = datos.length - muestra.length;
    const nombreCol = Object.keys(datos[0]).find(k => /nombre|razon_social|name/i.test(k)) || Object.keys(datos[0])[1] || Object.keys(datos[0])[0];
    const rucCol    = Object.keys(datos[0]).find(k => /ruc|rut|nit|cuit|tax|documento/i.test(k));
    const telCol    = Object.keys(datos[0]).find(k => /telefon|tel|phone|celular/i.test(k));
    const lineas = muestra.map((row, i) => {
      let linea = `${i + 1}. **${row[nombreCol] || "—"}**`;
      if (rucCol && row[rucCol]) linea += ` — RUC: ${row[rucCol]}`;
      if (telCol && row[telCol]) linea += ` · Tel: ${row[telCol]}`;
      return linea;
    });
    const tip = sobran > 0
      ? `\n… y ${sobran} más. 💡 Escribe **"proveedores en excel"** para descargar la lista completa.`
      : "";
    return [`📦 **${datos.length} proveedor${datos.length !== 1 ? "es" : ""}**${r}`, ...lineas, tip].filter(Boolean).join("\n");
  }

  // ─── Lista de clientes ───────────────────────────────────────
  if (agente === "clientes" || intent === "lista_clientes") {
    const LIM = 10;
    const muestra = datos.slice(0, LIM);
    const sobran  = datos.length - muestra.length;
    const nombreCol = Object.keys(datos[0]).find(k => /nombre|name/i.test(k)) || Object.keys(datos[0])[1] || Object.keys(datos[0])[0];
    const rucCol    = Object.keys(datos[0]).find(k => /ruc|rut|nit|cuit|tax|documento/i.test(k));
    const emailCol  = Object.keys(datos[0]).find(k => /email|correo/i.test(k));
    const lineas = muestra.map((row, i) => {
      let linea = `${i + 1}. **${row[nombreCol] || "—"}**`;
      if (rucCol && row[rucCol])     linea += ` — RUC: ${row[rucCol]}`;
      if (emailCol && row[emailCol]) linea += ` · ${row[emailCol]}`;
      return linea;
    });
    const tip = sobran > 0
      ? `\n… y ${sobran} más. 💡 Escribe **"clientes en excel"** para descargar la lista completa.`
      : "";
    return [`👥 **${datos.length} cliente${datos.length !== 1 ? "s" : ""}**${r}`, ...lineas, tip].filter(Boolean).join("\n");
  }

  // ─── Lista genérica (cualquier entidad no mapeada) ───────────
  if (Array.isArray(datos) && datos.length > 0) {
    const LIM = 10;
    const muestra = datos.slice(0, LIM);
    const sobran  = datos.length - muestra.length;
    const keys = Object.keys(datos[0]);
    const nombreCol = keys.find(k => /nombre|name|descripcion|titulo/i.test(k)) || keys[1] || keys[0];
    const lineas = muestra.map((row, i) => `${i + 1}. ${row[nombreCol] != null ? row[nombreCol] : JSON.stringify(row).slice(0, 80)}`);
    const tip = sobran > 0 ? `\n… y ${sobran} más. 💡 Escribe **"en excel"** para descargar la lista completa.` : "";
    return [`📋 **${datos.length} resultados**${r}`, ...lineas, tip].filter(Boolean).join("\n");
  }

  // Genérico última instancia
  return "ℹ️ " + JSON.stringify(datos).slice(0, 600);
}

// ── SISTEMA IA ─────────────────────────────────────────────────
const SYS_PROMPT = `Eres un asesor empresarial experto en finanzas, ventas y operaciones para PYMEs latinoamericanas.
Responde en español, de forma clara, directa y ejecutiva.
Usa markdown: **negrita** para cifras y puntos clave, listas con •, máximo 8 líneas.
Siempre incluye 1-2 recomendaciones prácticas y accionables al final.
CRÍTICO: No inventes números. Usa solo los datos JSON que se te proporcionan.`;

async function explicar({ pregunta, agente, intent, datos, rango, ragHits = [] }) {
  const base = plantilla({ agente, intent, datos, rango });

  if (ai.enabled()) {
    try {
      const ctx = [
        `Pregunta del usuario: "${pregunta}"`,
        `Agente: ${agente} | Intent: ${intent}`,
        rango ? `Período: ${rango.tipo}` : "",
        `Datos verificados (JSON): ${JSON.stringify(datos).slice(0, 4000)}`,
        ragHits.length ? `Contexto de documentos:\n${ragHits.map(r => "- " + r.chunk).join("\n")}` : "",
        `Resumen base calculado:\n${base}`,
        `\nMejora la explicación con análisis, contexto de negocio y recomendaciones prácticas.`,
      ].filter(Boolean).join("\n");

      const out = await ai.chat([
        { role: "system", content: SYS_PROMPT },
        { role: "user",   content: ctx },
      ], { temperature: 0.25 });
      return out || base;
    } catch (_) {}
  }
  return base;
}

module.exports = { explicar, plantilla, fmtMoney };
