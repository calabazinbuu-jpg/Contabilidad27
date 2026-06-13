const rag = require("../rag.service");
const ai = require("../../config/ai");
module.exports = {
  nombre: "soporte",
  async ejecutar({ pregunta }) {
    const hits = await rag.buscar(pregunta, 3);
    let respuesta;
    if (ai.enabled() && hits.length) {
      const ctx = hits.map((h) => `[${h.titulo}] ${h.chunk}`).join("\n\n");
      respuesta = await ai.chat([
        { role:"system", content:"Eres soporte del software. Responde claro y breve usando el contexto." },
        { role:"user", content:`Pregunta: ${pregunta}\n\nContexto:\n${ctx}` },
      ]) || hits[0]?.chunk;
    } else {
      respuesta = hits.length
        ? `📚 ${hits[0].titulo}\n\n${hits[0].chunk}`
        : "No encontré información en los manuales. Intenta reformular o ingesta documentación con `npm run ingest`.";
    }
    return { agente:"soporte", intent:"rag", datos: hits, respuesta };
  },
};
