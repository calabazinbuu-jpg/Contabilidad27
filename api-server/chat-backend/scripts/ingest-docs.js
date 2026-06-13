#!/usr/bin/env node
// Ingesta archivos .txt/.md de un directorio a documentos_rag.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const rag = require("../services/rag.service");

(async () => {
  const dir = process.argv[2];
  if (!dir) { console.log("uso: node scripts/ingest-docs.js <directorio>"); process.exit(1); }
  const files = fs.readdirSync(dir).filter((f) => /\.(md|txt)$/i.test(f));
  for (const f of files) {
    const contenido = fs.readFileSync(path.join(dir, f), "utf8");
    const id = await rag.ingest(f, "manual", contenido, []);
    console.log(`✅ ${f} → doc ${id}`);
  }
  process.exit(0);
})();
