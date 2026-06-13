// ─────────────────────────────────────────────────────────────────
//  hybrid/sql.safety.js   (v10)
//  Guard de seguridad SQL — bloquea operaciones destructivas.
//
//  PROHIBIDO: DROP, TRUNCATE, DELETE sin WHERE, ALTER destructivo,
//             GRANT/REVOKE, CREATE USER, COPY ... PROGRAM
//  PERMITIDO: SELECT, INSERT, UPDATE con WHERE,
//             ALTER TABLE ... ADD COLUMN, CREATE TABLE IF NOT EXISTS
// ─────────────────────────────────────────────────────────────────

const PROHIBIDOS = [
  /\bDROP\s+(TABLE|SCHEMA|DATABASE|COLUMN|INDEX|FUNCTION|VIEW|SEQUENCE)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\s+[a-zA-Z0-9_."]+\s+DROP\b/i,
  /\bALTER\s+TABLE\s+[a-zA-Z0-9_."]+\s+RENAME\b/i,
  /\bGRANT\b|\bREVOKE\b/i,
  /\bCREATE\s+(USER|ROLE)\b/i,
  /\bCOPY\b.+\bPROGRAM\b/i,
];

function esSeguro(sql) {
  const q = String(sql || "");
  for (const rx of PROHIBIDOS) {
    if (rx.test(q)) return { ok: false, motivo: `bloqueado por patrón ${rx}` };
  }
  // DELETE sin WHERE
  if (/\bDELETE\s+FROM\b/i.test(q) && !/\bWHERE\b/i.test(q)) {
    return { ok: false, motivo: "DELETE sin WHERE" };
  }
  // UPDATE sin WHERE
  if (/\bUPDATE\s+[a-zA-Z0-9_."]+\s+SET\b/i.test(q) && !/\bWHERE\b/i.test(q)) {
    return { ok: false, motivo: "UPDATE sin WHERE" };
  }
  return { ok: true };
}

function asegurar(sql) {
  const r = esSeguro(sql);
  if (!r.ok) {
    const err = new Error(`SQL bloqueado: ${r.motivo}`);
    err.code = "SQL_UNSAFE";
    throw err;
  }
  return sql;
}

module.exports = { esSeguro, asegurar };
