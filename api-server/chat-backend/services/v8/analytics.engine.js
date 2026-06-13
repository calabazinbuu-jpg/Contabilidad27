// ============================================================
//  v8 ANALYTICS ENGINE — patrones analíticos con SQL correcto
//  Cubre las preguntas que antes devolvían "volcado de tabla":
//   • mejor cliente / cliente que compra más / inactivos / debe dinero
//   • producto más vendido / más ingresos / más rentable / sin ventas
//   • stock bajo / valor de inventario / rotación
//   • proveedor que más vende / dependencia / gasto más grande
//   • compras/ventas/facturas por mes · mes más rentable
//   • ticket promedio · factura más alta
//   • flujo de caja (positivo/negativo) · ingresos/egresos del mes
//   • utilidad · margen · IGV (en PEN, contexto Perú)
//   • predicción de ventas · comparativos año vs año
//   • PROYECCIÓN DE CAMPOS ("dame proveedores y su correo")
// ============================================================
const db  = require("../../config/db");
const xls = require("./excel.helper");
const textNumbers = require("../textNumbers.service");

// Top-N por defecto en rankings ("más vendido", "factura más alta", etc.)
const TOP_N = 3;
const TOP_N_LARGO = 5;   // para listas tipo "casi no se venden"
const LISTA_MAX = 10;    // proveedores / clientes / productos listados

const EMP = parseInt(process.env.EMPRESA_ID || "1", 10);

function norm(s) {
  return (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function dinero(n) { return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Helpers temporales ────────────────────────────────────────
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function nombreMes(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${MESES[dt.getMonth()]} ${dt.getFullYear()}`;
}
function detectarRango(t) {
  const hoy = new Date(); const y = hoy.getFullYear();
  if (/\bhoy\b/.test(t))               return { tipo:"dia",  inicio: today(),  fin: today(),  label:"hoy" };
  if (/\bayer\b/.test(t))              { const a=new Date(hoy); a.setDate(a.getDate()-1); const d=fmt(a); return { tipo:"dia", inicio:d, fin:d, label:"ayer" }; }
  if (/\b(este mes|del mes|mes actual)\b/.test(t)) return monthRange(hoy);
  if (/\b(mes pasado|mes anterior)\b/.test(t)) { const a=new Date(y, hoy.getMonth()-1, 1); return monthRange(a); }
  if (/\b(este (a[nñ]o|año)|a[nñ]o actual|anual)\b/.test(t)) return { tipo:"anio", inicio:`${y}-01-01`, fin:`${y}-12-31`, label:`${y}` };
  const my = t.match(/\b(20\d{2})\b/); if (my) { const yr=+my[1]; return { tipo:"anio", inicio:`${yr}-01-01`, fin:`${yr}-12-31`, label:`${yr}` }; }
  return null;
}
function today() { const d=new Date(); return fmt(d); }
function fmt(d)  { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
function monthRange(d) {
  const y=d.getFullYear(), m=d.getMonth();
  const fin=new Date(y, m+1, 0);
  return { tipo:"mes", inicio:fmt(new Date(y,m,1)), fin:fmt(fin), label:`${MESES[m]} ${y}` };
}

// ── Empresa filter helper ─────────────────────────────────────
async function tieneColumna(tabla, col) {
  try {
    const r = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1`, [tabla, col]
    );
    return r.rowCount > 0;
  } catch { return false; }
}
async function whereEmpresa(tabla, alias="") {
  const a = alias ? `${alias}.` : "";
  if (await tieneColumna(tabla, "empresa_id")) return { sql: `${a}empresa_id = ${EMP}`, ok:true };
  return { sql: "TRUE", ok:false };
}

async function columnaReal(tabla, candidatos) {
  for (const c of candidatos) if (await tieneColumna(tabla, c)) return c;
  return null;
}

async function camposMaestros(tabla, campos) {
  const mapa = {
    id: ["id"], nombre: ["nombre", "razon_social", "descripcion", "name"],
    documento: ["documento", "ruc", "dni", "nit"], ruc: ["ruc", "documento", "dni", "nit"],
    email: ["email", "correo", "mail"], correo: ["correo", "email", "mail"],
    telefono: ["telefono", "celular", "whatsapp"], ciudad: ["ciudad"], direccion: ["direccion"],
    saldo: ["saldo"], precio: ["precio"], costo: ["costo"], stock: ["stock"], stock_min: ["stock_min"]
  };
  const selects = [];
  for (const campo of ["id", ...campos]) {
    const real = await columnaReal(tabla, mapa[campo] || [campo]);
    if (real && !selects.some(x => x.real === real)) selects.push({ real, alias: campo });
  }
  return selects;
}

// ── Detección de PROYECCIÓN ("dame X y su email") ────────────
function detectarProyeccion(t) {
  // El campo proyectado siempre es además del nombre.
  const out = ["nombre"];
  if (/\b(correo|email|e-?mail|gmail|mail)\b/.test(t)) out.push("correo");
  if (/\b(telefono|tel[eé]fono|celular|movil|m[oó]vil|whatsapp|wsp)\b/.test(t)) out.push("telefono");
  if (/\b(ruc|documento|dni|nit)\b/.test(t)) out.push("ruc");
  if (/\b(ciudad|direccion|direcci[oó]n)\b/.test(t)) out.push("ciudad");
  if (/\b(saldo|deuda)\b/.test(t)) out.push("saldo");
  if (/\b(precio)\b/.test(t)) out.push("precio");
  if (/\b(costo)\b/.test(t)) out.push("costo");
  if (/\b(stock|existencia)\b/.test(t)) out.push("stock");
  // si solicita "solo X" sin mencionar nombre, conservamos nombre igual
  return [...new Set(out)];
}
function filtrarProyeccion(rows, cols) {
  if (!rows?.length) return rows;
  return rows.map(r => {
    const o = {};
    cols.forEach(c => { if (r[c] != null) o[c] = r[c]; });
    if (!Object.keys(o).length) return r; // fallback
    return o;
  });
}
function renderListaProyectada(titulo, rows, cols) {
  if (!rows?.length) return `📭 ${titulo} — sin resultados.`;
  const lineas = rows.slice(0, 50).map((r,i) => {
    const partes = cols.map(c => r[c] != null ? `${c}: ${r[c]}` : null).filter(Boolean);
    return `${i+1}. ${partes.join(" · ")}`;
  });
  return [`🔎 ${titulo} (${rows.length})`, ...lineas].join("\n");
}

// ── PATRONES ANALÍTICOS ───────────────────────────────────────
async function resolver(pregunta) {
  const t = norm(pregunta);
  const rango = detectarRango(t);
  const dateClause = (col) => rango ? ` AND ${col} BETWEEN '${rango.inicio}' AND '${rango.fin}'` : "";
  const limitePedido = textNumbers.detectarLimite(pregunta, 500);

  // ╭─ LISTADOS CON PROYECCIÓN ──────────────────────────────╮
  // "dame los proveedores y su correo/email/telefono"
  const mProy = t.match(/\b(dame|damen|muestrame|mu[eé]strame|listar?|lista|ver|enseñame|ens[eé]ñame)\b.*\b(solo|s[oó]lo)?\s*(los|las)?\s*(proveedores|clientes|productos)\b/);
  if (mProy) {
    const entidad = mProy[4];
    const cols = detectarProyeccion(t);
    const pideCampo = /\b(nombre|correo|email|e-?mail|telefono|tel[eé]fono|celular|ruc|documento|dni|saldo|deuda|precio|costo|stock|ciudad|direccion|direcci[oó]n)\b/.test(t);
    if (cols.length > 1 || (/\b(solo|s[oó]lo|unicamente|[uú]nicamente)\b/.test(t) && pideCampo)) {
      const tabla = entidad;
      let sql, params=[];
      const campos = entidad === "productos" ? ["nombre", "precio", "costo", "stock"] : cols;
      const reales = await camposMaestros(tabla, campos);
      if (!reales.length) return null;
      const colNombre = reales.find(x => x.alias === "nombre")?.real || reales[0].real;
      const select = reales.map(x => x.real === x.alias ? x.real : `${x.real} AS ${x.alias}`).join(", ");
      sql = `SELECT ${select} FROM ${tabla}`;
      if (await tieneColumna(tabla, "empresa_id")) sql += ` WHERE empresa_id = ${EMP}`;
      sql += ` ORDER BY ${colNombre} ASC LIMIT ${limitePedido || 200}`;
      try {
        let r = await db.query(sql, params);
        if (!r.rows.length && sql.includes(" WHERE empresa_id")) {
          const sql2 = sql.replace(/\s+WHERE empresa_id = \d+/, "");
          const r2 = await db.query(sql2, params);
          if (r2.rows.length) { r = r2; sql = sql2; }
        }
        const filtradas = filtrarProyeccion(r.rows, cols);
        return {
          agente:"analytics", intent:`lista_${entidad}_proyeccion`, sql, datos: filtradas,
          respuesta: renderListaProyectada(`${entidad} — campos: ${cols.join(", ")}`, filtradas, cols),
        };
      } catch(e){ return null; }
    }
  }

  // ╭─ CLIENTES ─────────────────────────────────────────────╮
  // "mejor cliente / cliente que compra más / compran más seguido"
  if (/\b(mejor(es)? clientes?|cliente.*(compra|gasta).*(m[aá]s|mayor)|top clientes?|cliente.*frecuent|compran (m[aá]s )?seguid)\b/.test(t)) {
    const lim = limitePedido || 10;
    const usaFacturas = await tieneColumna("facturas", "cliente_id") && await columnaReal("facturas", ["total", "monto", "subtotal"]);
    const fuente = usaFacturas ? "facturas" : "ventas";
    if (!await tieneColumna(fuente, "cliente_id")) return null;
    const totalCol = await columnaReal(fuente, ["total", "monto", "subtotal"]);
    const fechaCol = await columnaReal(fuente, ["fecha", "fecha_emision", "created_at"]);
    if (!totalCol) return null;
    const empCli = await whereEmpresa("clientes", "c");
    const empMov = await whereEmpresa(fuente, "f");
    const fecha = rango && fechaCol ? ` AND f.${fechaCol} BETWEEN '${rango.inicio}' AND '${rango.fin}'` : "";
    const sql = `
      SELECT c.id, c.nombre, COUNT(f.id)::int AS operaciones,
             COALESCE(SUM(f.${totalCol}),0)::float AS total_comprado
      FROM clientes c
      LEFT JOIN ${fuente} f ON f.cliente_id = c.id AND ${empMov.sql}${fecha}
      WHERE ${empCli.sql}
      GROUP BY c.id, c.nombre
      ORDER BY total_comprado DESC NULLS LAST
      LIMIT ${lim}`;
    const r = await db.query(sql);
    const lineas = r.rows.map((x,i)=>`${i+1}. ${x.nombre} — S/ ${dinero(x.total_comprado)} en ${x.operaciones} operación(es)`);
    return {
      agente:"analytics", intent:"top_clientes", sql, datos:r.rows,
      respuesta: r.rows.length ? `🏆 Mejores clientes${rango?` (${rango.label})`:""}:\n${lineas.join("\n")}` : "📭 Aún no hay facturas registradas.",
    };
  }

  // "clientes inactivos / en riesgo de abandono"
  if (/\b(clientes? inactiv|riesgo de abandon|sin compr|no (han )?comprad|dej(o|aron) de comprar)\b/.test(t)) {
    const sql = `
      SELECT c.id, c.nombre, c.correo,
             MAX(f.fecha) AS ultima_compra,
             (CURRENT_DATE - MAX(f.fecha))::int AS dias_sin_comprar
      FROM clientes c
      LEFT JOIN facturas f ON f.cliente_id = c.id
      GROUP BY c.id, c.nombre, c.correo
      HAVING MAX(f.fecha) IS NULL OR (CURRENT_DATE - MAX(f.fecha)) > 60
      ORDER BY ultima_compra ASC NULLS FIRST
      LIMIT 25`;
    const r = await db.query(sql);
    const lineas = r.rows.map((x,i)=>`${i+1}. ${x.nombre} — última: ${x.ultima_compra || "nunca"}${x.dias_sin_comprar!=null?` (${x.dias_sin_comprar}d)`:""}`);
    return { agente:"analytics", intent:"clientes_inactivos", sql, datos:r.rows,
      respuesta: r.rows.length ? `😴 Clientes inactivos (>60 días):\n${lineas.join("\n")}` : "✅ Todos tus clientes han comprado en los últimos 60 días." };
  }

  // "clientes que deben dinero / por cobrar"
  if (/\b(clientes? (que )?deben dinero|me deben|por cobrar|deudores?|saldo pendient)\b/.test(t)) {
    const sql = `
      SELECT c.id, c.nombre,
             COALESCE(SUM(f.saldo),0)::float AS deuda,
             COUNT(f.id) FILTER (WHERE f.estado IN ('pendiente','parcial'))::int AS facturas_pendientes
      FROM clientes c
      LEFT JOIN facturas f ON f.cliente_id = c.id
      GROUP BY c.id, c.nombre
      HAVING COALESCE(SUM(f.saldo),0) > 0
      ORDER BY deuda DESC LIMIT 25`;
    const r = await db.query(sql);
    const lineas = r.rows.map((x,i)=>`${i+1}. ${x.nombre} — S/ ${dinero(x.deuda)} (${x.facturas_pendientes} fact. pendientes)`);
    return { agente:"analytics", intent:"clientes_deuda", sql, datos:r.rows,
      respuesta: r.rows.length ? `💸 Clientes con saldo pendiente:\n${lineas.join("\n")}` : "✅ Ningún cliente tiene saldo pendiente." };
  }

  // "clientes nuevos por mes"
  if (/\bclientes? nuev/.test(t)) {
    const sql = `
      SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes, COUNT(*)::int AS nuevos
      FROM clientes
      WHERE creado_en >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1`;
    const r = await db.query(sql);
    if (!r.rows.length) return { agente:"analytics", intent:"clientes_nuevos_mes", sql, datos:[], respuesta:"📭 No hay registros de fecha de creación de clientes." };
    return { agente:"analytics", intent:"clientes_nuevos_mes", sql, datos:r.rows,
      respuesta: `🆕 Clientes nuevos por mes:\n${r.rows.map(x=>`• ${x.mes}: ${x.nuevos}`).join("\n")}` };
  }

  // "valor total por cliente"
  if (/\bvalor total por cliente|cu[aá]nto.*por cliente|total comprado por cliente\b/.test(t)) {
    const sql = `
      SELECT c.nombre, COALESCE(SUM(f.total),0)::float AS total
      FROM clientes c LEFT JOIN facturas f ON f.cliente_id=c.id
      GROUP BY c.nombre HAVING COALESCE(SUM(f.total),0)>0
      ORDER BY total DESC LIMIT 25`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"valor_por_cliente", sql, datos:r.rows,
      respuesta: r.rows.length ? `📊 Valor total por cliente:\n${r.rows.map((x,i)=>`${i+1}. ${x.nombre} — S/ ${dinero(x.total)}`).join("\n")}` : "📭 Sin facturas registradas." };
  }

  // ╭─ PRODUCTOS ────────────────────────────────────────────╮
  // "producto más vendido / qué productos compro/vendo más"
  if (/\b(producto.*(m[aá]s|mejor|top|estrella).*vendid|m[aá]s vendid|qu[eé] vendi m[aá]s|producto.*mayor.*venta|top \d+ productos? vend)\b/.test(t)) {
    const sql = `
      SELECT producto, SUM(cantidad)::int AS unidades, COALESCE(SUM(total),0)::float AS ingresos
      FROM ventas WHERE TRUE ${dateClause("fecha")}
      GROUP BY producto ORDER BY unidades DESC LIMIT 50`;
    const r = await db.query(sql);
    const top = r.rows.slice(0, TOP_N);
    const url = r.rows.length > TOP_N ? await xls.exportar("productos_mas_vendidos", r.rows) : null;
    const lineas = top.map((x,i)=>`${i+1}. ${x.producto} — ${x.unidades} u · S/ ${dinero(x.ingresos)}`);
    const extra  = r.rows.length > TOP_N ? `\n… y ${r.rows.length - TOP_N} producto(s) más.${url?` 📥 Lista completa: ${url}`:""}` : "";
    return { agente:"analytics", intent:"top_productos_vendidos", sql, datos:r.rows, archivo:url,
      respuesta: r.rows.length ? `🏆 Top ${top.length} productos más vendidos${rango?` (${rango.label})`:""}:\n${lineas.join("\n")}${extra}` : "📭 No hay ventas registradas." };
  }

  // "producto genera más ingresos"
  if (/\bproducto.*(genera|trae|aporta).*(mayor|m[aá]s).*ingres|m[aá]s ingres.*producto\b/.test(t)) {
    const sql = `
      SELECT producto, COALESCE(SUM(total),0)::float AS ingresos, SUM(cantidad)::int AS unidades
      FROM ventas WHERE TRUE ${dateClause("fecha")}
      GROUP BY producto ORDER BY ingresos DESC LIMIT 50`;
    const r = await db.query(sql);
    const top = r.rows.slice(0, TOP_N);
    const url = r.rows.length > TOP_N ? await xls.exportar("productos_top_ingresos", r.rows) : null;
    const lineas = top.map((x,i)=>`${i+1}. ${x.producto} — S/ ${dinero(x.ingresos)} (${x.unidades} u)`);
    const extra = r.rows.length>TOP_N ? `\n… y ${r.rows.length-TOP_N} más.${url?` 📥 Excel: ${url}`:""}` : "";
    return { agente:"analytics", intent:"top_productos_ingresos", sql, datos:r.rows, archivo:url,
      respuesta: r.rows.length ? `💰 Top ${top.length} productos con más ingresos${rango?` (${rango.label})`:""}:\n${lineas.join("\n")}${extra}` : "📭 No hay ventas registradas." };
  }

  // "producto más rentable / margen / top rentables"
  if (/\b(producto.*(m[aá]s|mayor).*(rentab|margen|ganancia)|top \d+ productos? rentab|roi.*producto|producto.*roi)\b/.test(t)) {
    const sql = `
      SELECT p.nombre, p.precio, p.costo,
             (p.precio - p.costo)::float AS margen_unit,
             CASE WHEN p.costo>0 THEN ROUND(((p.precio-p.costo)/p.costo*100)::numeric,2) ELSE 0 END AS roi_pct,
             COALESCE(v.unidades,0)::int AS unidades,
             COALESCE(v.unidades,0) * (p.precio - p.costo)::float AS utilidad_total
      FROM productos p
      LEFT JOIN (SELECT producto_id, SUM(cantidad) AS unidades FROM ventas WHERE producto_id IS NOT NULL GROUP BY producto_id) v ON v.producto_id=p.id
      WHERE p.precio > 0
      ORDER BY utilidad_total DESC NULLS LAST, roi_pct DESC LIMIT 50`;
    const r = await db.query(sql);
    const top = r.rows.slice(0, TOP_N);
    const url = r.rows.length > TOP_N ? await xls.exportar("productos_rentables", r.rows) : null;
    const lineas = top.map((x,i)=>`${i+1}. ${x.nombre} — margen S/ ${dinero(x.margen_unit)} · ROI ${x.roi_pct}% · utilidad total S/ ${dinero(x.utilidad_total)}`);
    const extra = r.rows.length>TOP_N ? `\n… y ${r.rows.length-TOP_N} más.${url?` 📥 Excel: ${url}`:""}` : "";
    return { agente:"analytics", intent:"productos_rentables", sql, datos:r.rows, archivo:url,
      respuesta: r.rows.length ? `💎 Top ${top.length} productos rentables:\n${lineas.join("\n")}${extra}` : "📭 Sin productos para calcular." };
  }

  // "productos casi no se venden / debo eliminar / rotación baja"
  if (/\b(productos?.*(casi no|no se|poca|baja|lenta).*vend|productos?.*(rotaci[oó]n).*(baja|lenta)|productos?.*(debo eliminar|elimin|descontinu)|productos?.*(sin (ventas|movimiento))|productos?.*(estancad))\b/.test(t)) {
    const sql = `
      SELECT p.nombre, p.stock, COALESCE(SUM(v.cantidad),0)::int AS vendidos
      FROM productos p LEFT JOIN ventas v ON v.producto_id=p.id
      GROUP BY p.id, p.nombre, p.stock
      ORDER BY vendidos ASC, p.stock DESC LIMIT 100`;
    const r = await db.query(sql);
    const top = r.rows.slice(0, TOP_N_LARGO);
    const url = r.rows.length > TOP_N_LARGO ? await xls.exportar("productos_baja_rotacion", r.rows) : null;
    const lineas = top.map((x,i)=>`${i+1}. ${x.nombre} — vendidos: ${x.vendidos} · stock: ${x.stock}`);
    const extra = r.rows.length>TOP_N_LARGO ? `\n… y ${r.rows.length-TOP_N_LARGO} producto(s) más.${url?` 📥 Lista completa en Excel: ${url}`:""}` : "";
    return { agente:"analytics", intent:"productos_sin_rotacion", sql, datos:r.rows, archivo:url,
      respuesta: r.rows.length ? `🐌 Productos con baja/nula rotación (top ${top.length}):\n${lineas.join("\n")}${extra}` : "📭 Sin productos." };
  }


  // "productos con rotación alta"
  if (/\b(productos?.*(mayor|m[aá]s|alta).*rotaci[oó]n|productos?.*(que generan m[aá]s|mayor) rotaci[oó]n)\b/.test(t)) {
    const sql = `
      SELECT p.nombre, COALESCE(SUM(v.cantidad),0)::int AS vendidos
      FROM productos p LEFT JOIN ventas v ON v.producto_id=p.id
      GROUP BY p.id, p.nombre HAVING COALESCE(SUM(v.cantidad),0)>0
      ORDER BY vendidos DESC LIMIT 10`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"productos_rotacion", sql, datos:r.rows,
      respuesta: r.rows.length ? `⚡ Productos con mayor rotación:\n${r.rows.map((x,i)=>`${i+1}. ${x.nombre} — ${x.vendidos} u vendidas`).join("\n")}` : "📭 No hay ventas." };
  }

  // "stock bajo / agotándose / casi se acaba"
  if (/\b(stock (bajo|cr[ií]tico|m[ií]nimo)|agot[aá]ndose|por agotar|reposici[oó]n|casi (no|sin) stock|bajo inventario)\b/.test(t)) {
    const sql = `
      SELECT nombre, stock, stock_min FROM productos
      WHERE stock <= GREATEST(stock_min, 5)
      ORDER BY stock ASC LIMIT 20`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"stock_bajo", sql, datos:r.rows,
      respuesta: r.rows.length ? `⚠️ Productos con stock bajo:\n${r.rows.map((x,i)=>`${i+1}. ${x.nombre} — stock ${x.stock} / mín ${x.stock_min}`).join("\n")}` : "✅ Ningún producto está bajo el mínimo." };
  }

  // "valor total del inventario"
  if (/\bvalor.*(total)?.*inventario|cu[aá]nto vale (mi |el )?inventario|valor del stock\b/.test(t)) {
    const r = await db.query(`SELECT COALESCE(SUM(stock*costo),0)::float AS valor, COUNT(*)::int AS items, COALESCE(SUM(stock),0)::int AS unidades FROM productos`);
    const x = r.rows[0];
    return { agente:"analytics", intent:"valor_inventario", datos:x,
      respuesta: `📦 Valor total del inventario: S/ ${dinero(x.valor)}\n• Items: ${x.items}\n• Unidades en stock: ${x.unidades}` };
  }

  // "qué productos compro más"
  if (/\b(productos?.*(m[aá]s|mayor).*comp|qu[eé] compro m[aá]s)\b/.test(t)) {
    const sql = `
      SELECT p.nombre, SUM(cd.cantidad)::int AS unidades, COALESCE(SUM(cd.total),0)::float AS gasto
      FROM compras_detalle cd JOIN productos p ON p.id=cd.producto_id
      GROUP BY p.nombre ORDER BY unidades DESC LIMIT 10`;
    try {
      const r = await db.query(sql);
      return { agente:"analytics", intent:"productos_comprados", sql, datos:r.rows,
        respuesta: r.rows.length ? `🛒 Productos más comprados:\n${r.rows.map((x,i)=>`${i+1}. ${x.nombre} — ${x.unidades} u · S/ ${dinero(x.gasto)}`).join("\n")}` : "📭 No hay detalle de compras registrado." };
    } catch { return { agente:"analytics", intent:"productos_comprados", datos:null, respuesta:"📭 No hay tabla de detalle de compras registrada." }; }
  }

  // ╭─ PROVEEDORES ──────────────────────────────────────────╮
  // "qué proveedor vende más / dependencia"
  if (/\b(proveedor.*(m[aá]s|mayor).*(vend|surt|abastec)|dependo de.*proveedor|dependencia.*proveedor|qu[eé] proveedor)\b/.test(t)) {
    const lim = limitePedido || 10;
    const empPr = await whereEmpresa("proveedores", "pr");
    const empC = await whereEmpresa("compras", "c");
    const sql = `
      SELECT pr.nombre, COUNT(c.id)::int AS ordenes, COALESCE(SUM(c.total),0)::float AS total_comprado
      FROM proveedores pr LEFT JOIN compras c ON c.proveedor_id=pr.id AND ${empC.sql}
      WHERE ${empPr.sql}
      GROUP BY pr.id, pr.nombre HAVING COALESCE(SUM(c.total),0)>0
      ORDER BY total_comprado DESC LIMIT ${lim}`;
    const r = await db.query(sql);
    const totalGral = r.rows.reduce((a,x)=>a+Number(x.total_comprado||0),0) || 1;
    const lineas = r.rows.map((x,i)=>{
      const pct = (Number(x.total_comprado)/totalGral*100).toFixed(1);
      return `${i+1}. ${x.nombre} — S/ ${dinero(x.total_comprado)} (${pct}%) · ${x.ordenes} órdenes`;
    });
    return { agente:"analytics", intent:"top_proveedores", sql, datos:r.rows,
      respuesta: r.rows.length ? `🏭 Proveedores por volumen de compra:\n${lineas.join("\n")}` : "📭 No hay compras registradas." };
  }

  // "gasto más grande en compras"
  if (/\b(gasto m[aá]s grande|compra m[aá]s (alta|grande|cara)|mayor compra)\b/.test(t)) {
    const sql = `
      SELECT c.id, c.fecha, pr.nombre AS proveedor, c.total
      FROM compras c LEFT JOIN proveedores pr ON pr.id=c.proveedor_id
      ORDER BY c.total DESC LIMIT 5`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"compras_mayores", sql, datos:r.rows,
      respuesta: r.rows.length ? `💸 Compras más altas:\n${r.rows.map((x,i)=>`${i+1}. ${x.fecha?.toISOString?.().slice(0,10)||x.fecha} — ${x.proveedor||"?"} · S/ ${dinero(x.total)}`).join("\n")}` : "📭 Sin compras." };
  }

  // "cuánto he comprado por mes"
  if (/\b(comp(ras|rado).*por mes|comp(ras|rado) mensual|cu[aá]nto.*comp(ro|re).*mes)\b/.test(t)) {
    const sql = `
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
             COUNT(*)::int AS ordenes, COALESCE(SUM(total),0)::float AS total
      FROM compras WHERE fecha >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"compras_por_mes", sql, datos:r.rows,
      respuesta: r.rows.length ? `🧾 Compras por mes (últimos 12):\n${r.rows.map(x=>`• ${x.mes}: S/ ${dinero(x.total)} (${x.ordenes} ord.)`).join("\n")}` : "📭 No hay compras." };
  }

  // ╭─ VENTAS / FACTURAS ────────────────────────────────────╮
  // "facturas pagadas / pendientes / anuladas / por estado"
  if (/\b(facturas?.*(pagad|pendient|anulad|nul|cobrad|por cobrar|por pagar)|cu[aá]nt(as|os).*facturas?.*(pagad|pendient|nul|anulad)|estado.*factur)\b/.test(t)) {
    const sql = `
      SELECT COALESCE(LOWER(estado),'sin_estado') AS estado,
             COUNT(*)::int AS total, COALESCE(SUM(total),0)::float AS monto
      FROM facturas GROUP BY 1 ORDER BY total DESC`;
    const r = await db.query(sql);
    if (!r.rows.length) return { agente:"analytics", intent:"facturas_estado", sql, datos:[], respuesta:"📭 No hay facturas registradas." };
    const lineas = [];
    const archivos = {};
    for (const row of r.rows) {
      const det = await db.query(
        `SELECT id, serie, numero, fecha, cliente_id, total, estado
         FROM facturas WHERE COALESCE(LOWER(estado),'sin_estado')=$1 ORDER BY fecha DESC LIMIT 500`,
        [row.estado]
      );
      const url = await xls.exportar(`facturas_${row.estado}`, det.rows);
      archivos[row.estado] = url;
      lineas.push(`• ${row.estado.toUpperCase()}: ${row.total} factura(s) · S/ ${dinero(row.monto)}${url?`  📥 ${url}`:""}`);
    }
    return { agente:"analytics", intent:"facturas_estado", sql, datos:r.rows, archivos,
      respuesta: `🧾 Facturas por estado:\n${lineas.join("\n")}` };
  }

  // "qué día / día más vendido / día gano más / día mes vendo más"
  if (/\b(d[ií]a.*(m[aá]s|mejor).*(vend|ingres|factur|ven d)|qu[eé] d[ií]a.*(vend|gan|factur)|d[ií]a o mes.*vend|mejor d[ií]a|d[ií]a m[aá]s rentable)\b/.test(t)) {
    const sqlD = `
      SELECT fecha::date AS dia,
             COUNT(*)::int AS facturas, COALESCE(SUM(total),0)::float AS ingresos
      FROM facturas
      WHERE fecha IS NOT NULL ${rango?`AND fecha BETWEEN '${rango.inicio}' AND '${rango.fin}'`:""}
      GROUP BY 1 ORDER BY ingresos DESC LIMIT ${TOP_N}`;
    const sqlM = `
      SELECT to_char(date_trunc('month', fecha),'YYYY-MM') AS mes,
             COUNT(*)::int AS facturas, COALESCE(SUM(total),0)::float AS ingresos
      FROM facturas
      WHERE fecha IS NOT NULL ${rango?`AND fecha BETWEEN '${rango.inicio}' AND '${rango.fin}'`:""}
      GROUP BY 1 ORDER BY ingresos DESC LIMIT ${TOP_N}`;
    const [rd, rm] = await Promise.all([db.query(sqlD), db.query(sqlM)]);
    if (!rd.rows.length && !rm.rows.length)
      return { agente:"analytics", intent:"dia_mes_top", datos:null, respuesta:"📭 No hay facturas." };
    const dias  = rd.rows.map((x,i)=>`${i+1}. ${x.dia?.toISOString?.().slice(0,10)||x.dia} — S/ ${dinero(x.ingresos)} (${x.facturas} fact.)`);
    const meses = rm.rows.map((x,i)=>`${i+1}. ${x.mes} — S/ ${dinero(x.ingresos)} (${x.facturas} fact.)`);
    return { agente:"analytics", intent:"dia_mes_top", datos:{dias:rd.rows, meses:rm.rows},
      respuesta: `📅 Top ${TOP_N} días con más ventas:\n${dias.join("\n")}\n\n📆 Top ${TOP_N} meses con más ventas:\n${meses.join("\n")}` };
  }

  // "mes más rentable / mejor mes / qué mes vendo más"
  if (/\b(mes.*(m[aá]s|mejor).*(rentab|ventas|vendid|ingres|gan)|mejor mes|qu[eé] mes.*(vendo|gan|factur|rentab)|mes.*mayor.*vent|mes m[aá]s rentable)\b/.test(t)) {
    const sql = `
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
             COUNT(*)::int AS facturas, COALESCE(SUM(total),0)::float AS ingresos
      FROM facturas WHERE fecha IS NOT NULL GROUP BY 1 ORDER BY ingresos DESC`;
    const r = await db.query(sql);
    if (!r.rows.length) return { agente:"analytics", intent:"mes_rentable", sql, datos:[], respuesta:"📭 No hay facturas registradas." };
    const top = r.rows[0];
    const lista = r.rows.slice(0, TOP_N).map((x,i)=>`${i+1}. ${x.mes} — S/ ${dinero(x.ingresos)} (${x.facturas} fact.)`);
    const url = r.rows.length > TOP_N ? await xls.exportar("ventas_por_mes", r.rows) : null;
    const extra = r.rows.length>TOP_N ? `\n📥 Excel completo: ${url||""}` : "";
    return { agente:"analytics", intent:"mes_rentable", sql, datos:r.rows, archivo:url,
      respuesta: `🏆 Mes más rentable: ${top.mes} — S/ ${dinero(top.ingresos)} en ${top.facturas} facturas.\n\nTop ${TOP_N} meses:\n${lista.join("\n")}${extra}` };
  }

  // "factura más alta/grande"
  if (/\b(factura m[aá]s (alta|grande|cara)|mayor factura|factura.*mayor.*importe)\b/.test(t)) {
    const sql = `
      SELECT f.id, f.serie, f.numero, f.fecha, f.total, c.nombre AS cliente
      FROM facturas f LEFT JOIN clientes c ON c.id=f.cliente_id
      ORDER BY f.total DESC LIMIT 50`;
    const r = await db.query(sql);
    const top = r.rows.slice(0, TOP_N);
    const url = r.rows.length > TOP_N ? await xls.exportar("facturas_mas_altas", r.rows) : null;
    const lineas = top.map((x,i)=>`${i+1}. ${x.serie||""}-${x.numero||""} (${x.fecha?.toISOString?.().slice(0,10)||x.fecha}) — ${x.cliente||"?"} · S/ ${dinero(x.total)}`);
    const extra = r.rows.length>TOP_N ? `\n… y ${r.rows.length-TOP_N} más.${url?` 📥 Excel: ${url}`:""}` : "";
    return { agente:"analytics", intent:"factura_mayor", sql, datos:r.rows, archivo:url,
      respuesta: r.rows.length ? `🧾 Top ${top.length} facturas más altas:\n${lineas.join("\n")}${extra}` : "📭 Sin facturas." };
  }


  // "ticket promedio / promedio de facturación"
  if (/\b(ticket (promedio|medio)|promedio.*factur|factur.*promedio|valor promedio.*factur)\b/.test(t)) {
    const sql = `SELECT COALESCE(AVG(total),0)::float AS promedio, COUNT(*)::int AS n FROM facturas`;
    const r = await db.query(sql);
    const x = r.rows[0];
    return { agente:"analytics", intent:"ticket_promedio", sql, datos:x,
      respuesta: `🎟️ Ticket promedio: S/ ${dinero(x.promedio)} (sobre ${x.n} facturas)` };
  }

  // ╭─ FLUJO / TESORERÍA ────────────────────────────────────╮
  if (/\b(saldo (actual )?(de )?caja|saldo en bancos?|cu[aá]nto tengo en caja|liquidez actual)\b/.test(t)) {
    const sql = `SELECT COALESCE(SUM(saldo),0)::float AS total, COUNT(*)::int AS cuentas FROM cuentas_bancarias`;
    try {
      const r = await db.query(sql);
      const x = r.rows[0];
      return { agente:"analytics", intent:"saldo_caja", sql, datos:x,
        respuesta: x.cuentas ? `💰 Saldo total disponible: S/ ${dinero(x.total)} en ${x.cuentas} cuenta(s).` : "📭 No hay cuentas bancarias registradas." };
    } catch { return { agente:"analytics", intent:"saldo_caja", datos:null, respuesta:"📭 No hay módulo de tesorería configurado." }; }
  }

  if (/\b(dinero (entr[oó]|ingres[oó]) este mes|ingresos? (de )?este mes|cu[aá]nto.*ingres[oó].*este mes)\b/.test(t)) {
    const m = monthRange(new Date());
    const sql = `SELECT COALESCE(SUM(total),0)::float AS ingresos FROM facturas WHERE fecha BETWEEN '${m.inicio}' AND '${m.fin}'`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"ingresos_mes", sql, datos:r.rows[0],
      respuesta: `📈 Ingresos de ${m.label}: S/ ${dinero(r.rows[0].ingresos)}` };
  }
  if (/\b(dinero (sali[oó]|egres[oó]) este mes|egresos? (de )?este mes|cu[aá]nto.*sali[oó].*este mes|gast[oó] este mes)\b/.test(t)) {
    const m = monthRange(new Date());
    const sql = `SELECT COALESCE(SUM(total),0)::float AS egresos FROM compras WHERE fecha BETWEEN '${m.inicio}' AND '${m.fin}'`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"egresos_mes", sql, datos:r.rows[0],
      respuesta: `📉 Egresos (compras) de ${m.label}: S/ ${dinero(r.rows[0].egresos)}` };
  }

  if (/\b(flujo (positivo|negativo)|estoy ganando o perdiendo|ganando o perdiendo|flujo de caja|cash ?flow|cu[aá]nto.*entra.*sale|dinero.*entra.*sale)\b/.test(t)) {
    const m = monthRange(new Date());
    const [rv, rc] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0)::float v FROM ventas WHERE fecha BETWEEN '${m.inicio}' AND '${m.fin}'`),
      db.query(`SELECT COALESCE(SUM(total),0)::float c FROM compras WHERE fecha BETWEEN '${m.inicio}' AND '${m.fin}'`),
    ]);
    const v = +rv.rows[0].v, c = +rc.rows[0].c, neto = v - c;
    const estado = neto > 0 ? "🟢 POSITIVO" : neto < 0 ? "🔴 NEGATIVO" : "⚪ NEUTRO";
    return { agente:"analytics", intent:"flujo", datos:{ventas:v,compras:c,neto},
      respuesta: `${estado} — Flujo de ${m.label}\n• Ingresos (ventas):  S/ ${dinero(v)}\n• Egresos (compras): S/ ${dinero(c)}\n• Neto: S/ ${dinero(neto)}` };
  }

  if (/\b(d[ií]as? (en )?(que )?gast(o|amos) m[aá]s|mayor gasto por d[ií]a)\b/.test(t)) {
    const sql = `
      SELECT fecha, COALESCE(SUM(total),0)::float AS total, COUNT(*)::int AS ordenes
      FROM compras WHERE fecha >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY fecha ORDER BY total DESC LIMIT 10`;
    const r = await db.query(sql);
    return { agente:"analytics", intent:"dias_gasto", sql, datos:r.rows,
      respuesta: r.rows.length ? `📅 Días con mayor gasto (90d):\n${r.rows.map((x,i)=>`${i+1}. ${x.fecha?.toISOString?.().slice(0,10)||x.fecha} — S/ ${dinero(x.total)} (${x.ordenes} compras)`).join("\n")}` : "📭 No hay compras recientes." };
  }

  // ╭─ UTILIDAD / MARGEN / IGV (Perú) ───────────────────────╮
  if (/\b(utilidad|ganancia.*(total|negocio)|cu[aá]nto gan(e|é|o|amos))\b/.test(t)) {
    // Si el usuario menciona 2+ años → comparativo año por año
    const yrs = [...new Set([...t.matchAll(/\b(20\d{2})\b/g)].map(m=>+m[1]))];
    if (yrs.length >= 2) {
      const rows = [];
      for (const y of yrs) {
        const rv = await db.query(`SELECT COALESCE(SUM(total),0)::float v FROM ventas WHERE fecha BETWEEN '${y}-01-01' AND '${y}-12-31'`);
        const rc = await db.query(`SELECT COALESCE(SUM(total),0)::float c FROM compras WHERE fecha BETWEEN '${y}-01-01' AND '${y}-12-31'`);
        rows.push({ anio:y, ventas:+rv.rows[0].v, compras:+rc.rows[0].c, utilidad:+rv.rows[0].v - +rc.rows[0].c });
      }
      const lineas = rows.map(x=>`• ${x.anio} → Ventas: S/ ${dinero(x.ventas)} · Compras: S/ ${dinero(x.compras)} · Utilidad: S/ ${dinero(x.utilidad)}`);
      // Variaciones entre años consecutivos
      const cambios = [];
      for (let i=1;i<rows.length;i++){
        const a = rows[i-1], b = rows[i];
        const dif = b.utilidad - a.utilidad;
        const pct = a.utilidad !== 0 ? (dif/Math.abs(a.utilidad)*100).toFixed(1) : "n/a";
        cambios.push(`• ${a.anio} → ${b.anio}: ${dif>=0?"📈":"📉"} S/ ${dinero(dif)} (${pct}%)`);
      }
      return { agente:"analytics", intent:"comparativo_anios", datos:rows,
        respuesta: `📊 Comparativo de utilidad por año:\n${lineas.join("\n")}\n\n🔁 Variación entre años:\n${cambios.join("\n")}` };
    }
    const where = rango ? ` WHERE fecha BETWEEN '${rango.inicio}' AND '${rango.fin}'` : "";
    const [rv,rc] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0)::float v FROM ventas${where}`),
      db.query(`SELECT COALESCE(SUM(total),0)::float c FROM compras${where}`),
    ]);
    const v = +rv.rows[0].v, c = +rc.rows[0].c, u = v - c;
    const m = v>0 ? (u/v*100).toFixed(2) : "0.00";
    return { agente:"analytics", intent:"utilidad", datos:{ventas:v,compras:c,utilidad:u,margen_pct:+m},
      respuesta: `💰 Utilidad${rango?` (${rango.label})`:""}\n• Ventas:   S/ ${dinero(v)}\n• Compras: S/ ${dinero(c)}\n• Utilidad: S/ ${dinero(u)}\n• Margen:   ${m}%` };
  }


  if (/\b(margen (de )?(ganancia|utilidad)?|rentabilidad)\b/.test(t)) {
    const where = rango ? ` WHERE fecha BETWEEN '${rango.inicio}' AND '${rango.fin}'` : "";
    const [rv,rc] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0)::float v FROM ventas${where}`),
      db.query(`SELECT COALESCE(SUM(total),0)::float c FROM compras${where}`),
    ]);
    const v=+rv.rows[0].v, c=+rc.rows[0].c, m = v>0 ? ((v-c)/v*100).toFixed(2) : "0.00";
    return { agente:"analytics", intent:"margen", datos:{margen_pct:+m},
      respuesta: `📈 Margen${rango?` (${rango.label})`:""}: ${m}%\n• Ventas: S/ ${dinero(v)}\n• Compras: S/ ${dinero(c)}` };
  }

  if (/\b(qu[eé] es (el )?igv|explic.*igv|definici[oó]n.*igv|igv\??$)\b/.test(t)) {
    return { agente:"analytics", intent:"explica_igv", datos:null,
      respuesta:"🇵🇪 El IGV (Impuesto General a las Ventas) es el impuesto al consumo en Perú, con una tasa del 18% (16% IGV + 2% IPM). Se aplica a la venta de bienes y servicios y a las importaciones." };
  }
  if (/\b(cu[aá]nto.*igv|igv (cobrad|del mes|total|acumulad))\b/.test(t)) {
    const where = rango ? ` WHERE fecha BETWEEN '${rango.inicio}' AND '${rango.fin}'` : "";
    const r = await db.query(`SELECT COALESCE(SUM(impuesto),0)::float total FROM facturas${where}`);
    return { agente:"analytics", intent:"igv_total", datos:r.rows[0],
      respuesta: `🧾 IGV facturado${rango?` (${rango.label})`:""}: S/ ${dinero(r.rows[0].total)}` };
  }

  // ╭─ PREDICCIÓN Y COMPARATIVOS ────────────────────────────╮
  if (/\bpredic|proyecci[oó]n|pron[oó]stic.*ventas|ventas? (del )?pr[oó]ximo mes\b/.test(t)) {
    const r = await db.query(`
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
             COALESCE(SUM(total),0)::float AS total
      FROM ventas WHERE fecha >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 3`);
    const tot = r.rows.reduce((a,x)=>a+Number(x.total||0),0);
    const promedio = r.rows.length ? tot / r.rows.length : 0;
    return { agente:"analytics", intent:"prediccion_ventas", datos:{base:r.rows, proyeccion:promedio},
      respuesta: `🔮 Predicción ventas próximo mes (promedio últimos ${r.rows.length} meses): S/ ${dinero(promedio)}\n${r.rows.map(x=>`• ${x.mes}: S/ ${dinero(x.total)}`).join("\n")}` };
  }

  if (/\b(comparaci[oó]n|comparar?).*(20\d{2}).*(20\d{2})|\b20\d{2}\s*(vs|contra)\s*20\d{2}\b|\bgan[eé] en 20\d{2}\b/.test(t)) {
    const years = [...t.matchAll(/\b(20\d{2})\b/g)].map(m=>+m[1]);
    const uniq = [...new Set(years)];
    if (uniq.length >= 2) {
      const rows = [];
      for (const y of uniq) {
        const r = await db.query(`SELECT COALESCE(SUM(total),0)::float v FROM ventas WHERE fecha BETWEEN '${y}-01-01' AND '${y}-12-31'`);
        const r2 = await db.query(`SELECT COALESCE(SUM(total),0)::float c FROM compras WHERE fecha BETWEEN '${y}-01-01' AND '${y}-12-31'`);
        rows.push({ anio:y, ventas:+r.rows[0].v, compras:+r2.rows[0].c, utilidad:+r.rows[0].v-+r2.rows[0].c });
      }
      return { agente:"analytics", intent:"comparativo_anios", datos:rows,
        respuesta: `📊 Comparativo por año:\n${rows.map(x=>`• ${x.anio}: Ventas S/ ${dinero(x.ventas)} · Compras S/ ${dinero(x.compras)} · Utilidad S/ ${dinero(x.utilidad)}`).join("\n")}` };
    }
  }

  if (/\b(crec(i|er|iendo)|bajando|tendencia.*venta|cu[aá]nto.*crec)\b/.test(t)) {
    const r = await db.query(`
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
             COALESCE(SUM(total),0)::float AS total
      FROM ventas WHERE fecha >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY 1 ORDER BY 1`);
    if (r.rows.length < 2) return { agente:"analytics", intent:"tendencia", datos:r.rows, respuesta:"📭 No hay suficientes datos para calcular tendencia." };
    const ult = +r.rows[r.rows.length-1].total, prev = +r.rows[r.rows.length-2].total;
    const diff = ult - prev, pct = prev>0 ? (diff/prev*100).toFixed(1) : "0";
    const tend = diff > 0 ? "📈 Estás CRECIENDO" : diff < 0 ? "📉 Estás BAJANDO" : "➡️ Estable";
    return { agente:"analytics", intent:"tendencia", datos:r.rows,
      respuesta: `${tend} en ventas\n• Mes anterior: S/ ${dinero(prev)}\n• Último mes: S/ ${dinero(ult)}\n• Variación: ${pct}%` };
  }

  // ╭─ EMPLEADOS / ASISTENCIAS / CONTABILIDAD (módulos opc.)─╮
  if (/\b(sueldos?|n[oó]mina|empleados? activos|empleados? generan? m[aá]s costo|asistencias?)\b/.test(t)) {
    const tieneEmp = await tieneColumna("empleados","id");
    if (!tieneEmp) return { agente:"analytics", intent:"sin_modulo_rrhh", datos:null,
      respuesta:"📭 No hay módulo de Recursos Humanos configurado (no existen tablas de empleados/asistencias en la base de datos)." };
  }
  if (/\bbalance general|activos y pasivos|estado.*resultados?\b/.test(t)) {
    const tieneAs = await tieneColumna("asientos_detalle","debe");
    if (!tieneAs) return { agente:"analytics", intent:"sin_balance", datos:null,
      respuesta:"📭 Aún no hay asientos contables registrados para generar un balance general." };
    const sql = `
      SELECT cc.tipo, COALESCE(SUM(ad.debe),0)::float AS debe, COALESCE(SUM(ad.haber),0)::float AS haber
      FROM asientos_detalle ad JOIN cuentas_contables cc ON cc.id=ad.cuenta_id
      GROUP BY cc.tipo`;
    const r = await db.query(sql);
    if (!r.rows.length) return { agente:"analytics", intent:"sin_balance", datos:null, respuesta:"📭 Aún no hay asientos contables registrados." };
    return { agente:"analytics", intent:"balance", sql, datos:r.rows,
      respuesta: `📒 Balance por tipo:\n${r.rows.map(x=>`• ${x.tipo}: debe S/ ${dinero(x.debe)} · haber S/ ${dinero(x.haber)} · saldo S/ ${dinero(x.haber-x.debe)}`).join("\n")}` };
  }
  if (/\bcuentas contables m[aá]s usadas|asientos?\b/.test(t)) {
    const sql = `
      SELECT cc.codigo, cc.nombre, COUNT(*)::int AS movimientos
      FROM asientos_detalle ad JOIN cuentas_contables cc ON cc.id=ad.cuenta_id
      GROUP BY cc.codigo, cc.nombre ORDER BY movimientos DESC LIMIT 10`;
    try {
      const r = await db.query(sql);
      return { agente:"analytics", intent:"cuentas_mas_usadas", sql, datos:r.rows,
        respuesta: r.rows.length ? `📚 Cuentas contables más usadas:\n${r.rows.map((x,i)=>`${i+1}. ${x.codigo} ${x.nombre} — ${x.movimientos} mov.`).join("\n")}` : "📭 No hay asientos contables registrados." };
    } catch { return { agente:"analytics", intent:"sin_contabilidad", datos:null, respuesta:"📭 No hay módulo de contabilidad configurado." }; }
  }

  // ╭─ DIAGNÓSTICO GENERAL / RESUMEN ────────────────────────╮
  if (/\b(resume.*empresa|estado de mi empresa|c[oó]mo va el negocio|panorama|detect(a|ar) problemas)\b/.test(t)) {
    const [v, c, fp, sb] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0)::float v FROM ventas WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'`),
      db.query(`SELECT COALESCE(SUM(total),0)::float c FROM compras WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'`),
      db.query(`SELECT COUNT(*)::int n, COALESCE(SUM(saldo),0)::float deuda FROM facturas WHERE estado IN ('pendiente','parcial')`),
      db.query(`SELECT COUNT(*)::int n FROM productos WHERE stock <= GREATEST(stock_min,5)`),
    ]);
    const V=+v.rows[0].v, C=+c.rows[0].c, U=V-C;
    const problemas = [];
    if (U < 0) problemas.push("• ⚠️ Utilidad negativa últimos 30 días");
    if (+fp.rows[0].deuda > 0) problemas.push(`• 💸 Cobranzas pendientes: ${fp.rows[0].n} facturas (S/ ${dinero(fp.rows[0].deuda)})`);
    if (+sb.rows[0].n > 0) problemas.push(`• 📦 ${sb.rows[0].n} productos en stock crítico`);
    return { agente:"analytics", intent:"resumen_empresa", datos:{ventas:V,compras:C,utilidad:U},
      respuesta:
`🏢 Resumen últimos 30 días
• Ventas:   S/ ${dinero(V)}
• Compras: S/ ${dinero(C)}
• Utilidad: S/ ${dinero(U)}
${problemas.length ? "\n🚨 Problemas detectados:\n"+problemas.join("\n") : "\n✅ Sin alertas críticas."}` };
  }

  return null; // sin coincidencia → deja seguir al motor original
}

module.exports = { resolver, detectarRango, detectarProyeccion };
