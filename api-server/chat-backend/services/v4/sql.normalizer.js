// =============================================================
//  v4 — Layer 6: Normalizador de SQL output
// =============================================================
"use strict";

const KEYWORDS = [
  "select","from","where","group by","order by","having","limit","offset",
  "and","or","not","in","like","between","is null","is not null",
  "inner join","left join","right join","full join","join","on","as",
  "sum","avg","min","max","count","distinct","desc","asc","union","union all",
];

function normalizeSql(sql) {
  if (!sql) return sql;
  let s = String(sql).replace(/\s+/g, " ").trim();
  // uppercase keywords
  for (const kw of KEYWORDS) {
    const re = new RegExp("\\b" + kw.replace(/\s+/g, "\\s+") + "\\b", "gi");
    s = s.replace(re, kw.toUpperCase());
  }
  // standardize date format quoted YYYY-MM-DD
  s = s.replace(/'(\d{4})\/(\d{2})\/(\d{2})'/g, "'$1-$2-$3'");
  // alias: "tbl t" -> "tbl AS t"
  s = s.replace(/\bFROM\s+([a-zA-Z_][\w]*)\s+([a-z])\b/g, "FROM $1 AS $2");
  // trailing semicolon
  if (!s.endsWith(";")) s += ";";
  return s;
}

module.exports = { normalizeSql };
