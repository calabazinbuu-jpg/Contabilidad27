const NUMEROS = {
  un: 1, uno: 1, una: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintidós: 22, veintitres: 23, veintitrés: 23, veinticuatro: 24, veinticinco: 25,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100,
};

const ORDINALES = {
  primer: 1, primero: 1, primera: 1, segundos: 2, segundo: 2, segunda: 2,
  tercero: 3, tercera: 3, tercer: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5,
  sexto: 6, sexta: 6, septimo: 7, séptimo: 7, septima: 7, séptima: 7, octavo: 8,
  octava: 8, noveno: 9, novena: 9, decimo: 10, décimo: 10, decima: 10, décima: 10,
};

function normalizar(s = "") {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenNumero(token) {
  const t = normalizar(token);
  if (/^\d{1,4}$/.test(t)) return parseInt(t, 10);
  if (NUMEROS[t] != null) return NUMEROS[t];
  if (ORDINALES[t] != null) return ORDINALES[t];
  return null;
}

function detectarLimite(texto, max = 500) {
  const t = normalizar(texto);
  const n = "(?:\\d{1,4}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|treinta|cuarenta|cincuenta|cien|primer|primero|primera|segundo|segunda|tercero|tercera|cuarto|quinta|quinto|sexto|septimo|octavo|noveno|decimo)";
  const patrones = [
    new RegExp(`\\btop\\s+(${n})\\b`),
    new RegExp(`\\b(?:solo|solamente|unicamente|dame|lista|listar|muestra|muestrame|ver|trae|traeme|ensename)\\s+(?:los|las|mis|mi)?\\s*(${n})\\b`),
    new RegExp(`\\b(?:los|las|primeros|primeras)\\s+(${n})\\b`),
    new RegExp(`\\b(?:ultimos|ultimas|ultimo|ultima|pasados|pasadas)\\s+(${n})\\b`),
    new RegExp(`\\b(${n})\\s+(?:mejores?|mayores?|menores?|peores?|primeros?|primeras?|ultimos?|ultimas?)\\b`),
    new RegExp(`\\b(${n})\\s+(?:dias?|semanas?|mes(?:es)?|anos?|años?)\\b`),
    new RegExp(`\\b(${n})\\s+(?:proveedores?|abastecedores?|suppliers?|vendors?|clientes?|productos?|facturas?|boletas?|ventas?|compras?|pagos?|items?|registros?|pedidos?|cotizaciones?)\\b`),
  ];
  for (const re of patrones) {
    const m = t.match(re);
    const val = m && tokenNumero(m[1]);
    if (val && val > 0) return Math.min(val, max);
  }
  return null;
}

function detectarOrdinal(texto) {
  const t = normalizar(texto);
  const m = t.match(/\b(primer|primero|primera|segundo|segunda|tercero|tercera|tercer|cuarto|cuarta|quinto|quinta|sexto|sexta|septimo|septima|octavo|octava|noveno|novena|decimo|decima)\b/);
  return m ? tokenNumero(m[1]) : null;
}

module.exports = { normalizar, detectarLimite, detectarOrdinal, tokenNumero };