// proveedores.agent.js v3 — LIMIT 10, proyección de columnas, Excel
const db      = require("../../config/db");
const schema  = require("../schema.introspect");
const ExcelJS = require("exceljs");
const fs      = require("fs");
const path    = require("path");
const textNumbers = require("../textNumbers.service");

const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);
const EXPORT_DIR = path.join(__dirname, "..", "..", "exportaciones");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const LIMIT_CHAT = 10;
const LIMIT_SQL  = 50;

function quiereExcel(t) {
  return /\b(excel|xlsx|exportar|export[aá]me|exp[oó]rtame|descargar|descarga|hoja\s+de\s+c[aá]lculo)\b/i.test(t);
}

function detectarColumnas(pregunta) {
  const t = (pregunta || "").toLowerCase();
  const out = [];
  if (/\bnombre\b/.test(t))                                             out.push("nombre");
  if (/\b(correo|email|e-?mail|mail)\b/.test(t))                       out.push("correo", "email");
  if (/\b(tel[eé]fono|telefono|celular|m[oó]vil|whatsapp)\b/.test(t)) out.push("telefono", "celular");
  if (/\b(ruc|documento|dni)\b/.test(t))                               out.push("ruc", "documento");
  if (/\b(ciudad|direcci[oó]n)\b/.test(t))                             out.push("ciudad", "direccion");
  if (/\b(saldo|deuda)\b/.test(t))                                     out.push("saldo");
  return out;
}

function _fmt(v, col) {
  if (v == null) return "—";
  if (["saldo","total","monto"].includes(col)) return `S/ ${Number(v).toFixed(2)}`;
  return String(v);
}

function humanizar(datos, sobran, colsPedidas) {
  if (!datos.length) return `📭 No hay proveedores registrados en la base de datos.`;
  const s0 = datos[0];
  const nombreKey = Object.keys(s0).find(k => /nombre|razon_social|name/i.test(k))
                 || Object.keys(s0).find(k => k !== "id") || "id";

  const lineas = datos.map((row, i) => {
    let base = `${i + 1}. **${row[nombreKey] ?? "(sin nombre)"}**`;
    const extras = colsPedidas
      .filter(c => row[c] != null && c !== nombreKey)
      .map(c => `${c}: ${_fmt(row[c], c)}`);
    if (extras.length) base += ` — ${extras.join(" · ")}`;
    return base;
  });

  const total = datos.length + sobran;
  const header = `📦 **${total} proveedor${total !== 1 ? "es" : ""}** — mostrando ${datos.length}:`;
  const tip = sobran > 0
    ? `\n… y ${sobran} más. 💡 Escribe **"proveedores en excel"** para descargar la lista completa.`
    : colsPedidas.length
      ? ""
      : `\n💡 Tip: agrega "con correo", "con teléfono" o "con RUC", o pide **"en excel"**.`;

  return [header, ...lineas].join("\n") + tip;
}

async function generarExcel(filas, nombre) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombre);
  if (filas.length) {
    ws.columns = Object.keys(filas[0]).map(k => ({ header: k, key: k, width: 20 }));
    filas.forEach(f => ws.addRow(f));
    ws.getRow(1).font = { bold: true };
  } else { ws.addRow(["Sin datos"]); }
  const fname = `${nombre}_${Date.now()}.xlsx`;
  await wb.xlsx.writeFile(path.join(EXPORT_DIR, fname));
  return `/exportaciones/${fname}`;
}

module.exports = {
  nombre: "proveedores",
  async ejecutar({ pregunta }) {
    try {
      const s = await schema.getSchema();
      const tablas = ["proveedores", "proveedor", "suppliers", "vendors"];
      let tabla = null;
      for (const t of tablas) { if (s[t]) { tabla = t; break; } }
      if (!tabla) {
        return { agente: "proveedores", intent: "sin_tabla", datos: null,
          respuesta: "📭 No hay tabla de proveedores en la base de datos." };
      }

      const colDef   = s[tabla] || [];
      const tieneEmp = colDef.some(c => /empresa_id/.test(c.col || c.column_name));
      const where    = tieneEmp ? `WHERE empresa_id = $1` : "";
      const params   = tieneEmp ? [EMP] : [];

      if (quiereExcel(pregunta)) {
        const r = await db.query(`SELECT * FROM ${tabla} ${where} ORDER BY 1`, params);
        if (!r.rows.length) return { agente: "proveedores", intent: "export_proveedores", datos: null,
          respuesta: "📭 No hay proveedores para exportar." };
        const url = await generarExcel(r.rows, "proveedores");
        return {
          agente: "proveedores", intent: "export_proveedores", datos: null,
          respuesta: `📥 **Excel listo.** Haz clic en el botón para descargar (${r.rows.length} proveedores).`,
          archivo: url, tablaPrincipal: tabla, ofrecerExcel: true,
        };
      }

      const colsPedidas = detectarColumnas(pregunta);

      const limite = textNumbers.detectarLimite(pregunta, 500) || LIMIT_SQL;
      let r = await db.query(
        `SELECT * FROM ${tabla} ${where} ORDER BY 1 LIMIT ${limite}`,
        params
      );
      if (!r.rows.length && where) {
        const r2 = await db.query(`SELECT * FROM ${tabla} ORDER BY 1 LIMIT ${limite}`);
        if (r2.rows.length) r = r2;
      }
      const rows   = r.rows;
      const muestra = rows.slice(0, textNumbers.detectarLimite(pregunta, 500) || LIMIT_CHAT);
      const sobran  = rows.length - muestra.length;
      const hayMas  = sobran > 0;

      const resCols = colsPedidas.length
        ? muestra.map(row => {
            const out = {};
            for (const c of colsPedidas) {
              const realKey = Object.keys(row).find(k => k.toLowerCase().includes(c)) || c;
              if (row[realKey] != null) out[realKey] = row[realKey];
            }
            if (!Object.keys(out).length) return row;
            return out;
          })
        : muestra;

      return {
        agente: "proveedores", intent: "lista_proveedores",
        datos: resCols, tablaPrincipal: tabla,
        hayMas, ofrecerExcel: hayMas,
        respuesta: humanizar(resCols, sobran, colsPedidas),
      };

    } catch (err) {
      return { agente: "proveedores", intent: "error", datos: null,
        respuesta: `⚠️ Error consultando proveedores: ${err.message}` };
    }
  },
};
