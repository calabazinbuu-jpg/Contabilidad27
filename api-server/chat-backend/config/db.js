const { Pool } = require("pg");

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });
} else {
  pool = new Pool({
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 20,
    idleTimeoutMillis: 30000,
  });
}

pool.on("error", (e) => console.warn("PG pool error (non-fatal):", e.message));

const originalQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  try {
    return await originalQuery(...args);
  } catch (e) {
    console.warn("DB query error (non-fatal):", e.message);
    return { rows: [], rowCount: 0 };
  }
};

module.exports = pool;
