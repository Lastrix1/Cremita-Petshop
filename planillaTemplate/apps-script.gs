// =====================================================================
// CREMITA PETSHOP · Script de la planilla (Google Apps Script)
//
// Hace cuatro cosas:
//  0. Le pasa los productos a la página al instante (?productos=1).
//  1. Recibe los pedidos de la página y los anota en la hoja "Pedidos".
//     Los precios se toman de la hoja "Productos" (no del mensaje del cliente).
//  2. Cuando se tilda "confirmado" en un pedido, descuenta el stock.
//     Si no alcanza el stock, no lo confirma y avisa qué falta (nunca queda en negativo).
//     Si se destilda, lo devuelve.
//  3. Si se agrega un producto nuevo sin "id", le pone uno solo.
//
// Hojas y columnas que espera (la fila 1 son los títulos):
//   Productos: id | activo | nombre | precio | stock | mascota | tipo | foto | icono
//   Pedidos:   fecha | pedido | detalle | total | confirmado | descontado | items
// =====================================================================

const HOJA_PRODUCTOS = 'Productos';
const HOJA_PEDIDOS = 'Pedidos';

// Columnas de "Pedidos" (1 = A)
const P_FECHA = 1, P_PEDIDO = 2, P_DETALLE = 3, P_TOTAL = 4, P_CONFIRMADO = 5, P_DESCONTADO = 6, P_ITEMS = 7;

// ---------- 1. Recibir pedidos desde la página ----------

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const datos = JSON.parse(e.postData.contents);
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    const productos = leerProductos_(libro);

    // Solo productos que existen, cantidades razonables
    const items = (datos.items || [])
      .map(it => ({ id: String(it.id), cant: Math.max(1, Math.min(99, parseInt(it.cant, 10) || 0)) }))
      .filter(it => productos[it.id]);
    if (!items.length) return responder_({ ok: false, error: 'pedido vacío' });

    let total = 0;
    const detalle = items.map(it => {
      const p = productos[it.id];
      total += p.precio * it.cant;
      return it.cant + 'x ' + p.nombre + ' (' + pesos_(p.precio * it.cant) + ')';
    }).join('\n');

    const codigo = String(datos.pedido || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const hoja = libro.getSheetByName(HOJA_PEDIDOS);
    hoja.appendRow([new Date(), codigo, detalle, total, false, false, JSON.stringify(items)]);
    const fila = hoja.getLastRow();
    hoja.getRange(fila, P_CONFIRMADO, 1, 2).insertCheckboxes();

    return responder_({ ok: true, pedido: codigo });
  } catch (error) {
    return responder_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

// Pedidos por GET:
//   .../exec               → para probar que la app web está publicada
//   .../exec?productos=1   → la página pide los productos (lee la planilla al instante)
function doGet(e) {
  if (e && e.parameter && e.parameter.productos) {
    const valores = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PRODUCTOS)
      .getDataRange().getDisplayValues();
    return responder_({ ok: true, filas: valores });
  }
  return responder_({ ok: true, mensaje: 'La planilla de Cremita está conectada' });
}

// ---------- 2 y 3. Reaccionar cuando la dueña edita la planilla ----------

function onEdit(e) {
  const hoja = e.range.getSheet();
  const nombre = hoja.getName();

  if (nombre === HOJA_PRODUCTOS) {
    // Solo cuando se escribe en la columna "nombre" (no al tildar, ni al cambiar precio o stock)
    const titulos = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]
      .map(t => String(t).trim().toLowerCase());
    const colNombre = titulos.indexOf('nombre') + 1;
    const desde = e.range.getColumn(), hasta = desde + e.range.getNumColumns() - 1;
    if (colNombre >= desde && colNombre <= hasta) ponerIdsFaltantes_(hoja);
    return;
  }
  if (nombre !== HOJA_PEDIDOS) return;

  // ¿Se tocó la columna "confirmado"?
  const primera = e.range.getColumn(), ultima = primera + e.range.getNumColumns() - 1;
  if (P_CONFIRMADO < primera || P_CONFIRMADO > ultima) return;

  // Un clic por vez: si se tilda y destilda rápido, Google corre el script varias veces
  // en paralelo y podría descontar o devolver dos veces. Con el candado esperan su turno.
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Esperá un segundo y volvé a intentar.', 'Planilla ocupada', 5);
    return;
  }
  try {
    revisarPedidos_(hoja, e.range.getRow(), e.range.getNumRows());
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

// Revisa cada fila tocada y descuenta o devuelve stock según el tilde ACTUAL de "confirmado"
function revisarPedidos_(hoja, desde, cuantas) {
  for (let fila = desde; fila < desde + cuantas; fila++) {
    if (fila < 2) continue;
    const confirmado = hoja.getRange(fila, P_CONFIRMADO).getValue() === true;
    const descontado = hoja.getRange(fila, P_DESCONTADO).getValue() === true;
    const items = JSON.parse(hoja.getRange(fila, P_ITEMS).getValue() || '[]');

    const celda = hoja.getRange(fila, P_CONFIRMADO);
    if (confirmado && !descontado) {
      // Antes de descontar, revisa que alcance el stock de TODOS los productos del pedido
      const faltan = faltantes_(items);
      if (faltan.length) {
        celda.setValue(false);                                  // no se confirma
        const aviso = 'No alcanza el stock: ' + faltan.join(', ');
        celda.setNote(aviso);
        SpreadsheetApp.getActiveSpreadsheet().toast(aviso, 'Pedido ' + hoja.getRange(fila, P_PEDIDO).getValue() + ' sin confirmar', 10);
        continue;
      }
      moverStock_(items, -1);                                   // se vendió: baja el stock
      hoja.getRange(fila, P_DESCONTADO).setValue(true);
      celda.setNote('');
    } else if (!confirmado && descontado) {
      moverStock_(items, +1);                                   // se canceló: vuelve el stock
      hoja.getRange(fila, P_DESCONTADO).setValue(false);
    }
  }
}

// ---------- Ayudantes ----------

// Lee "Productos" → { id: { fila, nombre, precio, stock } }
function leerProductos_(libro) {
  const hoja = libro.getSheetByName(HOJA_PRODUCTOS);
  const valores = hoja.getDataRange().getValues();
  const titulos = valores[0].map(t => String(t).trim().toLowerCase());
  const c = n => titulos.indexOf(n);
  const productos = {};
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i];
    const id = String(v[c('id')]).trim();
    if (!id) continue;
    productos[id] = {
      fila: i + 1,
      nombre: String(v[c('nombre')]),
      precio: Number(v[c('precio')]) || 0,
      stock: v[c('stock')] === '' ? null : Number(v[c('stock')]),
    };
  }
  return productos;
}

// Lista lo que no alcanza: ["Pelota mordedora (pide 3, hay 1)", …]. Vacía = alcanza todo.
function faltantes_(items) {
  const productos = leerProductos_(SpreadsheetApp.getActiveSpreadsheet());
  const faltan = [];
  items.forEach(it => {
    const p = productos[String(it.id)];
    if (!p) { faltan.push('producto ' + it.id + ' (ya no existe)'); return; }
    if (p.stock === null || isNaN(p.stock)) return;            // sin control de stock
    if (p.stock < it.cant) faltan.push(p.nombre + ' (pide ' + it.cant + ', hay ' + Math.max(0, p.stock) + ')');
  });
  return faltan;
}

// Suma o resta del stock las cantidades de un pedido (signo = -1 vende, +1 devuelve)
function moverStock_(items, signo) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_PRODUCTOS);
  const columnaStock = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]
    .map(t => String(t).trim().toLowerCase()).indexOf('stock') + 1;
  const productos = leerProductos_(libro);
  items.forEach(it => {
    const p = productos[String(it.id)];
    if (!p || p.stock === null || isNaN(p.stock)) return; // sin control de stock
    hoja.getRange(p.fila, columnaStock).setValue(p.stock + signo * it.cant);
  });
}

// Si una fila tiene nombre pero no id, le pone el siguiente número libre
function ponerIdsFaltantes_(hoja) {
  const valores = hoja.getDataRange().getValues();
  const titulos = valores[0].map(t => String(t).trim().toLowerCase());
  const cId = titulos.indexOf('id'), cNombre = titulos.indexOf('nombre');
  let mayor = 0;
  for (let i = 1; i < valores.length; i++) mayor = Math.max(mayor, Number(valores[i][cId]) || 0);
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][cNombre]).trim() && String(valores[i][cId]).trim() === '') {
      mayor += 1;
      hoja.getRange(i + 1, cId + 1).setValue(mayor);
    }
  }
}

// 15000 → "$15.000"
function pesos_(n) {
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function responder_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
