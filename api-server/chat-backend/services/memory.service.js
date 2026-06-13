// ── Gestión de sesiones y mensajes de chat (usuarios registrados) ──
const db = require("../config/db");

async function nuevaSesion(usuarioId, titulo = "Nueva conversación") {
  const r = await db.query(
    `INSERT INTO sesiones_chat (usuario_id, titulo)
     VALUES ($1, $2)
     RETURNING id, titulo, creado_en`,
    [usuarioId, titulo]
  );
  return r.rows[0];
}

async function listarSesiones(usuarioId) {
  const r = await db.query(
    `SELECT id, titulo, actualizado
       FROM sesiones_chat
      WHERE usuario_id = $1
      ORDER BY actualizado DESC
      LIMIT 50`,
    [usuarioId]
  );
  return r.rows;
}

async function historial(sesionId, limite = 20) {
  const r = await db.query(
    `SELECT rol, agente, contenido, datos, creado_en
       FROM mensajes_chat
      WHERE sesion_id = $1
      ORDER BY creado_en ASC
      LIMIT $2`,
    [sesionId, limite]
  );
  return r.rows;
}

async function guardar(sesionId, rol, contenido, agente = null, datos = null) {
  await db.query(
    `INSERT INTO mensajes_chat (sesion_id, rol, agente, contenido, datos)
     VALUES ($1, $2, $3, $4, $5)`,
    [sesionId, rol, agente, contenido, datos ? JSON.stringify(datos) : null]
  );
  await db.query(
    `UPDATE sesiones_chat SET actualizado = CURRENT_TIMESTAMP WHERE id = $1`,
    [sesionId]
  );
}

async function renombrarSesion(sesionId, titulo) {
  await db.query(
    `UPDATE sesiones_chat SET titulo = $1 WHERE id = $2`,
    [titulo, sesionId]
  );
}

module.exports = { nuevaSesion, listarSesiones, historial, guardar, renombrarSesion };
