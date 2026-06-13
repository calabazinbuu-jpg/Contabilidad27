// Carga dinámica del conector activo según .env CONNECTOR
const name = process.env.CONNECTOR || "postgres";
let connector;
try {
  connector = require(`./${name}.connector.js`);
  console.log(`🔌 Conector activo: ${name}`);
} catch (e) {
  console.error(`No se pudo cargar conector "${name}":`, e.message);
  connector = require("./postgres.connector.js");
}
module.exports = connector;
