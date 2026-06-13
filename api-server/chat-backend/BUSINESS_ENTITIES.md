# 🧠 Capa de Entidades de Negocio (business_entities)

Esta capa hace que la IA piense en **términos de negocio** en lugar de
nombres concretos de tablas. Así, aunque mañana cambies a otra base de
datos con 500 tablas y nombres totalmente distintos, la IA seguirá
encontrando la información correcta.

## Entidades canónicas

```
supplier · customer · product · employee · account
invoice · purchase · payment · inventory · order · expense · journal
```

Cada tabla real se clasifica automáticamente a una de estas entidades a
partir de: **nombres de tablas + nombres de columnas + relaciones (FK) +
muestras de datos**.

Ejemplo de clasificación:

```json
{ "tabla": "proveedores", "tipo": "master_data", "entidad": "supplier" }
{ "tabla": "customers",   "tipo": "master_data", "entidad": "customer" }
```

## Archivos generados (knowledge/)

| Archivo | Contenido |
|---|---|
| `business_entities.json` | `entidad → [tablas reales]` (mapa simple) |
| `business_entities_full.json` | igual + `tipo`, `confidence` y `motivo` por tabla |

Ejemplo `business_entities.json`:

```json
{
  "supplier": ["proveedores", "suppliers", "vendors"],
  "customer": ["clientes", "customers"],
  "product":  ["productos", "items", "articles"],
  "invoice":  ["facturas", "invoices"],
  "payment":  ["pagos", "payments"]
}
```

Se regenera con `npm run discover` o en caliente desde la API.

## Diccionario de sinónimos de negocio

`businessEntities.service.js → SINONIMOS_NEGOCIO` traduce el término del
usuario (en cualquier idioma/variante) a la entidad canónica:

```
proveedor / vendor / abastecedor  → supplier
cliente / buyer / comprador       → customer
producto / item / sku / articulo  → product
factura / comprobante / venta     → invoice
```

## Ranking de confianza + validación previa

Antes de ejecutar un SQL, `queryValidator.service.js` responde:

- ¿Existe la tabla?
- ¿Existen las columnas?
- ¿Existe la FK / es válido el JOIN?
- ¿Hay filtro `empresa_id` disponible?

y devuelve una puntuación de confianza con motivos:

```json
{
  "ok": true,
  "confidence": 0.96,
  "motivo": ["tabla encontrada", "FK / JOIN encontrada", "columnas verificadas"],
  "errores": [],
  "empresaFilter": "facturas.empresa_id = 1"
}
```

**Si la confianza baja de `0.70`**, `requiereConfirmacion = true`: la IA
debe **preguntar o explicar la ambigüedad antes de ejecutar**.

## Historial de consultas exitosas (aprendizaje)

`queryHistory.service.js` guarda los patrones que funcionan en
`knowledge/query_history.json`:

```json
{ "pregunta": "compras por proveedor", "sql": "...",
  "tablas": ["compras","proveedores"], "entidades": ["purchase","supplier"],
  "exito": true, "filas": 12, "confidence": 0.95 }
```

Con el tiempo la IA reutiliza el SQL del patrón más parecido (similitud
Jaccard de tokens) en TU sistema.

## Endpoints REST

| Método | Ruta | Uso |
|---|---|---|
| `GET`  | `/api/business/entities` | `business_entities.json` en vivo (`?refresh=1` recalcula) |
| `GET`  | `/api/business/resolve?q=vendor` | término → entidad + tablas reales + confianza |
| `POST` | `/api/query/validate` | valida `{ sql, tabla, columnas, joins, empresaId }` → confianza |
| `GET`  | `/api/query/history` | historial de consultas |
| `POST` | `/api/query/history` | registra una consulta exitosa |
| `GET`  | `/api/query/similar?q=...` | patrón exitoso más parecido |

## Flujo recomendado en el pipeline

```text
pregunta del usuario
   │
   ├─ 1. resolverEntidad(term)         → entidad de negocio + tablas reales
   ├─ 2. buscarSimilar(pregunta)       → reusar SQL exitoso si hay match
   ├─ 3. generar SQL (con catálogo real)
   ├─ 4. queryValidator.validar(...)   → confidence + motivos
   │        confidence < 0.70  → preguntar / explicar ambigüedad
   │        confidence ≥ 0.70  → ejecutar
   └─ 5. queryHistory.registrar(...)   → aprender del éxito
```
