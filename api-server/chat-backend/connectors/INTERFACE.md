# Interfaz de Conectores

Cualquier archivo en este directorio que termine en `.connector.js` puede ser
seleccionado vía `CONNECTOR=<nombre>` en `.env`.

Cada conector DEBE exportar:

```js
module.exports = {
  // Lectura tabular
  async query(sql, params) { /* opcional, motor SQL genérico */ },

  // Endpoints semánticos (todos opcionales — el motor cae al SQL genérico si no existen)
  async getVentas({ empresaId, desde, hasta, sucursalId }) {},
  async getCompras({ empresaId, desde, hasta }) {},
  async getClientes({ empresaId, buscar }) {},
  async getProveedores({ empresaId }) {},
  async getFacturas({ empresaId, estado, desde, hasta }) {},
  async getProductos({ empresaId, bajoStock }) {},
  async getInventario({ empresaId }) {},
  async getTesoreria({ empresaId }) {},
  async getRankingClientes({ empresaId, orden, limite }) {},
  async getRankingProductos({ empresaId, orden, limite }) {},
  async getCuentasPorCobrar({ empresaId }) {},
  async getCuentasPorPagar({ empresaId }) {},
  async getResumenNegocio({ empresaId }) {},
};
```

Ver `postgres.connector.js` como referencia. Para conectar Siigo, QuickBooks,
Alegra, Contabilium, SAP B1, etc., basta con implementar estos métodos
contra su API/REST y devolver arrays de objetos planos.
