"use strict";
/**
 * v7 - Document Engine
 * Plantillas dinámicas tipo Mustache + render HTML para factura, libros, reportes.
 * El render a PDF se delega a un adapter inyectable (pdfRenderer) para no atar Workers.
 */
function render(template, data) {
  const withLoops = String(template).replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, path, inner) => {
    const arr = path.split(".").reduce((o, k) => (o == null ? o : o[k]), data) || [];
    return arr.map((item) => render(inner, { ...data, this: item, ...item })).join("");
  });
  return withLoops.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), data);
    return v == null ? "" : String(v);
  });
}

const TEMPLATES = {
  factura: `<!doctype html><html><body>
    <h1>Factura {{serie}}-{{correlativo}}</h1>
    <p>Emisor: {{emisor.nombre}} (RUC {{emisor.ruc}})</p>
    <p>Cliente: {{cliente.nombre}}</p>
    <table border="1" cellpadding="4"><tr><th>Item</th><th>Cant</th><th>Precio</th><th>Total</th></tr>
      {{#each items}}<tr><td>{{descripcion}}</td><td>{{cantidad}}</td><td>{{precio}}</td><td>{{total}}</td></tr>{{/each}}
    </table>
    <p><b>Subtotal:</b> {{subtotal}} | <b>IGV:</b> {{igv}} | <b>Total:</b> {{total}}</p>
  </body></html>`,
  libroDiario: `<!doctype html><html><body>
    <h1>Libro Diario {{periodo}}</h1>
    <table border="1" cellpadding="4"><tr><th>Fecha</th><th>Cuenta</th><th>Debe</th><th>Haber</th></tr>
      {{#each asientos}}<tr><td>{{fecha}}</td><td>{{cuenta}}</td><td>{{debe}}</td><td>{{haber}}</td></tr>{{/each}}
    </table>
  </body></html>`,
};

function createDocumentEngine({ templates = TEMPLATES, pdfRenderer } = {}) {
  function renderHtml(name, data) {
    const tpl = templates[name];
    if (!tpl) throw new Error(`document: template not found: ${name}`);
    return render(tpl, data);
  }
  async function renderPdf(name, data) {
    if (!pdfRenderer) throw new Error("document: pdfRenderer adapter required");
    return pdfRenderer(renderHtml(name, data));
  }
  function registerTemplate(name, tpl) { templates[name] = tpl; }
  return { render, renderHtml, renderPdf, registerTemplate, templates };
}

module.exports = { createDocumentEngine, render };
