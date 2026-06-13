# NEXUS v18 — Descubrimiento profundo de BD

Sobre v15. **Sin romper nada** del backend ni de los contratos HTTP.

## 🚀 Qué cambió

### `scripts/discover-db.js` — ahora cubre 8 niveles

| Nivel | Qué descubre | Fuente PG |
|---|---|---|
| 1 | Tablas, columnas, tipos | `information_schema.columns` |
| 2 | Relaciones (FK) | `information_schema.table_constraints` + `key_column_usage` + `constraint_column_usage` |
| 3 | Contenido real (muestras + conteos) | `SELECT * FROM "<tabla>" LIMIT N` |
| 4 | Catálogo compacto para la IA | derivado |
| 5 | **Índices** | `pg_indexes` |
| 6 | **Vistas** | `information_schema.views` |
| 7 | **Comentarios** de tablas y columnas | `pg_description` + `obj_description` |
| 8 | **Estadísticas de uso** (tablas más usadas) | `pg_stat_user_tables` |

### Archivos generados en `knowledge/`

```
knowledge/
├── db_discovery.json   ← informe unificado (todo)
├── db_catalog.json     ← catálogo compacto para la IA
├── db_relations.json   ← relaciones normalizadas (join ya armado)
├── db_indexes.json     ← índices por tabla
├── db_views.json       ← vistas + definición SQL
├── db_samples.json     ← muestras de filas por tabla
├── db_comments.json    ← comentarios de tablas y columnas
├── db_stats.json       ← estadísticas (n_live_tup, idx_scan, seq_scan…)
└── DB_REPORT.md        ← informe legible en Markdown
```

### 🔁 Auto-ejecución al iniciar el servidor

`server.js` ahora lanza el descubrimiento **automáticamente en segundo plano** justo después de `app.listen(...)`. No bloquea el arranque.

- Variable de entorno opcional: `DISCOVER_ON_BOOT=0` para desactivarlo.
- Sigue funcionando manual: `npm run discover` o `node scripts/discover-db.js`.
- Flags: `--no-sample`, `--rows=5`.

### 🧠 Por qué la IA mejora

Con esto, cuando preguntes _"muéstrame compras del proveedor ABC"_:

1. `db_relations.json` ya tiene el JOIN listo: `compras.proveedor_id = proveedores.id`.
2. `db_catalog.json` confirma que `proveedores.nombre` existe.
3. `db_samples.json` muestra que ABC se guarda como `"ABC SAC"` en la columna `nombre`.
4. `db_stats.json` indica si `proveedores` es una tabla pequeña (búsqueda directa) o grande (usar índice).
5. `db_comments.json` aporta sinónimos humanos (ej. `documento = RUC`).

Resultado: la IA construye el SQL correcto al primer intento, sin volver a confundir `compras.proveedor_id` con la tabla `proveedores`.

## ✅ Lo que NO cambió
- Esquema de la BD.
- Endpoints HTTP existentes.
- `intent.router`, `engine.v2`, `query.planner`, `sql.guard`, `sql.retry`, `schemaCatalog.service`.
- Panel NEXUS (`Ctrl+Shift+N`) intacto.
