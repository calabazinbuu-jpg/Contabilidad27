# Catálogo de Esquema en Memoria + Descubridor de BD

Esta versión añade el flujo que pediste: al **arrancar**, la app lee la metadata real
de tu PostgreSQL (tablas, columnas, FOREIGN KEY) y la guarda en memoria para construir
**JOINs automáticos** y aplicar **filtros por `empresa_id`**. Nunca asume: todo se basa
en el esquema real.

## 1) Configura tus credenciales
En `chat-backend/.env`:
```
DATABASE_URL=postgres://usuario:password@host:5432/tu_base
EMPRESA_ID=1
```

## 2) Descubre tu base de datos (script)
```
cd api-server/chat-backend
npm install
npm run discover            # informe completo
npm run discover -- --rows=5   # con 5 filas de muestra por tabla
npm run discover -- --no-sample
```
Genera en `chat-backend/knowledge/`:
- `db_discovery.json` — esquema + relaciones + conteo de filas + muestras de datos
- `db_catalog.json` — catálogo compacto para la IA (columnas + relaciones)
- `DB_REPORT.md` — informe legible (incluye **tablas vacías / sin información**)

El script muestra en consola qué tablas tienen datos y cuáles están vacías.

## 3) Arranque del servidor
`npm start` construye el catálogo en memoria automáticamente y lo expone:
- `GET  /api/schema`          → catálogo completo (tablas, columnas, relaciones)
- `GET  /api/schema/resumen`  → resumen rápido
- `POST /api/schema/refresh`  → recarga la metadata tras crear tablas/columnas

## 4) Uso desde el código (JOIN y empresa_id automáticos)
```js
const catalog = require("./services/schemaCatalog.service");

catalog.buildJoins("compras");
// [{ tabla:"proveedores", on:"compras.proveedor_id = proveedores.id", via:"proveedor_id" }]

catalog.empresaFilter("facturas", 1);    // "facturas.empresa_id = 1"  (o "" si no aplica)

catalog.resolverRelacion("compras", "proveedor_id");
// { tabla:"proveedores", columna:"id", on:"compras.proveedor_id = proveedores.id" }

catalog.selectAuto("compras", { empresaId: 1 });
// SELECT * FROM compras LEFT JOIN proveedores ON ... WHERE compras.empresa_id = 1 LIMIT 100
```

### Cómo resuelve las relaciones (en orden)
1. **FOREIGN KEY reales** declaradas en la BD.
2. **Relaciones conocidas** de tu ERP (`compras.proveedor_id → proveedores.id`, etc.),
   solo si no hay FK real para esa columna.
3. **Inferencia por convención**: cualquier columna `*_id` se enlaza a la tabla cuyo
   nombre coincida (`proveedor_id → proveedores`).

`empresa_id` (o `empresaid` / `tenant_id` / `id_empresa`) se detecta por tabla y se
aplica como filtro cuando existe.
