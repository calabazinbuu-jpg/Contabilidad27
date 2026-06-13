"use strict";
/**
 * v7 - Storage Architecture
 * Router OLTP/OLAP + cold storage histórico + compresión simple.
 */
const zlib = require("zlib");

function createStorageRouter({ oltp, olap, cold } = {}) {
  function pickRunner(sql) {
    if (/\b(GROUP\s+BY|ROLLUP|CUBE|WINDOW|AVG\(|SUM\(|COUNT\()/i.test(sql) && olap) return olap;
    return oltp;
  }
  async function query(sql, params = []) {
    const runner = pickRunner(sql);
    if (!runner) throw new Error("storage.router: no runner configured");
    return runner(sql, params);
  }
  async function archive(rows) {
    if (!cold) throw new Error("storage.router: cold storage adapter required");
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify(rows)));
    return cold.put(`archive-${Date.now()}.json.gz`, buf);
  }
  function compress(rows) { return zlib.gzipSync(Buffer.from(JSON.stringify(rows))); }
  function decompress(buf) { return JSON.parse(zlib.gunzipSync(buf).toString()); }

  return { query, archive, compress, decompress, pickRunner };
}

module.exports = { createStorageRouter };
