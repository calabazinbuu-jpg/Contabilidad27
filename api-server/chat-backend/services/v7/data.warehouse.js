"use strict";
/**
 * v7 - Data Warehouse / ETL + SCD Type 2 + snapshots diarios + versioning.
 */
function createDataWarehouse({ runQuery } = {}) {
  /** SCD Type 2: cerrar versión vigente, insertar nueva. */
  async function upsertScd2(table, naturalKey, row, { keyCol = "natural_key", validFrom = "valid_from", validTo = "valid_to", current = "is_current" } = {}) {
    if (!runQuery) throw new Error("etl: runQuery required");
    const now = new Date().toISOString();
    await runQuery(
      `UPDATE ${table} SET ${current}=false, ${validTo}=$1 WHERE ${keyCol}=$2 AND ${current}=true`,
      [now, naturalKey]
    );
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    await runQuery(
      `INSERT INTO ${table} (${cols.join(",")}, ${validFrom}, ${current}) VALUES (${placeholders}, $${cols.length + 1}, true)`,
      [...cols.map((c) => row[c]), now]
    );
  }

  /** Pipeline ETL: extract → transform → load. */
  async function runPipeline({ extract, transform = (x) => x, load }) {
    const raw = await extract();
    const data = Array.isArray(raw) ? raw.map(transform) : transform(raw);
    return load(data);
  }

  /** Snapshot diario de una tabla a tabla histórica. */
  async function dailySnapshot(srcTable, histTable, { dateCol = "snapshot_date" } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    await runQuery(`INSERT INTO ${histTable} SELECT *, $1 AS ${dateCol} FROM ${srcTable}`, [today]);
    return { snapshotted: today };
  }

  /** Data versioning simple: guarda blob versionado por entidad. */
  const versions = new Map();
  function snapshotVersion(entity, id, payload) {
    const k = `${entity}:${id}`;
    if (!versions.has(k)) versions.set(k, []);
    const arr = versions.get(k);
    arr.push({ v: arr.length + 1, at: Date.now(), payload: JSON.parse(JSON.stringify(payload)) });
    return arr[arr.length - 1];
  }
  function getVersions(entity, id) { return versions.get(`${entity}:${id}`) || []; }

  return { upsertScd2, runPipeline, dailySnapshot, snapshotVersion, getVersions };
}

module.exports = { createDataWarehouse };
