// =====================================================================
// CREMITA PETSHOP · Script de la planilla (Google Apps Script)
//
// Qué hace:
//  0. Le pasa los productos a la página al instante (?productos=1).
//  1. Recibe los pedidos de la página (con nombre y teléfono del comprador)
//     y los anota en la hoja "Pedidos". Los precios salen de "Productos".
//  2. Tildar "confirmado" descuenta el stock (si no alcanza, no confirma y avisa).
//     Destildarlo lo devuelve. Cada vez revisa TODOS los pedidos, así un clic
//     que Google se saltee se acomoda solo.
//  3. Tildar "cancelado" devuelve el stock (si estaba confirmado) y tacha el pedido.
//  4. Columna "whatsapp": al confirmar aparece "Avisar confirmación" y al cancelar
//     "Avisar cancelación" (abren el chat del comprador con el mensaje ya escrito).
//     Mientras el pedido está pendiente dice "Escribirle" (abre el chat con un saludo).
//  5. En la celda de "stock": -3 → baja 3; 9+5 → hace la cuenta (14);
//     8 → queda en 8. Nunca baja de 0.
//  6. Si se agrega un producto nuevo sin "id", le pone uno solo.
//  7. Si al confirmar no alcanza el stock, el link pasa a "Avisar falta de stock".
//     El pedido se puede editar a mano en "detalle" (mientras no esté confirmado):
//     cambiar "3x" por "1x", borrar una línea o agregar "1x Nombre del producto".
//     El script recalcula el total y lo que se descuenta.
//
// Menú "Cremita" (arriba en la planilla):
//   · Preparar planilla        → agrega las columnas nuevas que falten (se puede usar siempre)
//   · Revisar pedidos y stock  → acomoda cualquier pedido que haya quedado desparejo
//   · Borrar pedidos cancelados
//
// Las columnas se buscan por su TÍTULO (fila 1), así que se pueden mover de lugar.
//   Productos: id | activo | nombre | precio | stock | mascota | tipo | foto | icono
//   Pedidos:   fecha | pedido | nombre | telefono | detalle | total | confirmado | cancelado |
//              whatsapp | descontado | items
// =====================================================================

const HOJA_PRODUCTOS = 'Productos';
const HOJA_PEDIDOS = 'Pedidos';
const NOMBRE_TIENDA = 'Cremita Petshop';

// Columnas de versiones anteriores que "Preparar planilla" saca si están
const COLUMNAS_A_SACAR = ['▲', '▼', 'ajustar'];

// Columnas nuevas y dónde van (después de cuál) si faltan
const COLUMNAS_PEDIDOS = [
  ['nombre', 'pedido'], ['telefono', 'nombre'],
  ['cancelado', 'confirmado'], ['whatsapp', 'cancelado'],
];
const CASILLAS_PEDIDOS = ['confirmado', 'cancelado', 'descontado'];

// ---------- 0 y 1. La página ----------

// .../exec               → para probar que la app web está publicada
// .../exec?productos=1   → la página pide los productos (lee la planilla al instante)
function doGet(e) {
  if (e && e.parameter && e.parameter.productos) {
    const valores = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PRODUCTOS)
      .getDataRange().getDisplayValues();
    return responder_({ ok: true, filas: valores });
  }
  return responder_({ ok: true, mensaje: 'La planilla de Cremita está conectada' });
}

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
    const nombre = textoSeguro_(datos.nombre, 60);
    const telefono = String(datos.telefono || '').replace(/[^\d]/g, '').slice(0, 15);

    const hoja = libro.getSheetByName(HOJA_PEDIDOS);
    const c = columnas_(hoja);
    const fila = new Array(hoja.getLastColumn()).fill('');
    const poner = (titulo, valor) => { if (c[titulo]) fila[c[titulo] - 1] = valor; };
    poner('fecha', new Date());
    poner('pedido', codigo);
    poner('nombre', nombre);
    poner('telefono', telefono);
    poner('detalle', detalle);
    poner('total', total);
    CASILLAS_PEDIDOS.forEach(t => poner(t, false));
    poner('items', JSON.stringify(items));
    hoja.appendRow(fila);

    const n = hoja.getLastRow();
    CASILLAS_PEDIDOS.forEach(t => { if (c[t]) hoja.getRange(n, c[t]).insertCheckboxes(); });
    linkSegunEstado_(hoja, c, n, fila, '', '');                 // link "Escribirle" desde que llega

    return responder_({ ok: true, pedido: codigo });
  } catch (error) {
    return responder_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Menú ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cremita')
    .addItem('Preparar planilla (columnas nuevas)', 'prepararPlanilla')
    .addItem('Revisar pedidos y stock', 'revisarAhora')
    .addSeparator()
    .addItem('Borrar pedidos cancelados', 'borrarCancelados')
    .addToUi();
}

function prepararPlanilla() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const agregadas = conCandado_(() => {
    sacarColumnas_(libro.getSheetByName(HOJA_PRODUCTOS), COLUMNAS_A_SACAR);
    const prod = libro.getSheetByName(HOJA_PRODUCTOS), cp = columnas_(prod);
    if (cp.stock) prod.getRange(1, cp.stock).setNote('Para restar escribí -3 y Enter. Para sumar escribí la cuenta, ej: 9+5. Un número solo (ej: 8) deja el stock en ese número.');
    const a = prepararHoja_(libro.getSheetByName(HOJA_PEDIDOS), COLUMNAS_PEDIDOS);
    // Rehace los links de WhatsApp de todos los pedidos (arregla los que hayan quedado con error)
    const hoja = libro.getSheetByName(HOJA_PEDIDOS), c = columnas_(hoja);
    if (c.whatsapp && hoja.getLastRow() > 1) hoja.getRange(2, c.whatsapp, hoja.getLastRow() - 1, 1).clearContent();
    const cPed = columnas_(libro.getSheetByName(HOJA_PEDIDOS));
    if (cPed.items) libro.getSheetByName(HOJA_PEDIDOS).hideColumns(cPed.items);   // es para el script, no hace falta verla
    revisarPedidos_();
    return a;
  });
  if (agregadas === null) return;
  libro.toast(agregadas.length ? 'Columnas agregadas: ' + agregadas.join(', ') : 'Ya estaba todo listo.', 'Planilla preparada', 6);
}

function revisarAhora() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const cambios = conCandado_(() => revisarPedidos_());
  if (cambios === null) return;
  libro.toast(cambios ? 'Se acomodaron ' + cambios + ' pedido(s).' : 'Todo en orden.', 'Pedidos revisados', 5);
}

function borrarCancelados() {
  const ui = SpreadsheetApp.getUi();
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_PEDIDOS), c = columnas_(hoja);
  if (!c.cancelado) { ui.alert('Primero usá "Cremita → Preparar planilla".'); return; }
  const filas = hoja.getLastRow() - 1;
  const cancelados = filas < 1 ? 0 : hoja.getRange(2, c.cancelado, filas, 1).getValues().filter(v => v[0] === true).length;
  if (!cancelados) { libro.toast('No hay pedidos cancelados.', 'Nada para borrar', 5); return; }
  if (ui.alert('Borrar pedidos', '¿Borrar ' + cancelados + ' pedido(s) cancelado(s)? No se puede deshacer (salvo con Archivo → Historial de versiones).', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const borrados = conCandado_(() => {
    revisarPedidos_(); // por las dudas: que ningún cancelado tenga stock descontado
    const valores = hoja.getRange(2, c.cancelado, hoja.getLastRow() - 1, 1).getValues();
    let n = 0;
    for (let i = valores.length - 1; i >= 0; i--) {   // de abajo para arriba
      if (valores[i][0] === true) { hoja.deleteRow(i + 2); n++; }
    }
    return n;
  });
  if (borrados !== null) libro.toast('Se borraron ' + borrados + ' pedido(s).', 'Listo', 5);
}

// ---------- Cuando se edita la planilla ----------

function onEdit(e) {
  const hoja = e.range.getSheet();
  const nombre = hoja.getName();
  const desde = e.range.getColumn(), hasta = desde + e.range.getNumColumns() - 1;
  const tocada = col => col && col >= desde && col <= hasta;

  if (nombre === HOJA_PRODUCTOS) {
    const c = columnas_(hoja);
    const unaCelda = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    if (unaCelda && e.range.getColumn() === c.stock && e.range.getRow() > 1) conCandado_(() => sumarEnCelda_(e), true);
    else if (tocada(c.nombre)) ponerIdsFaltantes_(hoja);
    return;
  }
  if (nombre !== HOJA_PEDIDOS) return;

  const c = columnas_(hoja);
  const unaCelda = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  if (unaCelda && e.range.getColumn() === c.detalle && e.range.getRow() > 1) {
    conCandado_(() => { editarDetalle_(e, hoja, c); revisarPedidos_(); }, true);
    return;
  }
  if (!tocada(c.confirmado) && !tocada(c.cancelado)) return;
  // Con el candado los clics esperan su turno; cada vuelta revisa TODOS los pedidos
  conCandado_(() => revisarPedidos_(), true);
}

// Editar un pedido a mano en "detalle": una línea por producto, "cantidad x nombre".
// Lo de "($...)" del final se ignora (el precio sale de Productos). Cantidad 0 = se saca.
function editarDetalle_(e, hoja, c) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const celda = e.range, fila = celda.getRow();
  const anterior = e.oldValue === undefined ? '' : e.oldValue;
  const volver = (titulo, msg) => { celda.setValue(anterior); libro.toast(msg, titulo, 10); };
  const v = t => (c[t] ? hoja.getRange(fila, c[t]).getValue() : '');

  if (v('descontado') === true || v('confirmado') === true)
    return volver('No se cambió', 'El pedido está confirmado: destildá "confirmado" (vuelve el stock), editalo y confirmalo de nuevo.');
  if (v('cancelado') === true)
    return volver('No se cambió', 'El pedido está cancelado: destildá "cancelado" para editarlo.');

  const productos = leerProductos_(libro);
  const porNombre = {};
  // Sin mayúsculas ni espacios de más, y sin lo que vaya entre corchetes al principio ("[Producto] ...")
  const normal = t => String(t).toLowerCase().replace(/^\s*\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim();
  Object.keys(productos).forEach(id => { porNombre[normal(productos[id].nombre)] = id; });

  const cantidades = {}, orden = [], errores = [];
  String(celda.getValue()).split(/\n/).map(l => l.trim()).filter(Boolean).forEach(linea => {
    const m = linea.match(/^(\d+)\s*(?:[xX×]\s*)?(.+?)\s*(?:\(\s*\$[^)]*\))?$/);
    const id = m && porNombre[normal(m[2])];
    if (!m) { errores.push('"' + linea + '" (falta la cantidad, ej: 2x ' + linea + ')'); return; }
    if (!id) { errores.push('"' + m[2] + '" no está en Productos'); return; }
    const cant = Math.min(99, parseInt(m[1], 10));
    if (!cant) return;                                          // 0x → se saca del pedido
    if (!(id in cantidades)) orden.push(id);
    cantidades[id] = (cantidades[id] || 0) + cant;
  });

  if (errores.length) return volver('Revisá el detalle', 'No se cambió el pedido: ' + errores.join(' · ') + '. Escribí el nombre igual que en Productos.');
  if (!orden.length) return volver('Pedido vacío', 'El pedido quedó sin productos. Si no va, tildá "cancelado".');

  let total = 0;
  const items = orden.map(id => ({ id, cant: cantidades[id] }));
  const detalle = items.map(it => {
    const p = productos[it.id];
    total += p.precio * it.cant;
    return it.cant + 'x ' + p.nombre + ' (' + pesos_(p.precio * it.cant) + ')';
  }).join('\n');

  celda.setValue(detalle);
  celda.setNote('Editado a mano el ' + Utilities.formatDate(new Date(), libro.getSpreadsheetTimeZone(), 'dd/MM HH:mm'));
  if (c.total) hoja.getRange(fila, c.total).setValue(total);
  if (c.items) hoja.getRange(fila, c.items).setValue(JSON.stringify(items));
  if (c.confirmado) hoja.getRange(fila, c.confirmado).setNote('');   // se saca el aviso de falta de stock
  libro.toast('Nuevo total: ' + pesos_(total) + '. Ya lo podés confirmar.', 'Pedido editado', 6);
}

// Celda de stock:
//   "-3"   → resta 3 a lo que había
//   "9+5"  → hace la cuenta y deja 14 (sirve para sumar: lo que hay + lo que entró)
//   "26-3" → 23
//   un número común → queda ese número
// (Google convierte "+5" en 5 solo, así que para sumar se escribe la cuenta completa.)
function sumarEnCelda_(e) {
  const celda = e.range;
  const formula = celda.getFormula();
  const valor = celda.getValue();
  const antes = e.oldValue === undefined || e.oldValue === '' ? 0 : Number(String(e.oldValue).replace(',', '.'));
  let nuevo = null;

  const sumaFormula = formula.match(/^=\s*\+\s*(\d+)\s*$/);       // por si Google lo guardó como =+5
  if (sumaFormula) nuevo = antes + Number(sumaFormula[1]);
  else if (!formula && typeof valor === 'number' && valor < 0) nuevo = antes + valor;
  else if (!formula && typeof valor === 'string') {
    const t = valor.replace(/\s/g, '');
    if (/^[+-]?\d+([+-]\d+)*$/.test(t)) {
      const partes = t.match(/[+-]?\d+/g).map(Number);
      const total = partes.reduce((x, y) => x + y, 0);
      nuevo = /^[+-]/.test(t) ? antes + total : total;         // empieza con signo: sobre lo que había
    } else {
      celda.setValue(isNaN(antes) ? '' : antes);               // texto raro: vuelve al valor anterior
      SpreadsheetApp.getActiveSpreadsheet().toast('Escribí un número, -3 para restar, o la cuenta (ej: 9+5).', 'Stock sin cambios', 6);
      return;
    }
  }
  if (nuevo === null || isNaN(nuevo)) return;                   // número común: queda lo que escribió
  celda.setValue(Math.max(0, nuevo));                           // nunca menos de 0
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Stock: ' + antes + ' → ' + Math.max(0, nuevo) + (nuevo < 0 ? ' (no alcanzaba, quedó en 0)' : ''), 'Stock actualizado', 4);
}

// Recorre todos los pedidos y deja el stock de acuerdo a lo que está tildado AHORA:
//   vale = confirmado y NO cancelado
//   vale y no descontado → descuenta (si alcanza; si no, lo destilda y avisa)
//   no vale y descontado → devuelve
// También tacha los cancelados y les pone el link para avisar. Devuelve cuántos pedidos tocó.
function revisarPedidos_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_PEDIDOS);
  const c = columnas_(hoja);
  const filas = hoja.getLastRow() - 1;
  if (filas < 1 || !c.confirmado || !c.descontado || !c.items) return 0;

  const ancho = hoja.getLastColumn();
  const datos = hoja.getRange(2, 1, filas, ancho).getValues();
  const notas = hoja.getRange(2, c.confirmado, filas, 1).getNotes();
  const tachados = hoja.getRange(2, 1, filas, 1).getFontLines();
  const links = c.whatsapp ? hoja.getRange(2, c.whatsapp, filas, 1).getDisplayValues() : datos.map(() => ['']);
  const hojaProd = libro.getSheetByName(HOJA_PRODUCTOS);
  const colStock = columnas_(hojaProd).stock;
  const productos = leerProductos_(libro);   // el stock se va actualizando acá, en memoria
  const stockCambiado = {};
  const conStock = p => p && p.stock !== null && !isNaN(p.stock);
  const v = (d, t) => (c[t] ? d[c[t] - 1] : '');
  let cambios = 0;

  for (let i = 0; i < filas; i++) {
    const fila = i + 2, d = datos[i];
    const cancelado = v(d, 'cancelado') === true;
    let confirmado = v(d, 'confirmado') === true;
    const descontado = v(d, 'descontado') === true;

    // Cancelado: se destilda "confirmado", se tacha la fila y el link pasa a "avisar cancelación"
    if (cancelado && confirmado) { hoja.getRange(fila, c.confirmado).setValue(false); confirmado = false; }
    const yaTachado = tachados[i][0] === 'line-through';
    if (cancelado !== yaTachado) {
      hoja.getRange(fila, 1, 1, ancho).setFontLine(cancelado ? 'line-through' : 'none')
        .setFontColor(cancelado ? '#9e9e9e' : null);
    }

    if (confirmado === descontado) {                            // el stock ya está bien
      if (confirmado && notas[i][0]) hoja.getRange(fila, c.confirmado).setNote('');
      const sinStock = !cancelado && !confirmado && String(notas[i][0]).startsWith('No alcanza');
      linkSegunEstado_(hoja, c, fila, d, links[i][0], cancelado ? 'cancelado' : confirmado ? 'confirmado' : sinStock ? 'sinstock' : '', notas[i][0]);
      continue;
    }
    let items;
    try { items = JSON.parse(v(d, 'items') || '[]'); } catch (err) { items = []; }

    if (confirmado) {
      // Antes de descontar, revisa que alcance el stock de TODOS los productos del pedido
      const faltan = [];
      items.forEach(it => {
        const p = productos[String(it.id)];
        if (!p) faltan.push('producto ' + it.id + ' (ya no existe)');
        else if (conStock(p) && p.stock < it.cant) faltan.push(p.nombre + ' (pide ' + it.cant + ', hay ' + Math.max(0, p.stock) + ')');
      });
      const celda = hoja.getRange(fila, c.confirmado);
      if (faltan.length) {
        celda.setValue(false);                                  // no se confirma
        const aviso = 'No alcanza el stock: ' + faltan.join(', ');
        celda.setNote(aviso);
        libro.toast(aviso + '. Avisale al cliente con el link de "whatsapp" y, si hace falta, editá el detalle.', 'Pedido ' + v(d, 'pedido') + ' sin confirmar', 12);
        linkSegunEstado_(hoja, c, fila, d, links[i][0], 'sinstock', aviso);
        continue;
      }
      items.forEach(it => { const p = productos[String(it.id)]; if (conStock(p)) { p.stock -= it.cant; stockCambiado[it.id] = p; } });
      hoja.getRange(fila, c.descontado).setValue(true);        // se vendió: bajó el stock
      if (notas[i][0]) celda.setNote('');
      linkSegunEstado_(hoja, c, fila, d, links[i][0], 'confirmado');
    } else {
      items.forEach(it => { const p = productos[String(it.id)]; if (conStock(p)) { p.stock += it.cant; stockCambiado[it.id] = p; } });
      hoja.getRange(fila, c.descontado).setValue(false);       // se canceló: volvió el stock
      linkSegunEstado_(hoja, c, fila, d, links[i][0], cancelado ? 'cancelado' : '');
    }
    cambios++;
  }

  if (colStock) Object.keys(stockCambiado).forEach(id => {
    const p = stockCambiado[id];
    hojaProd.getRange(p.fila, colStock).setValue(p.stock);
  });
  SpreadsheetApp.flush();
  return cambios;
}

// ---------- Ayudantes ----------

// Ejecuta "tarea" de a una por vez. Devuelve null si la planilla estaba ocupada.
function conCandado_(tarea, silencioso) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(25000)) {
    if (!silencioso) SpreadsheetApp.getActiveSpreadsheet().toast('Esperá un segundo y volvé a intentar.', 'Planilla ocupada', 5);
    return null;
  }
  try {
    return tarea();
  } finally {
    lock.releaseLock();
  }
}

// { titulo: número de columna } según la fila 1
function columnas_(hoja) {
  const titulos = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0];
  const c = {};
  titulos.forEach((t, i) => { const k = String(t).trim().toLowerCase(); if (k && !c[k]) c[k] = i + 1; });
  return c;
}

// Agrega las columnas que falten, cada una después de la que corresponde. Devuelve las agregadas.
function prepararHoja_(hoja, nuevas) {
  const agregadas = [];
  nuevas.forEach(([titulo, despuesDe]) => {
    const c = columnas_(hoja);
    if (c[titulo]) return;
    const ancla = c[despuesDe] || hoja.getLastColumn();
    hoja.insertColumnAfter(ancla);
    const col = ancla + 1;
    hoja.getRange(1, col).setValue(titulo).setFontWeight('bold');
    const filas = Math.max(hoja.getMaxRows() - 1, 1);
    const resto = hoja.getRange(2, col, filas, 1);
    resto.clearDataValidations().setFontLine('none');
    if (titulo === 'cancelado') {
      const n = hoja.getLastRow() - 1;
      if (n > 0) hoja.getRange(2, col, n, 1).insertCheckboxes();
    } else if (titulo === 'telefono') {
      resto.setNumberFormat('@');                              // que no lo convierta en número raro
    }
    agregadas.push(titulo);
  });
  return agregadas;
}

// Columna "whatsapp" según el estado del pedido (solo la reescribe si cambió):
//   pendiente → "Escribirle" · confirmado → "Avisar confirmación" · cancelado → "Avisar cancelación"
//   no alcanzó el stock al confirmar → "Avisar falta de stock"
function linkSegunEstado_(hoja, c, fila, d, textoActual, estado, nota) {
  if (!c.whatsapp) return;
  const v = t => (c[t] ? d[c[t] - 1] : '');
  const tel = numeroWhatsApp_(v('telefono'));
  const celda = hoja.getRange(fila, c.whatsapp);
  const textos = { '': 'Escribirle', confirmado: 'Avisar confirmación', cancelado: 'Avisar cancelación', sinstock: 'Avisar falta de stock' };
  const texto = tel ? textos[estado] : '';
  if (texto === String(textoActual)) return;                   // ya está bien
  if (!texto) { celda.clearContent(); return; }

  const nombre = String(v('nombre')).trim(), codigo = String(v('pedido')).trim();
  const hola = '¡Hola' + (nombre ? ' ' + nombre : '') + '! Te escribimos de ' + NOMBRE_TIENDA + '. ';
  const pedido = 'Tu pedido' + (codigo ? ' #' + codigo : '');
  const msg = estado === 'confirmado'
    ? hola + pedido + ' quedó confirmado' + (Number(v('total')) ? ' (total ' + pesos_(Number(v('total'))) + ')' : '') + '. ¡Gracias por tu compra!'
    : estado === 'cancelado'
    ? hola + pedido + ' tuvo que ser cancelado. Si querés, te ayudamos a armar otro. ¡Perdón por las molestias!'
    : estado === 'sinstock'
    ? hola + 'Sobre tu pedido' + (codigo ? ' #' + codigo : '') + ': no nos alcanza el stock de ' +
      String(nota || '').replace(/^No alcanza el stock:\s*/, '').replace(/\(pide (\d+), hay (\d+)\)/g, '(pediste $1, tenemos $2)') +
      '. ¿Te mandamos lo que tenemos o preferís cambiarlo por otro producto?'
    : hola + 'Recibimos tu pedido' + (codigo ? ' #' + codigo : '') + '. ';
  const url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  // Link común (no fórmula), así anda en cualquier idioma de la planilla
  celda.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(texto).setLinkUrl(url).build());
}

// Saca columnas por título (las ▲ ▼ de antes)
function sacarColumnas_(hoja, titulos) {
  const c = columnas_(hoja);
  titulos.map(t => c[t]).filter(Boolean).sort((x, y) => y - x).forEach(col => hoja.deleteColumn(col));
}

// "11 2345-6789" → "5491123456789" (formato que usa WhatsApp para celulares de Argentina)
function numeroWhatsApp_(telefono) {
  let d = String(telefono || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('54')) return d;
  d = d.replace(/^0/, '');
  return d.length === 10 ? '549' + d : d;
}

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

// Texto que escribió el comprador: sin saltos de línea y sin que empiece con = + - @
// (para que la planilla no lo tome como fórmula)
function textoSeguro_(t, largo) {
  return String(t || '').replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, largo);
}

// 15000 → "$15.000"
function pesos_(n) {
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function responder_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
