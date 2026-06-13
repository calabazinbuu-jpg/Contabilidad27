// Helper para exportar un set de filas a Excel y devolver URL pública
const ExcelJS = require("exceljs");
const fs      = require("fs");
const path    = require("path");

const EXPORT_DIR = path.join(__dirname, "..", "..", "exportaciones");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

async function exportar(entidad, rows) {
  try {
    const wb = new ExcelJS.Workbook();
    const safe = (entidad || "datos").toString().slice(0, 28);
    const ws = wb.addWorksheet(safe);
    if (rows && rows.length) {
      ws.columns = Object.keys(rows[0]).map(k => ({ header: k, key: k, width: 18 }));
      rows.forEach(r => ws.addRow(r));
      ws.getRow(1).font = { bold: true };
    } else {
      ws.addRow(["Sin datos"]);
    }
    const fname = `${safe}_${Date.now()}.xlsx`;
    await wb.xlsx.writeFile(path.join(EXPORT_DIR, fname));
    return `/exportaciones/${fname}`;
  } catch (e) {
    console.warn("excel.helper error:", e.message);
    return null;
  }
}

module.exports = { exportar };
