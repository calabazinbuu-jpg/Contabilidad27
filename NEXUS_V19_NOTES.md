# NEXUS v19 — Knowledge inteligente con hash, grafo y patrones

Sobre v18. **Sin romper nada** del backend ni de los contratos HTTP existentes.

## 🚀 Cambios

### 1. Boot inteligente (no recalcula si nada cambió)
`discover-db.js` ahora calcula primero un **hash SHA-256** del esquema (columnas + FKs) y lo guarda en `knowledge/schema_hash.json`.

- Si el hash coincide con el anterior → **no regenera nada**, termina en ms.
- Si cambió → regenera todo automáticamente.
- Flags: `--force` (siempre regenera), `--hash-only` (solo calcula y sale).

El boot en `server.js` lo invoca sin flags: en producción es prácticamente gratis.

### 2. Detección de cambios de esquema
`schema_hash.json` se compara en cada arranque y en cada `POST /api/schema/discover`.

### 3. Clasificación automática maestra / transaccional / detalle / auxiliar
`db_catalog.json` ahora trae:
```json
{
  "proveedores": { "tipo": "maestra", "entidades": ["persona_o_empresa","documento_identidad",...] },
  "compras":      { "tipo": "transaccional", ... },
  "compra_detalle":{ "tipo": "detalle", ... }
}
```
Heurística: nombre + cantidad de FKs + presencia de columnas `fecha/total`.

Índice rápido en `db_types.json`:
```json
{ "maestra": ["clientes","proveedores",...], "transaccional": [...], "detalle": [...] }
```

### 4. Inferencia de entidades por contenido
Cada tabla obtiene una lista de etiquetas semánticas:
`persona_o_empresa`, `documento_identidad`, `contacto_email`, `contacto_telefono`, `ubicacion`, `monetario`, `temporal`, `inventario`, `estado`.

### 5. Grafo de relaciones — `db_graph.json` + `GET /api/schema/grafo`
Mapa de adyacencia listo para path-finding de JOINs:
```json
{ "compras": ["proveedores","compra_detalle"], "facturas": ["clientes","factura_detalle","pagos"] }
```

### 6. Patrones de SQL probados — `query_patterns.json`
Semilla de plantillas reales (compras_por_proveedor, facturas_por_cliente, productos_mas_comprados, ventas_por_mes…) **generadas en función de las FKs reales** de tu BD.
El archivo se **fusiona** con patrones que tú agregues manualmente (no se sobrescriben).

### 7. Reglas obligatorias para la IA — `SQL_GENERATION_RULES.md`
Orden estricto: catálogo → relaciones → samples → grafo → JOIN → SQL → validar.
Prohibido: inventar tablas/columnas/relaciones, buscar entidades maestras en transaccionales.

### 8. Nuevos endpoints HTTP
| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/schema/grafo` | Grafo de adyacencia |
| GET | `/api/schema/catalogo` | `db_catalog.json` |
| GET | `/api/schema/relaciones` | `db_relations.json` |
| GET | `/api/schema/tipos` | maestras/transaccionales/detalle |
| GET | `/api/schema/patrones` | `query_patterns.json` |
| GET | `/api/schema/reglas` | `SQL_GENERATION_RULES.md` |
| GET | `/api/schema/hash` | hash actual + timestamp |
| POST | `/api/schema/discover` | Lanza el descubrimiento (`?force=1`) |

Los existentes (`/api/schema`, `/api/schema/resumen`, `/api/schema/refresh`, `/api/schema/resolver`) siguen idénticos.

## 📁 Archivos en `knowledge/`
```
db_discovery.json     informe completo
db_catalog.json       catálogo + tipo + entidades
db_relations.json     FKs normalizadas (join armado)
db_graph.json         grafo de adyacencia
db_types.json         índice por tipo de tabla
db_indexes.json       índices por tabla
db_views.json         vistas + definición SQL
db_samples.json       muestras de filas
db_comments.json      comentarios PG
db_stats.json         pg_stat_user_tables
query_patterns.json   plantillas SQL exitosas
schema_hash.json      huella del esquema
SQL_GENERATION_RULES.md
DB_REPORT.md
```

## ✅ Lo que NO cambió
- Esquema de la BD.
- Endpoints anteriores.
- `intent.router`, `engine.v2`, `query.planner`, `sql.guard`, `sql.retry`, `schemaCatalog.service`.
- Panel NEXUS (`Ctrl+Shift+N`).
