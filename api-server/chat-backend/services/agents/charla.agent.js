const v = require("../response.variator");
const RESP = {
  estado: [
    "😊 Estoy muy bien y listo para ayudarte con tu negocio. ¿Qué necesitas?",
    "🚀 Funcionando al 100%. ¿Quieres revisar ventas, facturas o inventario?",
    "💼 Todo en orden por aquí. ¿En qué puedo ayudarte hoy?",
  ],
  saludo: [
    "👋 ¡Hola! Soy tu asistente empresarial. Pregúntame por ventas, facturas, clientes, inventario, pagos… o por cualquier número del sistema.",
    "🌟 ¡Hey! Listo para ayudarte. ¿Quieres ver tus ventas de hoy, las facturas pendientes o un resumen ejecutivo?",
    "🙋 ¡Buenas! Tengo acceso a todos tus datos. Lánzame una pregunta concreta y te respondo en segundos.",
  ],
  identidad: [
    "🤖 Soy **ChatIA**, tu copiloto empresarial. Vivo dentro de tu sistema y leo en tiempo real ventas, compras, inventario y tesorería para responder lo que necesites.",
    "🧠 Me llamo **ChatIA**. Pienso, sumo, comparo y resumo tu información para que tomes decisiones sin abrir reportes.",
    "💼 Soy una IA de soporte empresarial creada para entender tu negocio: traduzco tus preguntas a consultas y te devuelvo respuestas claras.",
  ],
  gracias: [
    "🙏 ¡Con gusto! ¿Otra pregunta?",
    "✨ ¡A ti! Cuando quieras, dispara la siguiente consulta.",
    "💪 Para eso estoy. Sigamos.",
  ],
  despedida: [
    "👋 ¡Hasta pronto! Aquí te espero cuando quieras revisar más números.",
    "🌙 ¡Nos vemos! Estaré listo cuando vuelvas.",
  ],
  ayuda: [
    "🛠️ Puedo responder cosas como:\n• *¿Cuántas facturas hice hoy?*\n• *¿Cuánto vendí en enero?*\n• *Top 5 clientes del año*\n• *Stock crítico*\n• *Compáreme este mes vs el anterior*\n• *250 + 30* (también hago cálculos).",
    "💡 Lánzame preguntas naturales:\n• *Ventas de ayer*\n• *Facturas pendientes*\n• *¿Quién me debe más?*\n• *Promedio de ventas por mes*\nO un saludo. Lo que sea.",
  ],
  chiste: [
    "😄 ¿Sabes qué le dice un contador a otro? — *Estoy en números rojos… emocionales.*",
    "😂 ¿Por qué la factura fue al psicólogo? — *Porque tenía muchos vencimientos pendientes.*",
    "🤣 Mi balance favorito: el equilibrio entre el café y el deadline.",
  ],
  insulto: [
    "🫶 Tranquilo, estoy aquí para ayudarte. Si algo no salió bien, dime qué esperabas y lo intento de nuevo.",
    "💙 Lamento si no di la respuesta correcta. Reformula tu pregunta y lo arreglamos.",
  ],
  elogio: [
    "😊 ¡Gracias! Hago lo mejor con tus datos. ¿Seguimos?",
    "🚀 ¡Eso me motiva! Pídeme la siguiente consulta.",
  ],
  offtopic: [
    "🧭 Eso no es mi especialidad — yo brillo con datos de tu negocio. ¿Quieres ver ventas, facturas o algún reporte?",
    "🙃 Sobre eso no manejo información, pero sí sé todo lo que pasa en tu sistema. Lánzame una pregunta de negocio.",
  ],
};
module.exports = {
  nombre:"charla",
  async ejecutar({ parsed }) {
    const cat = parsed.charla || "ayuda";
    return { agente:"charla", intent:cat, datos:null, respuesta: v.pick(`ch_${cat}`, RESP[cat] || RESP.ayuda) };
  }
};
