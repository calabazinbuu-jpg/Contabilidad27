// ─────────────────────────────────────────────────────────────────
//  services/reglas.engine.js
//
//  Motor de REGLAS AUTOMÁTICAS — respuesta inmediata sin IA.
//  Modo: REGLAS (🟢)
//
//  Uso: saludos, comandos del sistema, ayuda, menú, acciones rápidas.
//  Garantía: nunca llama a IA, BD ni internet. Siempre responde < 1 ms.
// ─────────────────────────────────────────────────────────────────

// ── Reglas: [regex, respuesta_fn | string] ────────────────────────
const REGLAS = [
  // ─── Saludos ───────────────────────────────────────────────────
  {
    rx: /^\s*(hola|hey|hi\b|ey\b|buenas?|buenos?\s+(d[ií]as?|tardes?|noches?))\s*[!.?]*\s*$/i,
    r: () => {
      const h = new Date().getHours();
      const saludo = h < 12 ? "¡Buenos días" : h < 19 ? "¡Buenas tardes" : "¡Buenas noches";
      return `${saludo}! 👋 Soy **NEXUS**, tu asistente empresarial. ¿En qué te ayudo hoy?\n\nPuedo ayudarte con **ventas, facturas, clientes, inventario, contabilidad** y más. Escribe \`menú\` para ver todas las opciones.`;
    },
  },
  // ─── Despedidas ────────────────────────────────────────────────
  {
    rx: /^\s*(adi[oó]s|hasta\s+(luego|pronto|ma[ñn]ana|mañana)|chao|bye|nos\s+vemos|hasta\s+la\s+vista)\s*[!.?]*\s*$/i,
    r: "¡Hasta luego! 👋 Si necesitas algo más, aquí estaré. ¡Que tengas un excelente día!",
  },
  // ─── Agradecimientos ───────────────────────────────────────────
  {
    rx: /^\s*(gracias|muchas\s+gracias|te\s+lo\s+agradezco|perfecto|excelente|genial|muy\s+bien|ok\s*$|listo\s*$|de\s+acuerdo)\s*[!.?]*\s*$/i,
    r: "¡Con gusto! 😊 ¿Hay algo más en lo que pueda ayudarte?",
  },
  // ─── Menú principal ────────────────────────────────────────────
  {
    rx: /^\s*(men[uú]|opciones?|qu[eé]\s+puedes?\s+hacer|funciones?|capacidades?|ayuda|help|en\s+qu[eé]\s+me\s+ayudas?|qu[eé]\s+sabes?\s+hacer)\s*[!.?]*\s*$/i,
    r: `📋 **MENÚ DE NEXUS — Asistente Empresarial**

🗄️ **BASE DE DATOS (ERP)**
• \`ventas de hoy\` — ventas del día
• \`facturas pendientes\` — facturas por cobrar
• \`listar clientes\` — ver todos los clientes
• \`stock bajo\` — productos con poco inventario
• \`crear cliente [nombre]\` — registrar nuevo cliente

💰 **CONTABILIDAD & FINANZAS**
• \`qué es el IGV\` — explicación del impuesto
• \`cómo calcular el IGV\` — fórmula y ejemplos
• \`diferencia entre débito y crédito\`
• \`cómo hacer un balance general\`

🌐 **DATOS EN TIEMPO REAL**
• \`dólar hoy en Perú\` — tipo de cambio
• \`precio del euro\` — cotización
• \`precio del bitcoin\`

⚙️ **SISTEMA**
• \`estado del sistema\` — salud de componentes
• \`menú\` — este menú
• \`ayuda [tema]\` — ayuda específica

Escribe tu consulta en lenguaje natural 💬`,
  },
  // ─── Identidad del bot ─────────────────────────────────────────
  {
    rx: /^\s*(qui[eé]n eres|c[oó]mo te llamas|qu[eé] eres|eres\s+(un\s+)?bot|eres\s+(una\s+)?ia|cu[eé]ntame\s+(de\s+ti|sobre\s+ti)|preséntate|presentate)\s*[!.?]*\s*$/i,
    r: `🤖 **Soy NEXUS**, un asistente de inteligencia artificial empresarial.

Estoy diseñado para ayudarte con:
- 📊 Consultas ERP: ventas, facturas, clientes, inventario
- 💼 Contabilidad peruana: IGV, SUNAT, balances, flujo de caja
- 🌐 Datos en tiempo real: tipo de cambio, cotizaciones
- 🔧 Gestión del sistema: diagnósticos, módulos, arquitectura

Funciono con un **motor de decisión inteligente** que clasifica cada consulta al módulo correcto (reglas, IA, base de datos o internet).`,
  },
  // ─── Estado del sistema ────────────────────────────────────────
  {
    rx: /^\s*(estado\s+(del\s+)?sistema|c[oó]mo\s+est[aá]\s+el\s+sistema|status\b|health\b|sistema\s+(ok|bien|funcionando))\s*[!.?]*\s*$/i,
    r: () => `⚙️ **Estado del Sistema NEXUS**

| Componente        | Estado        |
|-------------------|---------------|
| 🟢 Motor de Reglas | Operativo     |
| 🟡 IA (Ollama)     | Ver /api/health|
| 🌐 Internet        | Activo        |
| 🗄️ Base de Datos   | Ver /api/health|
| 🔁 Auto-Expansión  | Activo        |

_Usa_ \`/api/health\` _para diagnóstico completo en tiempo real._`,
  },
  // ─── Ayuda contabilidad rápida ──────────────────────────────────
  {
    rx: /^\s*ayuda\s+(contabilidad|igv|factura|venta|inventario|cliente|proveedor|caja)\s*$/i,
    r: (m) => {
      const tema = (m[1] || "").toLowerCase();
      const temas = {
        contabilidad: "📚 **Ayuda: Contabilidad**\nPuedes preguntar: *¿qué es un balance?*, *¿cómo funciona el flujo de caja?*, *explícame el estado de resultados*",
        igv: "📚 **Ayuda: IGV**\nFórmulas: *IGV = Base × 18%* · *Total = Base + IGV* · *Base = Total ÷ 1.18*\nPregunta: *¿cuánto IGV generé este mes?*",
        factura: "📚 **Ayuda: Facturas**\nPuedes: *listar facturas pendientes*, *facturas del mes*, *registrar factura*, *factura por cliente*",
        venta: "📚 **Ayuda: Ventas**\nPuedes: *ventas de hoy*, *ventas del mes*, *mejor vendedor*, *productos más vendidos*",
        inventario: "📚 **Ayuda: Inventario**\nPuedes: *stock bajo*, *kardex del producto X*, *productos sin movimiento*, *rotación de inventario*",
        cliente: "📚 **Ayuda: Clientes**\nPuedes: *listar clientes*, *crear cliente*, *clientes con deuda*, *historial del cliente X*",
        proveedor: "📚 **Ayuda: Proveedores**\nPuedes: *listar proveedores*, *compras al proveedor X*, *cuentas por pagar*",
        caja: "📚 **Ayuda: Caja/Tesorería**\nPuedes: *saldo de caja*, *movimientos del día*, *flujo de caja del mes*",
      };
      return temas[tema] || `📚 Escribe tu consulta sobre **${tema}** en lenguaje natural y te ayudo.`;
    },
  },
  // ─── Comandos de acciones rápidas ERP ─────────────────────────
  {
    rx: /^\s*(ventas\s+de\s+hoy|facturas\s+pendientes|stock\s+bajo|cuentas\s+por\s+cobrar|cuentas\s+por\s+pagar)\s*[!.?]*\s*$/i,
    r: null, // null = dejar pasar al motor BD (no responder aquí)
  },
];

// ── CONCEPTOS CONTABLES OFFLINE ───────────────────────────────────
// Respuestas estilo "contador humano" para preguntas "qué es / explica / diferencia"
// Sin IA, sin BD. Respuesta inmediata con ejemplo en S/.
const CONCEPTOS = [
  {
    rx: /\b(qu[eé]\s+es|expl[ií]c[aá](me|rs?)?|c[oó]mo\s+funciona|para\s+qu[eé]\s+sirve)\s+(el\s+)?igv\b/i,
    r: `💡 **¿Qué es el IGV?**

El IGV es el impuesto que le cobras a tu cliente cuando vendes algo. Simple.

**Ejemplo:** Si tu producto cuesta S/ 100 (precio real = S/ 84.75), le sumas S/ 15.25 de IGV (18%) y le cobras S/ 100 en total. Ese S/ 15.25 lo declaras y pagas a SUNAT.

📐 Fórmulas:
• IGV = Base imponible × 18%
• Total = Base + IGV
• Base = Total ÷ 1.18

_IGV = Impuesto General a las Ventas · Perú 18% · Normativa: SUNAT_`,
  },
  {
    rx: /\b(c[oó]mo\s+(se\s+)?calcul[ao]|f[oó]rmula\s+(del?|para)\s+|calculame\s+(el?\s+)?)\s*igv\b/i,
    r: `🧮 **Cómo calcular el IGV (Perú)**

**Caso 1: Precio SIN IGV → calcular total**
Base = S/ 200 → IGV = 200 × 18% = S/ 36 → **Total = S/ 236**

**Caso 2: Precio CON IGV → extraer la base**
Total = S/ 236 → Base = 236 ÷ 1.18 = S/ 200 → IGV = S/ 36

📐 Fórmulas rápidas:
\`IGV = Base × 0.18\`
\`Base = Total / 1.18\`
\`Total = Base × 1.18\``,
  },
  {
    rx: /diferencia\s+(entre|del?)\s+(d[eé]bito\s+y\s+cr[eé]dito|cr[eé]dito\s+y\s+d[eé]bito)/i,
    r: `💡 **Débito vs Crédito en Contabilidad**

Piénsalo así: cada asiento contable tiene 2 columnas.

| | **Débito** | **Crédito** |
|---|---|---|
| Activos (caja, banco) | ↑ Sube | ↓ Baja |
| Pasivos (deudas) | ↓ Baja | ↑ Sube |
| Ingresos (ventas) | ↓ Baja | ↑ Sube |
| Gastos | ↑ Sube | ↓ Baja |

**Regla de oro:** Débito = Crédito siempre (la suma cuadra).

_Ejemplo: Vendes S/ 500 en efectivo → Débito Caja S/500 / Crédito Ventas S/500_`,
  },
  {
    rx: /\b(qu[eé]\s+es|expl[ií]c[aá](me|rs?)?)\s+(un[ao]?\s+)?(balance\s+general|balance\s+de\s+situaci[oó]n)\b/i,
    r: `💡 **¿Qué es el Balance General?**

Es una "foto" de tu empresa en un momento exacto. Muestra qué tienes y qué debes.

**Estructura:**
\`\`\`
ACTIVOS (lo que tienes)    = PASIVOS (lo que debes) + PATRIMONIO (lo tuyo)
\`\`\`

**Ejemplo real:**
• Activos: Caja S/10,000 + Inventario S/5,000 = **S/15,000**
• Pasivos: Deuda banco S/8,000
• Patrimonio: S/15,000 - S/8,000 = **S/7,000** (lo que realmente es tuyo)

_Normativa: NIC 1 — NIIF adaptadas para Perú_`,
  },
  {
    rx: /\b(qu[eé]\s+es|expl[ií]c[aá](me|rs?)?)\s+(el\s+)?(flujo\s+de\s+caja|cash\s+flow)\b/i,
    r: `💡 **¿Qué es el Flujo de Caja?**

Es el registro de todo el dinero que **entra y sale** de tu negocio, período a período.

**Ejemplo del mes:**
\`\`\`
Ventas cobradas:     + S/ 20,000
Proveedores pagados: - S/ 8,000
Sueldos:             - S/ 5,000
──────────────────────────────
Flujo neto:          + S/ 7,000  ← dinero disponible al final
\`\`\`

⚠️ Diferencia clave: puedes tener **utilidad** pero **flujo negativo** si tus clientes no te pagan a tiempo.`,
  },
  {
    rx: /\b(qu[eé]\s+es|expl[ií]c[aá](me|rs?)?)\s+(una?\s+)?(utilidad\s+(bruta|neta|operativa)|ganancia\s+(bruta|neta))\b/i,
    r: `💡 **Utilidades en Contabilidad**

**Utilidad Bruta** = Ventas − Costo de lo que vendiste
• Ventas: S/ 50,000 - Costo: S/ 30,000 = **Utilidad Bruta: S/ 20,000**

**Utilidad Operativa** = Utilidad Bruta − Gastos del negocio (sueldos, alquiler, luz)
• S/ 20,000 - Gastos S/ 8,000 = **Utilidad Operativa: S/ 12,000**

**Utilidad Neta** = Utilidad Operativa − Impuestos (Renta 29.5% en Perú)
• S/ 12,000 - Renta S/ 3,540 = **Utilidad Neta: S/ 8,460** ← lo que realmente te quedó`,
  },
  {
    rx: /\b(qu[eé]\s+(son|es)|expl[ií]c[aá](me|rs?)?)\s+(las?\s+)?(cuentas?\s+por\s+cobrar|cxc)\b/i,
    r: `💡 **Cuentas por Cobrar (CxC)**

Son las **deudas que tus clientes tienen contigo** — les vendiste pero aún no te pagaron.

**Ejemplo:**
• Facturaste S/ 5,000 al cliente "Empresa ABC" el 1 de junio
• Plazo de pago: 30 días → te deben pagar hasta el 1 de julio
• Hasta que paguen → es Cuenta por Cobrar

📌 Controlar esto es crítico: tener muchas CxC vencidas = problemas de liquidez.
Escribe _"cuentas por cobrar"_ para ver los datos reales de tu empresa.`,
  },
  {
    rx: /\b(qu[eé]\s+(son|es)|expl[ií]c[aá](me|rs?)?)\s+(las?\s+)?(cuentas?\s+por\s+pagar|cxp)\b/i,
    r: `💡 **Cuentas por Pagar (CxP)**

Son las **deudas que tienes con tus proveedores** — compraste pero aún no les pagaste.

**Ejemplo:**
• Compraste mercadería S/ 3,000 al proveedor "Distribuidora XYZ"
• Plazo: 45 días → debes pagar antes del vencimiento
• Hasta que pagues → es Cuenta por Pagar

📌 Gestionar bien los plazos = aprovechar el crédito sin generar intereses moratorios.
Escribe _"cuentas por pagar"_ para ver los datos reales de tu empresa.`,
  },
  {
    rx: /\b(qu[eé]\s+es|expl[ií]c[aá](me|rs?)?)\s+(el\s+)?(estado\s+de\s+resultados|e\.?r\.?e\.?|estado\s+de\s+p[eé]rdidas?\s+y\s+ganancias?)\b/i,
    r: `💡 **¿Qué es el Estado de Resultados?**

Muestra si tu empresa **ganó o perdió** dinero en un período. Es diferente al balance.

**Estructura:**
\`\`\`
Ventas (ingresos)         S/ 80,000
- Costo de ventas         S/ 45,000
= Utilidad Bruta          S/ 35,000
- Gastos operativos       S/ 18,000
= Utilidad Operativa      S/ 17,000
- Impuesto a la Renta     S/  5,015
= Utilidad Neta           S/ 11,985
\`\`\`

_Normativa: NIC 1 — se prepara mensual/trimestral/anual_`,
  },
  {
    rx: /\b(qu[eé]\s+es|expl[ií]c[aá](me|rs?)?)\s+(la\s+)?(depreciaci[oó]n|amortizaci[oó]n)\b/i,
    r: `💡 **¿Qué es la Depreciación?**

Es el "desgaste" contable de tus activos fijos (máquinas, vehículos, equipos) con el tiempo.

**Ejemplo:** Compraste una computadora en S/ 3,000. Vida útil: 4 años.
Depreciación anual = S/ 3,000 ÷ 4 = **S/ 750/año** (método lineal)

Cada año reduces el valor del activo en S/ 750 y lo registras como gasto.

📋 Tasas SUNAT (máximas):
• Edificios: 5% · Maquinaria: 20% · Vehículos: 20% · Equipos: 25%`,
  },
];

// ── Función principal ─────────────────────────────────────────────
function responder(pregunta) {
  const q = String(pregunta || "").trim();
  // 1. Verificar reglas de sistema (saludos, menú, comandos)
  for (const regla of REGLAS) {
    const m = q.match(regla.rx);
    if (m) {
      if (regla.r === null) return null; // pasar al siguiente módulo
      const texto = typeof regla.r === "function" ? regla.r(m) : regla.r;
      return { modo: "REGLAS", respuesta: texto, agente: "reglas" };
    }
  }
  // 2. Verificar conceptos contables offline (qué es, explica, diferencia)
  for (const concepto of CONCEPTOS) {
    if (concepto.rx.test(q)) {
      return { modo: "IA", respuesta: concepto.r, agente: "conceptos_offline" };
    }
  }
  return null; // sin coincidencia → siguiente módulo
}

// ── Detectar si es un comando simple (para el router) ─────────────
const RX_REGLAS_DETECT = /^\s*(hola|hey\b|hi\b|ey\b|buenas?|buenos?\s+(d[ií]as?|tardes?|noches?)|adi[oó]s|hasta\s+(luego|pronto|ma[ñn]ana)|chao|bye|nos\s+vemos|gracias|muchas\s+gracias|perfecto|excelente|genial|muy\s+bien|ok|listo|de\s+acuerdo|men[uú]|opciones?|ayuda|help|en\s+qu[eé]\s+me\s+ayudas?|qu[eé]\s+sabes?\s+hacer|qu[eé]\s+puedes?\s+hacer|funciones?|capacidades?|qui[eé]n\s+eres|c[oó]mo\s+te\s+llamas|qu[eé]\s+eres|eres\s+(un\s+)?bot|estado\s+(del\s+)?sistema|status\b|presentate|preséntate)\s*[!.?]*\s*$/i;

function esRegla(pregunta) {
  return RX_REGLAS_DETECT.test(String(pregunta || "").trim());
}

module.exports = { responder, esRegla, REGLAS };
