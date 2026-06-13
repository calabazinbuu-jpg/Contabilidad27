# Reglas de Generación de SQL (obligatorias)

La IA debe seguir este orden estricto al construir cualquier consulta SQL:

1. **Consultar `db_catalog.json`** → confirmar que la tabla y columnas existen.
2. **Consultar `db_relations.json`** → usar el JOIN ya armado (`origen.col = destino.col`).
3. **Consultar `db_samples.json`** → entender el formato real de los valores (ej. nombre = "ABC SAC", documento = "20123456789").
4. **Consultar `db_graph.json`** → si necesita más de un JOIN, navegar el grafo de relaciones.
5. **Construir el JOIN** respetando dirección de la FK.
6. **Generar el SQL final**.
7. **Validar columnas** contra `db_catalog.json` antes de ejecutar.

## Prohibido

- ❌ Inventar tablas que no estén en `db_catalog.json`.
- ❌ Inventar columnas que no estén en `db_catalog.json`.
- ❌ Inventar relaciones que no estén en `db_relations.json`.
- ❌ Buscar entidades maestras (clientes/proveedores/productos) directamente en una tabla transaccional. Ej.: NO buscar "proveedor ABC" solo en `compras` — primero ir a `proveedores` y luego hacer JOIN.

## Tipos de tabla

- **maestra**: catálogo (clientes, proveedores, productos, empleados…). Filtrar por nombre/documento aquí.
- **transaccional**: operaciones (ventas, compras, facturas, pagos…). Filtrar por fecha, JOIN con maestras.
- **detalle**: líneas de una transacción (`*_detalle`, `*_items`). Siempre JOIN con su transaccional padre.
- **auxiliar**: tablas técnicas o secundarias.

## Patrones probados

Revisar primero `query_patterns.json` — si la pregunta del usuario coincide con un patrón, usar ese SQL como base.
