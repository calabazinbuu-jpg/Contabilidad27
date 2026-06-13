# NEXUS v15 — Notas de mejora

Cambios sobre `ia_empresarial_nexus_v14.zip`. Nada del backend existente fue eliminado ni cambiado en sus contratos.

## 1. NEXUS Control Panel (oculto, Ctrl + Shift + N)
Inyectado en `api-server/frontend/chat.html`. Panel overlay con 5 pestañas:

- **Trazas**: tabla completa de cada pregunta enviada — modo (BD / IA / INTERNET / REGLAS / ARQUITECTURA), fuente/agente, tabla usada, filas devueltas, latencia, caché, degradado. Permite exportar a JSON.
- **SQL Log**: todas las consultas SQL ejecutadas por el sistema (cuando el agente las expone en la respuesta), con su contexto.
- **Errores**: respuestas degradadas, mensajes `⚠️`/`❌`, y errores JS globales capturados (`window.onerror` + `unhandledrejection`).
- **Sistema**: lee `/api/hybrid/health` (fallback a `/api/health`) y muestra estado de BD, Internet, IA/Ollama y reglas cargadas.
- **Probador**: ejecuta `/api/hybrid/intent?q=…` sin tocar BD ni IA — devuelve modo + confianza + motivo del router.

Cierra con **Esc** o el botón ×. No aparece en el chat normal — sólo con el atajo.

## 2. Trazabilidad por mensaje
La función `enviar()` ahora empuja cada respuesta a `window.NEXUS_PANEL` con los campos:
`ts, pregunta, modo, fuente, tabla, sql, filas, latencia, confianza, cache, degradado, intent, raw`.

No se muestra nada extra en las burbujas del chat — la trazabilidad sólo es visible dentro del panel oculto, como pediste.

## 3. Sinónimos de tablas extendidos (ES + EN)
`api-server/chat-backend/services/schemaResolver.service.js` — `CADENAS_FALLBACK` ahora cubre:

| Concepto | Fallback automático |
|---|---|
| clientes | clientes → customers → users → usuarios → contactos |
| proveedores | proveedores → suppliers → vendors → providers |
| productos | productos → products → items → articulos → inventory |
| ventas | ventas → sales → orders → facturas → invoices |
| facturas | facturas → invoices → ventas → sales |
| compras | compras → purchases → ordenes_compra |
| pagos | pagos → payments → caja |
| inventario | inventario → inventory → productos → kardex → stock |
| empleados | empleados → employees → personal → planillas |

Si tu BD tiene la tabla `customers` en vez de `clientes`, el sistema ya la encuentra automáticamente vía `resolverTabla()` + `ejecutarConFallback()` sin modificar reglas.

## 4. Lo que NO cambió
- Estructura de la BD: ningún cambio de esquema.
- `intent.router.js`, `hybrid/router.intent.js`, agentes, `engine.v2`, `query.planner`, `sql.guard`, `sql.retry`, `result.validator`: intactos.
- Endpoints HTTP: idénticos.
- Auto-corrección SQL (`sql.retry.ejecutarConRetry`, 3 intentos) y reparación de esquema (`schemaRepair.asegurarEsquema`) ya estaban implementados — el panel ahora los expone visualmente.

## 5. Atajos
- `Ctrl + Shift + N` — abrir/cerrar panel
- `Esc` — cerrar panel
- Botón "Exportar JSON" — descarga `nexus_traces_<ts>.json` con todas las trazas de la sesión

— Generado: NEXUS v15
