// router.service.js — FIX sintaxis (faltaba } en bloque "como estas")
const { chat } = require("../config/ai");

function fastRouter(texto) {
  const t = (texto || "").toLowerCase();
  if (/\b(como estas|cómo estás|como te va|cómo te va|como andas|cómo andas)\b/.test(t))
    return "¡Muy bien! 😊 Estoy listo para ayudarte con tu negocio. ¿Qué necesitas?";
  if (/\b(hola|buenas|hey|hello)\b/.test(t))
    return "¡Hola! 😊 ¿En qué te ayudo hoy?";
  if (t.includes("qué puedes hacer") || t.includes("ayuda"))
    return "Puedo ayudarte con ventas, clientes, facturas, pagos y reportes.";
  if (t.includes("eres una ia") || t.includes("qué eres"))
    return "Sí 😊 soy una IA de ayuda para tu sistema empresarial.";
  return null;
}

async function generalRouter(texto) {
  try {
    const r = await chat([
      { role: "system", content: "Responde corto y claro en español." },
      { role: "user", content: texto },
    ]);
    return r || "Puedo ayudarte con tu sistema.";
  } catch {
    return "No pude procesar tu consulta.";
  }
}

function esEmpresa(texto) {
  const t = (texto || "").toLowerCase();
  return /\b(venta|cliente|factura|pago|inventario|stock|producto|articulo|excel|exportar|proveedor|compra)\b/.test(t);
}

async function router(texto, smartAgent) {
  const fast = fastRouter(texto);
  if (fast) return fast;
  if (esEmpresa(texto)) {
    try {
      const result = await smartAgent({ pregunta: texto, parsed: {} });
      return result.respuesta || "No pude generar respuesta.";
    } catch (err) {
      console.log("SMART ERROR:", err.message);
      return "Error consultando el sistema.";
    }
  }
  return await generalRouter(texto);
}

module.exports = { router };
