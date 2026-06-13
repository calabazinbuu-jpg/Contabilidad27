// ─────────────────────────────────────────────────────────────────
//  response.variator.js — Evita repetir la misma respuesta
//  Guarda un cursor por clave temática y rota por las opciones.
// ─────────────────────────────────────────────────────────────────
const usados = new Map();       // clave -> array de índices recientes (max 3)
const MAX_MEM = 3;

function pick(clave, opciones) {
  if (!opciones?.length) return "";
  const recientes = usados.get(clave) || [];
  // Filtra opciones no usadas recientemente
  const candidatos = opciones.map((_,i) => i).filter(i => !recientes.includes(i));
  const pool = candidatos.length ? candidatos : opciones.map((_,i)=>i);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  const nuevos = [...recientes, idx].slice(-MAX_MEM);
  usados.set(clave, nuevos);
  return opciones[idx];
}

function reset(){ usados.clear(); }

module.exports = { pick, reset };
