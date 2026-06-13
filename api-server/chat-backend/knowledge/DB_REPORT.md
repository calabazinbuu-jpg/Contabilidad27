# Informe de Base de Datos — contabilidad

Generado: 2026-06-13T22:40:40.888Z
Hash: `a2b692736431fad236f4ce377f780d7e6d87f4c11c17984937b4bc5ad08d6623`

## Resumen
- Tablas: **60** (maestras: 18, transaccionales: 15, detalle: 5)
- Relaciones (FK): **96**
- Índices: **67**  |  Vistas: **0**
- Tablas con datos: **39**  |  vacías: **21**

## Clasificación

**maestra** (18): `almacenes`, `bancos`, `categorias`, `clientes`, `documentos_rag`, `empleados`, `empresas`, `mensajes`, `monedas`, `productos`, `proveedores`, `roles`, `sesiones`, `sucursales`, `unidades_medida`, `users`, `usuario_roles`, `usuarios`

**transaccional** (15): `asientos`, `asientos_contables`, `asistencia`, `compras`, `cotizaciones`, `depreciaciones`, `facturas`, `guias_remision`, `kardex`, `lotes`, `movimientos`, `notas_credito`, `notas_debito`, `pagos`, `ventas`

**detalle** (5): `asiento_detalle`, `asientos_detalle`, `compra_detalle`, `factura_detalle`, `factura_items`

**auxiliar** (22): `activos_fijos`, `auditoria`, `cache_consultas`, `caja`, `centros_costo`, `configuracion`, `cuentas_contables`, `documentos`, `embeddings_doc`, `feedback_ia`, `gastos`, `ia_memory`, `logs_ia`, `marcas`, `mensajes_chat`, `oportunidades`, `planillas`, `proyectos`, `sesiones_chat`, `tareas`, `tickets`, `tipo_cambio`

## 🔥 Tablas más usadas
- `activos_fijos` — 0 filas (idx_scan: 0, seq_scan: 5)
- `guias_remision` — 0 filas (idx_scan: 0, seq_scan: 5)
- `ia_memory` — 0 filas (idx_scan: 0, seq_scan: 5)
- `notas_credito` — 0 filas (idx_scan: 0, seq_scan: 5)
- `categorias` — 0 filas (idx_scan: 0, seq_scan: 5)
- `sesiones` — 0 filas (idx_scan: 0, seq_scan: 5)
- `logs_ia` — 0 filas (idx_scan: 0, seq_scan: 5)
- `centros_costo` — 0 filas (idx_scan: 0, seq_scan: 5)
- `clientes` — 0 filas (idx_scan: 16, seq_scan: 313)
- `proyectos` — 0 filas (idx_scan: 0, seq_scan: 5)
- `marcas` — 0 filas (idx_scan: 0, seq_scan: 5)
- `proveedores` — 0 filas (idx_scan: 4, seq_scan: 8)
- `productos` — 0 filas (idx_scan: 0, seq_scan: 312)
- `tareas` — 0 filas (idx_scan: 0, seq_scan: 5)
- `mensajes_chat` — 0 filas (idx_scan: 0, seq_scan: 5)

## Detalle por tabla

### activos_fijos  (50 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `descripcion` — text
- `valor` — numeric
- `fecha_compra` — date
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- activos_fijos.empresa_id = empresas.id

**Referenciada por:**
- depreciaciones.activo_id = activos_fijos.id

**Índices:**
- `activos_fijos_pkey`

### almacenes  (0 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `sucursal_id` — integer
- `nombre` — character varying
- `direccion` — text
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- almacenes.empresa_id = empresas.id
- almacenes.sucursal_id = sucursales.id

**Índices:**
- `almacenes_pkey`

### asiento_detalle  (8401 filas)
**Columnas:**
- `id` — integer
- `asiento_id` — integer
- `cuenta_id` — integer
- `debe` — numeric
- `haber` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- asiento_detalle.empresa_id = empresas.id
- asiento_detalle.cuenta_id = cuentas_contables.id
- asiento_detalle.asiento_id = asientos.id

**Índices:**
- `asiento_detalle_pkey`

### asientos  (100 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `fecha` — date
- `descripcion` — text
- `saldo` — numeric
- `stock_min` — integer
- `subtotal` — numeric

**Relaciones (FK):**
- asientos.empresa_id = empresas.id

**Referenciada por:**
- asiento_detalle.asiento_id = asientos.id

**Índices:**
- `asientos_pkey`

### asientos_contables  (1 filas)
**Columnas:**
- `id` — integer
- `fecha` — date
- `descripcion` — text
- `total_debe` — numeric
- `total_haber` — numeric
- `estado` — character varying
- `creado_en` — timestamp without time zone

**Referenciada por:**
- asientos_detalle.asiento_id = asientos_contables.id

**Índices:**
- `asientos_contables_pkey`

### asientos_detalle  (2 filas)
**Columnas:**
- `id` — integer
- `asiento_id` — integer
- `cuenta` — character varying
- `descripcion` — text
- `debe` — numeric
- `haber` — numeric
- `creado_en` — timestamp without time zone

**Relaciones (FK):**
- asientos_detalle.asiento_id = asientos_contables.id

**Índices:**
- `asientos_detalle_pkey`
- `idx_asientos_detalle_asiento_id`

### asistencia  (0 filas)
**Columnas:**
- `id` — integer
- `empleado_id` — integer
- `fecha` — date
- `hora_entrada` — time without time zone
- `hora_salida` — time without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- asistencia.empresa_id = empresas.id
- asistencia.empleado_id = empleados.id

**Índices:**
- `asistencia_pkey`

### auditoria  (2000 filas)
**Columnas:**
- `id` — bigint
- `usuario_id` — integer
- `tabla` — character varying
- `accion` — character varying
- `fecha` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- auditoria.empresa_id = empresas.id

**Índices:**
- `auditoria_pkey`

### bancos  (0 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `banco` — character varying
- `numero_cuenta` — character varying
- `moneda` — character varying
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- bancos.empresa_id = empresas.id

**Índices:**
- `bancos_pkey`

### cache_consultas  (0 filas)
**Columnas:**
- `clave` — character varying
- `resultado` — jsonb
- `hits` — integer
- `expira_en` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- cache_consultas.empresa_id = empresas.id

**Índices:**
- `cache_consultas_pkey`

### caja  (3000 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `fecha` — timestamp without time zone
- `concepto` — text
- `ingreso` — numeric
- `egreso` — numeric
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- caja.empresa_id = empresas.id

**Índices:**
- `caja_pkey`

### categorias  (0 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `nombre` — character varying
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- categorias.empresa_id = empresas.id

**Índices:**
- `categorias_pkey`

### centros_costo  (0 filas)
**Columnas:**
- `id` — integer
- `codigo` — character varying
- `nombre` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- centros_costo.empresa_id = empresas.id

**Índices:**
- `centros_costo_pkey`

### clientes  (110 filas)
**Columnas:**
- `id` — integer
- `nombre` — text
- `documento` — text
- `email` — text
- `telefono` — text
- `creado_en` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- clientes.empresa_id = empresas.id

**Referenciada por:**
- cotizaciones.cliente_id = clientes.id
- facturas.cliente_id = clientes.id
- guias_remision.cliente_id = clientes.id
- oportunidades.cliente_id = clientes.id
- tickets.cliente_id = clientes.id

**Índices:**
- `clientes_pkey`

### compra_detalle  (5000 filas)
**Columnas:**
- `id` — integer
- `compra_id` — integer
- `producto_id` — integer
- `cantidad` — numeric
- `costo` — numeric
- `subtotal` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric

**Relaciones (FK):**
- compra_detalle.empresa_id = empresas.id
- compra_detalle.compra_id = compras.id
- compra_detalle.producto_id = productos.id

**Índices:**
- `compra_detalle_pkey`

### compras  (2260 filas)
**Columnas:**
- `id` — integer
- `proveedor_id` — integer
- `fecha` — date
- `total` — numeric
- `estado` — text
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- compras.empresa_id = empresas.id
- compras.proveedor_id = proveedores.id

**Referenciada por:**
- compra_detalle.compra_id = compras.id

**Índices:**
- `compras_fecha_idx`
- `compras_pkey`

### configuracion  (0 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `clave` — character varying
- `valor` — text
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- configuracion.empresa_id = empresas.id

**Índices:**
- `configuracion_pkey`

### cotizaciones  (0 filas)
**Columnas:**
- `id` — integer
- `cliente_id` — integer
- `fecha` — date
- `total` — numeric
- `estado` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- cotizaciones.cliente_id = clientes.id
- cotizaciones.empresa_id = empresas.id

**Índices:**
- `cotizaciones_pkey`

### cuentas_contables  (100 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `codigo` — character varying
- `nombre` — character varying
- `tipo` — character varying
- `saldo` — numeric
- `stock_min` — integer
- `subtotal` — numeric

**Relaciones (FK):**
- cuentas_contables.empresa_id = empresas.id

**Referenciada por:**
- asiento_detalle.cuenta_id = cuentas_contables.id

**Índices:**
- `cuentas_contables_pkey`

### depreciaciones  (300 filas)
**Columnas:**
- `id` — integer
- `activo_id` — integer
- `fecha` — date
- `monto` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- depreciaciones.empresa_id = empresas.id
- depreciaciones.activo_id = activos_fijos.id

**Índices:**
- `depreciaciones_pkey`

### documentos  (500 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `nombre` — character varying
- `ruta` — text
- `fecha` — timestamp without time zone
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- documentos.empresa_id = empresas.id

**Índices:**
- `documentos_pkey`

### documentos_rag  (0 filas)
**Columnas:**
- `id` — integer
- `titulo` — text
- `fuente` — text
- `contenido` — text
- `tags` — ARRAY
- `creado_en` — timestamp without time zone

**Referenciada por:**
- embeddings_doc.documento_id = documentos_rag.id

**Índices:**
- `documentos_rag_pkey`

### embeddings_doc  (0 filas)
**Columnas:**
- `id` — integer
- `documento_id` — integer
- `chunk` — text
- `vector` — text

**Relaciones (FK):**
- embeddings_doc.documento_id = documentos_rag.id

**Índices:**
- `embeddings_doc_pkey`

### empleados  (4 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `nombres` — character varying
- `apellidos` — character varying
- `dni` — character varying
- `cargo` — character varying
- `sueldo` — numeric
- `fecha_ingreso` — date
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- empleados.empresa_id = empresas.id

**Referenciada por:**
- asistencia.empleado_id = empleados.id
- planillas.empleado_id = empleados.id

**Índices:**
- `empleados_pkey`

### empresas  (6 filas)
**Columnas:**
- `id` — integer
- `nombre` — character varying
- `ruc` — character varying
- `moneda` — character varying
- `creado_en` — timestamp without time zone
- `razon_social` — character varying
- `nombre_comercial` — character varying
- `direccion` — text
- `telefono` — character varying
- `email` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- empresas.empresa_id = empresas.id

**Referenciada por:**
- activos_fijos.empresa_id = empresas.id
- almacenes.empresa_id = empresas.id
- asiento_detalle.empresa_id = empresas.id
- asientos.empresa_id = empresas.id
- asistencia.empresa_id = empresas.id
- auditoria.empresa_id = empresas.id
- bancos.empresa_id = empresas.id
- cache_consultas.empresa_id = empresas.id
- caja.empresa_id = empresas.id
- categorias.empresa_id = empresas.id
- centros_costo.empresa_id = empresas.id
- clientes.empresa_id = empresas.id
- compra_detalle.empresa_id = empresas.id
- compras.empresa_id = empresas.id
- configuracion.empresa_id = empresas.id
- cotizaciones.empresa_id = empresas.id
- cuentas_contables.empresa_id = empresas.id
- depreciaciones.empresa_id = empresas.id
- documentos.empresa_id = empresas.id
- empleados.empresa_id = empresas.id
- empresas.empresa_id = empresas.id
- factura_detalle.empresa_id = empresas.id
- factura_items.empresa_id = empresas.id
- facturas.empresa_id = empresas.id
- feedback_ia.empresa_id = empresas.id
- gastos.empresa_id = empresas.id
- guias_remision.empresa_id = empresas.id
- ia_memory.empresa_id = empresas.id
- kardex.empresa_id = empresas.id
- logs_ia.empresa_id = empresas.id
- lotes.empresa_id = empresas.id
- marcas.empresa_id = empresas.id
- mensajes_chat.empresa_id = empresas.id
- monedas.empresa_id = empresas.id
- notas_credito.empresa_id = empresas.id
- notas_debito.empresa_id = empresas.id
- oportunidades.empresa_id = empresas.id
- pagos.empresa_id = empresas.id
- planillas.empresa_id = empresas.id
- productos.empresa_id = empresas.id
- proveedores.empresa_id = empresas.id
- proyectos.empresa_id = empresas.id
- roles.empresa_id = empresas.id
- sesiones_chat.empresa_id = empresas.id
- sucursales.empresa_id = empresas.id
- tareas.empresa_id = empresas.id
- tickets.empresa_id = empresas.id
- tipo_cambio.empresa_id = empresas.id
- unidades_medida.empresa_id = empresas.id
- users.empresa_id = empresas.id
- usuario_roles.empresa_id = empresas.id
- usuarios.empresa_id = empresas.id
- ventas.empresa_id = empresas.id

**Índices:**
- `empresas_pkey`

### factura_detalle  (5000 filas)
**Columnas:**
- `id` — integer
- `factura_id` — integer
- `producto_id` — integer
- `cantidad` — numeric
- `precio` — numeric
- `subtotal` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `nombre` — text

**Relaciones (FK):**
- factura_detalle.producto_id = productos.id
- factura_detalle.factura_id = facturas.id
- factura_detalle.empresa_id = empresas.id

**Índices:**
- `factura_detalle_pkey`

### factura_items  (180 filas)
**Columnas:**
- `id` — integer
- `factura_id` — integer
- `producto_id` — integer
- `cantidad` — numeric
- `precio` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- factura_items.factura_id = facturas.id
- factura_items.producto_id = productos.id
- factura_items.empresa_id = empresas.id

**Índices:**
- `factura_items_pkey`

### facturas  (1185 filas)
**Columnas:**
- `id` — integer
- `numero` — text
- `cliente_id` — integer
- `fecha` — date
- `total` — numeric
- `estado` — text
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric
- `cantidad` — integer
- `costo` — numeric

**Relaciones (FK):**
- facturas.empresa_id = empresas.id
- facturas.cliente_id = clientes.id

**Referenciada por:**
- factura_detalle.factura_id = facturas.id
- factura_items.factura_id = facturas.id
- notas_credito.factura_id = facturas.id
- notas_debito.factura_id = facturas.id
- pagos.factura_id = facturas.id

**Índices:**
- `facturas_cliente_id_idx`
- `facturas_estado_idx`
- `facturas_fecha_idx`
- `facturas_pkey`

### feedback_ia  (0 filas)
**Columnas:**
- `id` — bigint
- `log_id` — bigint
- `util` — boolean
- `comentario` — text
- `creado_en` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- feedback_ia.empresa_id = empresas.id
- feedback_ia.log_id = logs_ia.id

**Índices:**
- `feedback_ia_pkey`

### gastos  (2315 filas)
**Columnas:**
- `id` — integer
- `fecha` — date
- `categoria` — text
- `descripcion` — text
- `monto` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- gastos.empresa_id = empresas.id

**Índices:**
- `gastos_fecha_idx`
- `gastos_pkey`

### guias_remision  (0 filas)
**Columnas:**
- `id` — integer
- `cliente_id` — integer
- `fecha` — date
- `direccion_partida` — text
- `direccion_llegada` — text
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- guias_remision.empresa_id = empresas.id
- guias_remision.cliente_id = clientes.id

**Índices:**
- `guias_remision_pkey`

### ia_memory  (300 filas)
**Columnas:**
- `id` — integer
- `pregunta` — text
- `respuesta` — text
- `created_at` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- ia_memory.empresa_id = empresas.id

**Índices:**
- `ia_memory_pkey`

### kardex  (1000 filas)
**Columnas:**
- `id` — integer
- `producto_id` — integer
- `fecha` — timestamp without time zone
- `tipo_movimiento` — character varying
- `cantidad` — numeric
- `saldo` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `subtotal` — numeric

**Relaciones (FK):**
- kardex.producto_id = productos.id
- kardex.empresa_id = empresas.id

**Índices:**
- `kardex_pkey`

### logs_ia  (561 filas)
**Columnas:**
- `id` — integer
- `pregunta` — text
- `respuesta` — text
- `usuario_id` — integer
- `created_at` — timestamp without time zone
- `latencia_ms` — integer
- `sesion_id` — uuid
- `intent` — character varying
- `agente` — character varying
- `sql_generado` — text
- `filas` — integer
- `modo_ia` — character varying
- `error` — text
- `creado_en` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- logs_ia.empresa_id = empresas.id

**Referenciada por:**
- feedback_ia.log_id = logs_ia.id

**Índices:**
- `logs_ia_pkey`

### lotes  (300 filas)
**Columnas:**
- `id` — integer
- `producto_id` — integer
- `lote` — character varying
- `fecha_vencimiento` — date
- `stock` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- lotes.producto_id = productos.id
- lotes.empresa_id = empresas.id

**Índices:**
- `lotes_pkey`

### marcas  (0 filas)
**Columnas:**
- `id` — integer
- `nombre` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- marcas.empresa_id = empresas.id

**Índices:**
- `marcas_pkey`

### mensajes  (0 filas)
**Columnas:**
- `id` — integer
- `sesion_id` — integer
- `rol` — text
- `contenido` — text
- `agente` — text
- `datos` — jsonb
- `creado_en` — timestamp without time zone

**Índices:**
- `mensajes_pkey`

### mensajes_chat  (1131 filas)
**Columnas:**
- `id` — bigint
- `sesion_id` — uuid
- `rol` — character varying
- `agente` — character varying
- `contenido` — text
- `datos` — jsonb
- `creado_en` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- mensajes_chat.empresa_id = empresas.id
- mensajes_chat.sesion_id = sesiones_chat.id

**Índices:**
- `mensajes_chat_pkey`

### monedas  (0 filas)
**Columnas:**
- `id` — integer
- `codigo` — character varying
- `nombre` — character varying
- `simbolo` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- monedas.empresa_id = empresas.id

**Índices:**
- `monedas_pkey`

### movimientos  (200 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `cuenta_id` — integer
- `debe` — numeric
- `haber` — numeric
- `saldo` — numeric
- `fecha` — timestamp without time zone
- `stock_min` — integer
- `subtotal` — numeric

**Índices:**
- `movimientos_pkey`

### notas_credito  (0 filas)
**Columnas:**
- `id` — integer
- `factura_id` — integer
- `fecha` — date
- `motivo` — text
- `monto` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- notas_credito.empresa_id = empresas.id
- notas_credito.factura_id = facturas.id

**Índices:**
- `notas_credito_pkey`

### notas_debito  (0 filas)
**Columnas:**
- `id` — integer
- `factura_id` — integer
- `fecha` — date
- `motivo` — text
- `monto` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- notas_debito.empresa_id = empresas.id
- notas_debito.factura_id = facturas.id

**Índices:**
- `notas_debito_pkey`

### oportunidades  (200 filas)
**Columnas:**
- `id` — integer
- `cliente_id` — integer
- `descripcion` — text
- `monto_estimado` — numeric
- `estado` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- oportunidades.cliente_id = clientes.id
- oportunidades.empresa_id = empresas.id

**Índices:**
- `oportunidades_pkey`

### pagos  (1004 filas)
**Columnas:**
- `id` — integer
- `factura_id` — integer
- `fecha` — timestamp without time zone
- `metodo_pago` — character varying
- `monto` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric
- `total` — numeric

**Relaciones (FK):**
- pagos.empresa_id = empresas.id
- pagos.factura_id = facturas.id

**Índices:**
- `pagos_pkey`

### planillas  (5 filas)
**Columnas:**
- `id` — integer
- `empleado_id` — integer
- `periodo` — character varying
- `sueldo` — numeric
- `descuentos` — numeric
- `neto` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- planillas.empleado_id = empleados.id
- planillas.empresa_id = empresas.id

**Índices:**
- `planillas_pkey`

### productos  (215 filas)
**Columnas:**
- `id` — integer
- `nombre` — text
- `precio` — numeric
- `costo` — numeric
- `stock` — integer
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- productos.empresa_id = empresas.id

**Referenciada por:**
- compra_detalle.producto_id = productos.id
- factura_detalle.producto_id = productos.id
- factura_items.producto_id = productos.id
- kardex.producto_id = productos.id
- lotes.producto_id = productos.id

**Índices:**
- `productos_pkey`

### proveedores  (56 filas)
**Columnas:**
- `id` — integer
- `nombre` — text
- `documento` — text
- `email` — text
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- proveedores.empresa_id = empresas.id

**Referenciada por:**
- compras.proveedor_id = proveedores.id

**Índices:**
- `proveedores_pkey`

### proyectos  (100 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `nombre` — character varying
- `descripcion` — text
- `estado` — character varying
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- proyectos.empresa_id = empresas.id

**Referenciada por:**
- tareas.proyecto_id = proyectos.id

**Índices:**
- `proyectos_pkey`

### roles  (1 filas)
**Columnas:**
- `id` — integer
- `nombre` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- roles.empresa_id = empresas.id

**Referenciada por:**
- usuario_roles.rol_id = roles.id

**Índices:**
- `roles_pkey`

### sesiones  (0 filas)
**Columnas:**
- `id` — integer
- `usuario_id` — integer
- `titulo` — text
- `creado_en` — timestamp without time zone

**Índices:**
- `sesiones_pkey`

### sesiones_chat  (224 filas)
**Columnas:**
- `id` — uuid
- `usuario_id` — integer
- `titulo` — character varying
- `creado_en` — timestamp without time zone
- `actualizado` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- sesiones_chat.empresa_id = empresas.id
- sesiones_chat.usuario_id = usuarios.id

**Referenciada por:**
- mensajes_chat.sesion_id = sesiones_chat.id

**Índices:**
- `sesiones_chat_pkey`

### sucursales  (0 filas)
**Columnas:**
- `id` — integer
- `empresa_id` — integer
- `nombre` — character varying
- `direccion` — text
- `telefono` — character varying
- `activo` — boolean
- `creado_en` — timestamp without time zone
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- sucursales.empresa_id = empresas.id

**Referenciada por:**
- almacenes.sucursal_id = sucursales.id

**Índices:**
- `sucursales_pkey`

### tareas  (500 filas)
**Columnas:**
- `id` — integer
- `proyecto_id` — integer
- `titulo` — character varying
- `descripcion` — text
- `estado` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- tareas.empresa_id = empresas.id
- tareas.proyecto_id = proyectos.id

**Índices:**
- `tareas_pkey`

### tickets  (100 filas)
**Columnas:**
- `id` — integer
- `cliente_id` — integer
- `asunto` — character varying
- `descripcion` — text
- `estado` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- tickets.empresa_id = empresas.id
- tickets.cliente_id = clientes.id

**Índices:**
- `tickets_pkey`

### tipo_cambio  (0 filas)
**Columnas:**
- `id` — integer
- `fecha` — date
- `compra` — numeric
- `venta` — numeric
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- tipo_cambio.empresa_id = empresas.id

**Índices:**
- `tipo_cambio_pkey`

### unidades_medida  (0 filas)
**Columnas:**
- `id` — integer
- `codigo` — character varying
- `descripcion` — character varying
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- unidades_medida.empresa_id = empresas.id

**Índices:**
- `unidades_medida_pkey`

### users  (1 filas)
**Columnas:**
- `id` — integer
- `email` — text
- `password_hash` — text
- `nombre` — text
- `rol` — text
- `creado_en` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- users.empresa_id = empresas.id

**Índices:**
- `users_email_key`
- `users_pkey`

### usuario_roles  (1 filas)
**Columnas:**
- `usuario_id` — integer
- `rol_id` — integer
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- usuario_roles.rol_id = roles.id
- usuario_roles.usuario_id = usuarios.id
- usuario_roles.empresa_id = empresas.id

### usuarios  (3 filas)
**Columnas:**
- `id` — integer
- `nombre` — character varying
- `correo` — character varying
- `password` — character varying
- `activo` — boolean
- `empresa_id` — integer
- `email` — character varying
- `password_hash` — text
- `rol` — character varying
- `estado` — boolean
- `fecha_creacion` — timestamp without time zone
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- usuarios.empresa_id = empresas.id

**Referenciada por:**
- sesiones_chat.usuario_id = usuarios.id
- usuario_roles.usuario_id = usuarios.id

**Índices:**
- `usuarios_correo_key`
- `usuarios_pkey`

### ventas  (515 filas)
**Columnas:**
- `id` — integer
- `cliente_id` — integer
- `producto` — character varying
- `cantidad` — integer
- `precio` — numeric
- `total` — numeric
- `fecha` — timestamp without time zone
- `empresa_id` — integer
- `stock_min` — integer
- `saldo` — numeric
- `subtotal` — numeric

**Relaciones (FK):**
- ventas.empresa_id = empresas.id

**Índices:**
- `ventas_pkey`
