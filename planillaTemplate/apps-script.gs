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
//  8. Tildar "entregado" (en un pedido confirmado) lo pasa a la hoja "Entregados", con su
//     costo y ganancia (los costos se cargan en la hoja "Costos"). La hoja "Resumen" muestra
//     ventas, costo y ganancia por mes.
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

// Alias para transferir, que va en el mensaje de confirmación con el total del pedido.
// Si queda vacío (''), el mensaje sale sin esa parte.
const ALIAS_PAGO = 'cremita.pet.shop.mp';

// Columnas de versiones anteriores que "Preparar planilla" saca si están
const COLUMNAS_A_SACAR = ['▲', '▼', 'ajustar'];

// Columnas nuevas y dónde van (después de cuál) si faltan
const COLUMNAS_PEDIDOS = [
  ['nombre', 'pedido'], ['telefono', 'nombre'],
  ['cancelado', 'confirmado'], ['whatsapp', 'cancelado'], ['entregado', 'cancelado'],
];
const CASILLAS_PEDIDOS = ['confirmado', 'cancelado', 'entregado', 'descontado'];

// Hojas de ventas (las crea "Preparar planilla"). "Costos" NO se publica: ahí va lo que le cuesta cada producto.
const HOJA_ENTREGADOS = 'Entregados';
const HOJA_COSTOS = 'Costos';
const HOJA_RESUMEN = 'Resumen';
const TITULOS_ENTREGADOS = ['fecha', 'entregado', 'pedido', 'nombre', 'telefono', 'detalle', 'total', 'costo', 'ganancia', 'mes', 'items'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
    poner('items', JSON.stringify({ items, texto: detalle, desc: false }));
    hoja.appendRow(fila);

    const n = hoja.getLastRow();
    CASILLAS_PEDIDOS.forEach(t => { if (c[t]) hoja.getRange(n, c[t]).insertCheckboxes().setFontColor(COLOR_CASILLA); });
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
    .addItem('Agregar foto al producto', 'agregarFoto')
    .addSeparator()
    .addItem('Preparar planilla (columnas nuevas)', 'prepararPlanilla')
    .addItem('Revisar pedidos y stock', 'revisarAhora')
    .addItem('Actualizar ganancias (Resumen)', 'actualizarGanancias')
    .addSeparator()
    .addItem('Borrar pedidos cancelados', 'borrarCancelados')
    .addToUi();
}

function prepararPlanilla() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const agregadas = conCandado_(() => {
    sacarColumnas_(libro.getSheetByName(HOJA_PRODUCTOS), COLUMNAS_A_SACAR);
    const prod = libro.getSheetByName(HOJA_PRODUCTOS), cp = columnas_(prod);
    if (cp.stock && prod.getLastRow() > 1) {
      // Arregla los stocks que Google convirtió en fecha (ej: "13-5") y deja la columna como número
      const rango = prod.getRange(2, cp.stock, prod.getLastRow() - 1, 1);
      const valores = rango.getValues();
      let arreglados = 0;
      valores.forEach((fila, i) => { if (fila[0] instanceof Date) { fila[0] = Math.max(0, restaDesdeFecha_(fila[0])); arreglados++; } });
      rango.setNumberFormat('0');
      if (arreglados) { rango.setValues(valores); libro.toast(arreglados + ' stock(s) que habían quedado como fecha se pasaron a número.', 'Stock', 8); }
    }
    // Casillas de "activo" (al importar un Excel quedan como TRUE/FALSE en texto)
    if (cp.activo && prod.getLastRow() > 1) casillasDeVerdad_(prod.getRange(2, cp.activo, prod.getLastRow() - 1, 1));
    if (cp.stock) prod.getRange(1, cp.stock).setNote('Para restar escribí -3 y Enter. Para sumar escribí la cuenta, ej: 9+5. Un número solo (ej: 8) deja el stock en ese número.');
    const a = prepararHoja_(libro.getSheetByName(HOJA_PEDIDOS), COLUMNAS_PEDIDOS);
    // Rehace los links de WhatsApp de todos los pedidos (arregla los que hayan quedado con error)
    const hoja = libro.getSheetByName(HOJA_PEDIDOS), c = columnas_(hoja);
    if (c.whatsapp && hoja.getLastRow() > 1) hoja.getRange(2, c.whatsapp, hoja.getLastRow() - 1, 1).clearContent();
    // Casillas de los pedidos que ya estaban (por si se importaron sin casillas)
    if (hoja.getLastRow() > 1) CASILLAS_PEDIDOS.forEach(t => { if (c[t]) casillasDeVerdad_(hoja.getRange(2, c[t], hoja.getLastRow() - 1, 1)); });
    const cPed = columnas_(libro.getSheetByName(HOJA_PEDIDOS));
    if (cPed.items) libro.getSheetByName(HOJA_PEDIDOS).hideColumns(cPed.items);   // es para el script, no hace falta verla
    // "descontado" la maneja solo el script: se oculta para que nadie la tilde sin querer
    if (cPed.descontado) libro.getSheetByName(HOJA_PEDIDOS).hideColumns(cPed.descontado);
    migrarDescontado_();
    prepararVentas_();
    darEstilo_(libro);
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
  if (nombre === HOJA_ENTREGADOS || nombre === HOJA_COSTOS) {
    // Si se corrige un costo o un total, se recalculan ganancias y el resumen
    conCandado_(() => recalcularVentas_(), true);
    return;
  }
  if (nombre !== HOJA_PEDIDOS) return;

  const c = columnas_(hoja);
  if (tocada(c.entregado)) {
    conCandado_(() => { revisarPedidos_(); pasarEntregados_(); }, true);
    return;
  }
  const unaCelda = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  if (unaCelda && e.range.getColumn() === c.detalle && e.range.getRow() > 1) {
    conCandado_(() => editarDetalle_(e, hoja, c), true);
    return;
  }
  if (!tocada(c.confirmado) && !tocada(c.cancelado)) return;
  // Con el candado los clics esperan su turno; cada vuelta revisa TODOS los pedidos
  conCandado_(() => revisarPedidos_(), true);
}

// ---------- Detalle del pedido ----------
// La columna "detalle" es la que manda: una línea por producto, "cantidad x nombre".
// La columna oculta "items" guarda lo último que el script leyó/descontó: { items, texto }.

// Lee lo guardado en "items" (acepta el formato viejo, que era solo la lista)
function leerGuardado_(crudo) {
  try {
    const g = JSON.parse(crudo || '[]');
    return Array.isArray(g) ? { items: g, texto: null, desc: undefined }
      : { items: g.items || [], texto: g.texto == null ? null : String(g.texto), desc: typeof g.desc === 'boolean' ? g.desc : undefined };
  } catch (err) {
    return { items: [], texto: null };
  }
}

// Convierte el texto de "detalle" en productos. Lo de "($...)" se ignora (el precio sale de Productos).
// Devuelve { items, detalle (prolijo), total, errores }.
function interpretarDetalle_(texto, productos) {
  // Sin mayúsculas ni espacios de más, y sin lo que vaya entre corchetes al principio ("[Producto] ...")
  const normal = t => String(t).toLowerCase().replace(/^\s*\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim();
  const porNombre = {};
  Object.keys(productos).forEach(id => { porNombre[normal(productos[id].nombre)] = id; });

  const cantidades = {}, orden = [], errores = [];
  String(texto).split(/\n/).map(l => l.trim()).filter(Boolean).forEach(linea => {
    const m = linea.match(/^(\d+)\s*(?:[xX×]\s*)?(.+?)\s*(?:\(\s*\$[^)]*\))?$/);
    const id = m && porNombre[normal(m[2])];
    if (!m) { errores.push('"' + linea + '" (falta la cantidad, ej: 2x ' + linea + ')'); return; }
    if (!id) { errores.push('"' + m[2] + '" no está en Productos'); return; }
    const cant = Math.min(99, parseInt(m[1], 10));
    if (!cant) return;                                          // 0x → se saca del pedido
    if (!(id in cantidades)) orden.push(id);
    cantidades[id] = (cantidades[id] || 0) + cant;
  });
  if (!errores.length && !orden.length) errores.push('el pedido quedó sin productos (si no va, tildá "cancelado")');

  let total = 0;
  const items = orden.map(id => ({ id, cant: cantidades[id] }));
  const detalle = items.map(it => {
    const p = productos[it.id];
    total += p.precio * it.cant;
    return it.cant + 'x ' + p.nombre + ' (' + pesos_(p.precio * it.cant) + ')';
  }).join('\n');
  return { items, detalle, total, errores };
}

const mismosItems_ = (a, b) => JSON.stringify(a.map(x => [String(x.id), x.cant])) === JSON.stringify(b.map(x => [String(x.id), x.cant]));

// Se editó "detalle" a mano
function editarDetalle_(e, hoja, c) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const celda = e.range, fila = celda.getRow();
  const v = t => (c[t] ? hoja.getRange(fila, c[t]).getValue() : '');

  // Primero se acomodan los clics pendientes. Si ya tildaste "confirmado", acá se confirma
  // con el detalle NUEVO (no importa en qué orden Google ejecute las cosas).
  revisarPedidos_();

  const guardado = leerGuardado_(v('items'));
  const r = interpretarDetalle_(celda.getValue(), leerProductos_(libro));
  const confirmado = guardado.desc === true || (guardado.desc === undefined && v('descontado') === true) || v('confirmado') === true;

  if (confirmado) {
    if (!r.errores.length && mismosItems_(r.items, guardado.items)) return;   // es lo que se confirmó: todo bien
    celda.setValue(guardado.texto != null ? guardado.texto : (e.oldValue || ''));
    libro.toast('El pedido está confirmado: destildá "confirmado" (vuelve el stock), editalo y confirmalo de nuevo.', 'No se cambió', 10);
    return;
  }
  if (v('cancelado') === true) {
    celda.setValue(guardado.texto != null ? guardado.texto : (e.oldValue || ''));
    libro.toast('El pedido está cancelado: destildá "cancelado" para editarlo.', 'No se cambió', 10);
    return;
  }
  if (r.errores.length) {
    celda.setValue(e.oldValue === undefined ? (guardado.texto || '') : e.oldValue);
    libro.toast('No se cambió el pedido: ' + r.errores.join(' · ') + '. Escribí el nombre igual que en Productos.', 'Revisá el detalle', 10);
    return;
  }
  if (mismosItems_(r.items, guardado.items) && guardado.texto !== null) {
    celda.setValue(guardado.texto);                             // mismos productos: queda como estaba
    return;
  }
  guardarDetalle_(hoja, c, fila, r);
  if (c.confirmado) hoja.getRange(fila, c.confirmado).setNote('');   // se saca el aviso de falta de stock
  libro.toast('Nuevo total: ' + pesos_(r.total) + '. Ya lo podés confirmar.', 'Pedido editado', 6);
  revisarPedidos_();                                            // actualiza el link de whatsapp
}

// Escribe detalle prolijo, total e items
function guardarDetalle_(hoja, c, fila, r) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (c.detalle) hoja.getRange(fila, c.detalle).setValue(r.detalle)
    .setNote('Editado a mano el ' + Utilities.formatDate(new Date(), libro.getSpreadsheetTimeZone(), 'dd/MM HH:mm'));
  if (c.total) hoja.getRange(fila, c.total).setValue(r.total);
  if (c.items) hoja.getRange(fila, c.items).setValue(JSON.stringify({ items: r.items, texto: r.detalle, desc: false }));
}

// Google toma "13-5" como la fecha 13 de mayo. Se recupera la cuenta: 13 − 5 = 8.
// (En planillas en inglés el orden es mes-día; se usa el idioma de la planilla.)
function restaDesdeFecha_(fecha) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const [dia, mes] = Utilities.formatDate(fecha, libro.getSpreadsheetTimeZone(), 'd-M').split('-').map(Number);
  const mesPrimero = /^en_US/.test(String(libro.getSpreadsheetLocale ? libro.getSpreadsheetLocale() : ''));
  return mesPrimero ? mes - dia : dia - mes;
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
  else if (valor instanceof Date) nuevo = restaDesdeFecha_(valor);  // "13-5" → Google lo tomó como fecha
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
  celda.setNumberFormat('0').setValue(Math.max(0, nuevo));      // nunca menos de 0 (y que no quede como fecha)
  const hoja = celda.getSheet(), cn = columnas_(hoja).nombre;
  anotarMovimientos_([[new Date(), '', cn ? hoja.getRange(celda.getRow(), cn).getValue() : '', Math.max(0, nuevo) - antes, antes, Math.max(0, nuevo), 'Ajuste a mano']]);
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
  // Lo que hay ahora en "whatsapp" (texto y link), para reescribirlo solo si cambió algo
  const links = c.whatsapp
    ? hoja.getRange(2, c.whatsapp, filas, 1).getRichTextValues().map(f => [{ texto: f[0] ? f[0].getText() : '', url: f[0] ? f[0].getLinkUrl() || '' : '' }])
    : datos.map(() => [{ texto: '', url: '' }]);
  const hojaProd = libro.getSheetByName(HOJA_PRODUCTOS);
  const colStock = columnas_(hojaProd).stock;
  const productos = leerProductos_(libro);   // el stock se va actualizando acá, en memoria
  const stockCambiado = {};
  const movimientos = [];
  const conStock = p => p && p.stock !== null && !isNaN(p.stock);
  const v = (d, t) => (c[t] ? d[c[t] - 1] : '');
  let cambios = 0;

  for (let i = 0; i < filas; i++) {
    const fila = i + 2, d = datos[i];
    const cancelado = v(d, 'cancelado') === true;
    let confirmado = v(d, 'confirmado') === true;
    // "Descontado" de verdad es lo que guarda el script en "items" (nadie lo puede tocar sin querer).
    // La casilla "descontado" es solo para mirar: si alguien la cambió a mano, se vuelve a acomodar.
    const guardado0 = leerGuardado_(v(d, 'items'));
    const casilla = v(d, 'descontado') === true;
    const descontado = guardado0.desc !== undefined ? guardado0.desc : casilla;
    if (casilla !== descontado) hoja.getRange(fila, c.descontado).setValue(descontado);

    // Cancelado: se destilda "confirmado", se tacha la fila y el link pasa a "avisar cancelación"
    if (cancelado && confirmado) { hoja.getRange(fila, c.confirmado).setValue(false); confirmado = false; }
    const yaTachado = tachados[i][0] === 'line-through';
    if (cancelado !== yaTachado) {
      hoja.getRange(fila, 1, 1, ancho).setFontLine(cancelado ? 'line-through' : 'none')
        .setFontColor(cancelado ? '#9e9e9e' : null);
      if (!cancelado) CASILLAS_PEDIDOS.forEach(t => { if (c[t]) hoja.getRange(fila, c[t]).setFontColor(COLOR_CASILLA); });
    }

    if (confirmado === descontado) {                            // el stock ya está bien
      if (confirmado && notas[i][0]) hoja.getRange(fila, c.confirmado).setNote('');
      const sinStock = !cancelado && !confirmado && String(notas[i][0]).startsWith('No alcanza');
      linkSegunEstado_(hoja, c, fila, d, links[i][0], cancelado ? 'cancelado' : confirmado ? 'confirmado' : sinStock ? 'sinstock' : '', notas[i][0]);
      continue;
    }
    const guardado = guardado0;
    let items = guardado.items;                                 // para devolver: lo que se descontó

    if (confirmado) {
      // Para confirmar manda lo que dice "detalle" AHORA (por si lo editaste recién)
      const texto = String(v(d, 'detalle'));
      if (guardado.texto === null || texto !== guardado.texto) {
        const r = interpretarDetalle_(texto, productos);
        if (r.errores.length && guardado.texto !== null) {
          const celda = hoja.getRange(fila, c.confirmado);
          celda.setValue(false);
          celda.setNote('Revisá el detalle: ' + r.errores.join(' · '));
          libro.toast('No se confirmó: ' + r.errores.join(' · ') + '.', 'Pedido ' + v(d, 'pedido') + ' sin confirmar', 10);
          continue;
        }
        if (!r.errores.length && !mismosItems_(r.items, items)) {
          guardarDetalle_(hoja, c, fila, r);                     // cambió el pedido: nuevo detalle y total
          items = r.items;
          if (c.detalle) d[c.detalle - 1] = r.detalle;
          if (c.total) d[c.total - 1] = r.total;
        } else if (!r.errores.length && guardado.texto !== null && texto !== guardado.texto) {
          hoja.getRange(fila, c.detalle).setValue(guardado.texto); // mismos productos: queda como estaba (con sus precios)
          if (c.detalle) d[c.detalle - 1] = guardado.texto;
        }
      }
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
      items.forEach(it => { const p = productos[String(it.id)]; if (conStock(p)) { movimientos.push([new Date(), v(d, 'pedido'), p.nombre, -it.cant, p.stock, p.stock - it.cant, 'Pedido confirmado']); p.stock -= it.cant; stockCambiado[it.id] = p; } });
      hoja.getRange(fila, c.descontado).setValue(true);        // se vendió: bajó el stock
      hoja.getRange(fila, c.items).setValue(JSON.stringify({ items, texto: c.detalle ? String(d[c.detalle - 1]) : guardado.texto, desc: true }));
      if (notas[i][0]) celda.setNote('');
      linkSegunEstado_(hoja, c, fila, d, links[i][0], 'confirmado');
    } else {
      items.forEach(it => { const p = productos[String(it.id)]; if (conStock(p)) { movimientos.push([new Date(), v(d, 'pedido'), p.nombre, it.cant, p.stock, p.stock + it.cant, cancelado ? 'Pedido cancelado' : 'Pedido desconfirmado']); p.stock += it.cant; stockCambiado[it.id] = p; } });
      hoja.getRange(fila, c.descontado).setValue(false);       // se canceló: volvió el stock
      hoja.getRange(fila, c.items).setValue(JSON.stringify({ items, texto: guardado.texto, desc: false }));
      linkSegunEstado_(hoja, c, fila, d, links[i][0], cancelado ? 'cancelado' : '');
    }
    cambios++;
  }

  if (colStock) Object.keys(stockCambiado).forEach(id => {
    const p = stockCambiado[id];
    hojaProd.getRange(p.fila, colStock).setValue(p.stock);
  });
  anotarMovimientos_(movimientos);
  SpreadsheetApp.flush();
  return cambios;
}

// ---------- Movimientos de stock (para saber siempre por qué cambió) ----------

const HOJA_MOVIMIENTOS = 'Movimientos';
function anotarMovimientos_(filas) {
  if (!filas || !filas.length) return;
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(HOJA_MOVIMIENTOS);
  if (!h) {
    h = libro.insertSheet(HOJA_MOVIMIENTOS);
    h.getRange(1, 1, 1, 7).setValues([['fecha', 'pedido', 'producto', 'cambio', 'stock antes', 'stock después', 'motivo']]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  h.getRange(h.getLastRow() + 1, 1, filas.length, 7).setValues(filas);
}

// ---------- Entregados, costos y ganancias ----------

// Crea las hojas Entregados / Costos / Resumen si no están, y suma a Costos los productos nuevos
function prepararVentas_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let ent = libro.getSheetByName(HOJA_ENTREGADOS);
  if (!ent) {
    ent = libro.insertSheet(HOJA_ENTREGADOS);
    ent.getRange(1, 1, 1, TITULOS_ENTREGADOS.length).setValues([TITULOS_ENTREGADOS]).setFontWeight('bold');
    ent.setFrozenRows(1);
    ent.hideColumns(TITULOS_ENTREGADOS.indexOf('items') + 1);
    ent.getRange(1, TITULOS_ENTREGADOS.indexOf('costo') + 1).setNote('Se calcula con la hoja "Costos". Si falta algún costo queda vacío: cargalo en "Costos" y se completa solo.');
  }
  let cos = libro.getSheetByName(HOJA_COSTOS);
  if (!cos) {
    cos = libro.insertSheet(HOJA_COSTOS);
    cos.getRange(1, 1, 1, 3).setValues([['id', 'producto', 'costo']]).setFontWeight('bold');
    cos.setFrozenRows(1);
    cos.getRange(1, 3).setNote('Cuánto te cuesta a vos cada unidad (lo que pagás al proveedor). Esta hoja no se publica: los clientes no la ven.');
    cos.getRange('C2:C').setNumberFormat('$#,##0');
  }
  // Productos que todavía no están en Costos (y nombres actualizados)
  const productos = leerProductos_(libro);
  const filas = cos.getLastRow() > 1 ? cos.getRange(2, 1, cos.getLastRow() - 1, 2).getValues() : [];
  const ya = {};
  filas.forEach((f, i) => {
    const id = String(f[0]).trim();
    ya[id] = true;
    if (productos[id] && String(f[1]) !== productos[id].nombre) cos.getRange(i + 2, 2).setValue(productos[id].nombre);
  });
  const nuevos = Object.keys(productos).filter(id => !ya[id]).map(id => [id, productos[id].nombre, '']);
  if (nuevos.length) cos.getRange(cos.getLastRow() + 1, 1, nuevos.length, 3).setValues(nuevos);

  if (!libro.getSheetByName(HOJA_RESUMEN)) libro.insertSheet(HOJA_RESUMEN);
  recalcularVentas_();
}

// Pedidos con "entregado" tildado → a la hoja Entregados (solo si estaban confirmados)
function pasarEntregados_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_PEDIDOS);
  const c = columnas_(hoja);
  const filas = hoja.getLastRow() - 1;
  if (filas < 1 || !c.entregado) return;
  if (!libro.getSheetByName(HOJA_ENTREGADOS)) prepararVentas_();
  const ent = libro.getSheetByName(HOJA_ENTREGADOS);
  const ce = columnas_(ent);
  const datos = hoja.getRange(2, 1, filas, hoja.getLastColumn()).getValues();
  const v = (d, t) => (c[t] ? d[c[t] - 1] : '');
  const ahora = new Date();
  let pasados = 0;

  for (let i = filas - 1; i >= 0; i--) {                        // de abajo para arriba (se borran filas)
    const d = datos[i], fila = i + 2;
    if (v(d, 'entregado') !== true) continue;
    const g = leerGuardado_(v(d, 'items'));
    const desc = g.desc !== undefined ? g.desc : v(d, 'descontado') === true;
    if (v(d, 'confirmado') !== true || !desc || v(d, 'cancelado') === true) {
      hoja.getRange(fila, c.entregado).setValue(false);
      libro.toast('El pedido ' + v(d, 'pedido') + ' tiene que estar confirmado (y no cancelado) para marcarlo entregado.', 'No se movió', 8);
      continue;
    }
    const fila_ = new Array(ent.getLastColumn()).fill('');
    const poner = (t, x) => { if (ce[t]) fila_[ce[t] - 1] = x; };
    poner('fecha', v(d, 'fecha'));
    poner('entregado', ahora);
    ['pedido', 'nombre', 'telefono', 'detalle', 'total'].forEach(t => poner(t, v(d, t)));
    poner('items', JSON.stringify(leerGuardado_(v(d, 'items')).items));
    ent.appendRow(fila_);
    hoja.deleteRow(fila);
    pasados++;
  }
  if (pasados) {
    recalcularVentas_();
    // ¿Alguno de los que acaban de pasar no tiene todos los costos cargados?
    const n = ent.getLastRow(), faltan = [];
    ent.getRange(n - pasados + 1, ce.costo, pasados, 1).getNotes().forEach(f => {
      const m = String(f[0]).match(/^Falta el costo de: (.+?) \(cargalo/);
      if (m) m[1].split(', ').forEach(x => { if (faltan.indexOf(x) < 0) faltan.push(x); });
    });
    if (faltan.length) {
      libro.toast('Falta el costo de: ' + faltan.join(', ') + '. Cargalo en la hoja "Costos" y la ganancia se calcula sola.',
        pasados === 1 ? 'Pedido entregado (sin ganancia todavía)' : pasados + ' pedidos entregados (sin ganancia todavía)', 12);
    } else {
      libro.toast(pasados === 1 ? 'El pedido pasó a "Entregados".' : pasados + ' pedidos pasaron a "Entregados".', 'Entregado', 5);
    }
  }
}

// Completa costo y ganancia de cada entregado y rearma la hoja Resumen (por mes)
function recalcularVentas_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const ent = libro.getSheetByName(HOJA_ENTREGADOS);
  const res = libro.getSheetByName(HOJA_RESUMEN);
  if (!ent || !res) return;
  const ce = columnas_(ent);
  const tz = libro.getSpreadsheetTimeZone();

  // Costos por id
  const costos = {};
  const cos = libro.getSheetByName(HOJA_COSTOS);
  if (cos && cos.getLastRow() > 1) cos.getRange(2, 1, cos.getLastRow() - 1, 3).getValues().forEach(f => {
    const n = Number(String(f[2]).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (String(f[2]).trim() !== '' && !isNaN(n)) costos[String(f[0]).trim()] = typeof f[2] === 'number' ? f[2] : n;
  });
  const nombres = {};
  const prods = leerProductos_(libro);
  Object.keys(prods).forEach(id => { nombres[id] = prods[id].nombre; });

  const filas = ent.getLastRow() - 1;
  const meses = {};
  if (filas > 0) {
    const datos = ent.getRange(2, 1, filas, ent.getLastColumn()).getValues();
    const salida = datos.map(d => {
      const v = t => (ce[t] ? d[ce[t] - 1] : '');
      let items = [];
      try { items = JSON.parse(v('items') || '[]'); } catch (err) {}
      const faltan = items.filter(it => !(String(it.id) in costos)).map(it => nombres[it.id] || ('producto ' + it.id));
      // Si alguien escribió el costo a mano en Entregados, se respeta
      const costoEscrito = v('costo') !== '' && typeof v('costo') === 'number' && !items.length;
      const costo = costoEscrito ? v('costo') : (items.length && !faltan.length ? items.reduce((s, it) => s + costos[String(it.id)] * it.cant, 0) : '');
      const total = Number(v('total')) || 0;
      const ganancia = costo === '' ? '' : total - costo;
      const fecha = v('entregado') instanceof Date ? v('entregado') : (v('fecha') instanceof Date ? v('fecha') : null);
      const mes = fecha ? Utilities.formatDate(fecha, tz, 'yyyy-MM') : '';
      if (mes) {
        const m = meses[mes] || (meses[mes] = { pedidos: 0, ventas: 0, costo: 0, ganancia: 0, sinCosto: 0 });
        m.pedidos++; m.ventas += total;
        if (ganancia === '') m.sinCosto++; else { m.costo += costo; m.ganancia += ganancia; }
      }
      return { costo, ganancia, mes, nota: faltan.length ? 'Falta el costo de: ' + faltan.join(', ') + ' (cargalo en "Costos")' : '' };
    });
    if (ce.costo) {
      ent.getRange(2, ce.costo, filas, 1).setValues(salida.map(x => [x.costo])).setNotes(salida.map(x => [x.nota])).setNumberFormat('$#,##0');
    }
    if (ce.ganancia) ent.getRange(2, ce.ganancia, filas, 1).setValues(salida.map(x => [x.ganancia])).setNumberFormat('$#,##0');
    if (ce.mes) ent.getRange(2, ce.mes, filas, 1).setValues(salida.map(x => [x.mes ? MESES[Number(x.mes.slice(5)) - 1] + ' ' + x.mes.slice(0, 4) : '']));
    if (ce.total) ent.getRange(2, ce.total, filas, 1).setNumberFormat('$#,##0');
  }

  // Meses viejos (hoja oculta "Historial": mes yyyy-MM | pedidos | ventas | costo | ganancia), se suman a lo nuevo
  const hist = libro.getSheetByName('Historial');
  if (hist && hist.getLastRow() > 1) hist.getRange(2, 1, hist.getLastRow() - 1, 5).getValues().forEach(f => {
    const k = f[0] instanceof Date ? Utilities.formatDate(f[0], tz, 'yyyy-MM') : String(f[0]).trim();
    if (!/^\d{4}-\d{2}$/.test(k)) return;
    const m = meses[k] || (meses[k] = { pedidos: 0, ventas: 0, costo: 0, ganancia: 0, sinCosto: 0 });
    m.pedidos += Number(f[1]) || 0; m.ventas += Number(f[2]) || 0; m.costo += Number(f[3]) || 0; m.ganancia += Number(f[4]) || 0;
  });

  // Hoja Resumen: un renglón por mes, el más nuevo arriba
  res.clear();
  const titulos = [['Mes', 'Pedidos', 'Ventas', 'Costo', 'Ganancia', 'Margen']];
  const claves = Object.keys(meses).sort().reverse();
  const cuerpo = claves.map(k => {
    const m = meses[k];
    return [MESES[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4), m.pedidos, m.ventas, m.costo, m.ganancia,
            m.costo ? m.ganancia / (m.costo + m.ganancia) : ''];
  });
  res.getRange(1, 1, 1, titulos[0].length).setValues(titulos).setFontWeight('bold');
  if (cuerpo.length) {
    res.getRange(2, 1, cuerpo.length, titulos[0].length).setValues(cuerpo);
    res.getRange(2, 3, cuerpo.length, 3).setNumberFormat('$#,##0');
    res.getRange(2, 6, cuerpo.length, 1).setNumberFormat('0%');
  } else {
    res.getRange(2, 1).setValue('Todavía no hay pedidos entregados.');
  }
  res.getRange(1, 5).setNote('Ganancia = lo que pagó el cliente − lo que te costaron los productos (hoja "Costos"). Si un pedido no tiene todos sus costos cargados, no suma a "Costo" ni a "Ganancia" hasta que los cargues en "Costos".');
  res.setFrozenRows(1);
}

// Pedidos de antes (sin la marca guardada): se toma la casilla tal como está, una sola vez
function migrarDescontado_() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PEDIDOS);
  const c = columnas_(hoja);
  const filas = hoja.getLastRow() - 1;
  if (filas < 1 || !c.items || !c.descontado) return;
  const datos = hoja.getRange(2, 1, filas, hoja.getLastColumn()).getValues();
  datos.forEach((d, i) => {
    const g = leerGuardado_(d[c.items - 1]);
    if (g.desc !== undefined) return;
    // Solo cuenta como descontado si además está confirmado (evita devolver stock por una casilla tildada sin querer)
    const desc = d[c.descontado - 1] === true && c.confirmado && d[c.confirmado - 1] === true;
    hoja.getRange(i + 2, c.items).setValue(JSON.stringify({ items: g.items, texto: g.texto, desc: !!desc }));
  });
}

function actualizarGanancias() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (conCandado_(() => { prepararVentas_(); return true; }) === null) return;
  libro.toast('Resumen actualizado.', 'Ganancias', 5);
}

// ---------- Ayudantes ----------

// Ejecuta "tarea" de a una por vez. Devuelve null si la planilla estaba ocupada.
function conCandado_(tarea, silencioso) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(25000)) {
    SpreadsheetApp.getActiveSpreadsheet().toast(silencioso
      ? 'Hubo muchos cambios juntos. Si algo no se actualizó, usá Cremita → Revisar pedidos y stock.'
      : 'Esperá un segundo y volvé a intentar.', 'Planilla ocupada', 8);
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

// Casillas que se puedan tocar: si la celda tenía una fórmula (=FALSO() al importar un Excel)
// la casilla no responde, así que primero se reemplaza la fórmula por su valor.
function casillasDeVerdad_(rango) {
  const valores = rango.getValues().map(f => [f[0] === true || String(f[0]).toUpperCase() === 'TRUE' || String(f[0]).toUpperCase() === 'VERDADERO']);
  rango.clearContent().setValues(valores).insertCheckboxes();
}

// Estilo igual a la planilla original: encabezado marrón con letra blanca, filas blancas, letra negra
const COLOR_CASILLA = '#808080';
const ESTILO = { encabezado: '#904d23', textoEncabezado: '#ffffff', texto: '#000000' };
function darEstilo_(libro) {
  libro.getSheets().forEach(hoja => {
    const ancho = hoja.getLastColumn();
    if (!ancho || hoja.isSheetHidden() || hoja.getName() === 'Cómo está armada') return;
    const filas = hoja.getMaxRows();
    hoja.getBandings().forEach(b => b.remove());
    const todo = hoja.getRange(1, 1, filas, ancho);
    todo.setBackground(null).setFontFamily('Arial').setFontSize(11).setFontWeight('normal')
      .setBorder(false, false, false, false, false, false);
    // En Pedidos no se toca el color de la letra (los cancelados van en gris)
    if (hoja.getName() !== HOJA_PEDIDOS) hoja.getRange(2, 1, Math.max(filas - 1, 1), ancho).setFontColor(ESTILO.texto);
    hoja.getRange(1, 1, 1, ancho).setBackground(ESTILO.encabezado).setFontColor(ESTILO.textoEncabezado)
      .setFontWeight('bold').setHorizontalAlignment('center');
    hoja.setRowHeight(1, 21);
    hoja.setFrozenRows(1);
    // Botoncitos de filtro en el encabezado (si no están)
    if (!hoja.getFilter()) hoja.getRange(1, 1, filas, ancho).createFilter();
  });
  // Casillas en gris suave, como en la planilla original
  const prod = libro.getSheetByName(HOJA_PRODUCTOS), cp = prod ? columnas_(prod) : {};
  if (cp.activo) prod.getRange(2, cp.activo, prod.getMaxRows() - 1, 1).setFontColor(COLOR_CASILLA);
  const ped = libro.getSheetByName(HOJA_PEDIDOS);
  if (ped) { const c = columnas_(ped); CASILLAS_PEDIDOS.forEach(t => { if (c[t]) ped.getRange(2, c[t], ped.getMaxRows() - 1, 1).setFontColor(COLOR_CASILLA); }); }
  // Precios y costos con el formato de antes ($21.000)
  const formato = (nombre, titulo) => {
    const h = libro.getSheetByName(nombre); if (!h) return;
    const col = columnas_(h)[titulo]; if (col) h.getRange(2, col, h.getMaxRows() - 1, 1).setNumberFormat('$#,##0');
  };
  formato(HOJA_PRODUCTOS, 'precio'); formato(HOJA_COSTOS, 'costo');
  formato(HOJA_PEDIDOS, 'total');
  ['total', 'costo', 'ganancia'].forEach(t => formato(HOJA_ENTREGADOS, t));
  ['ventas', 'costo', 'ganancia'].forEach(t => formato(HOJA_RESUMEN, t));
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
    if (titulo === 'cancelado' || titulo === 'entregado') {
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
function linkSegunEstado_(hoja, c, fila, d, actual, estado, nota) {
  if (!c.whatsapp) return;
  const v = t => (c[t] ? d[c[t] - 1] : '');
  const tel = numeroWhatsApp_(v('telefono'));
  const celda = hoja.getRange(fila, c.whatsapp);
  const textos = { '': 'Escribirle', confirmado: 'Avisar confirmación', cancelado: 'Avisar cancelación', sinstock: 'Avisar falta de stock' };
  const texto = tel ? textos[estado] : '';
  actual = actual || { texto: '', url: '' };
  if (!texto) { if (actual.texto) celda.clearContent(); return; }

  const nombre = String(v('nombre')).trim(), codigo = String(v('pedido')).trim();
  const hola = '¡Hola' + (nombre ? ' ' + nombre : '') + '! Te escribimos de ' + NOMBRE_TIENDA + '. ';
  const pedido = 'Tu pedido' + (codigo ? ' #' + codigo : '');
  const msg = estado === 'confirmado'
    ? hola + pedido + ' quedó confirmado:\n' +
      String(v('detalle')).split('\n').map(l => l.trim()).filter(Boolean).map(l => '• ' + l.replace(/^(\d+x\s*)\[[^\]]*\]\s*/, '$1')).join('\n') +
      (Number(v('total')) ? '\nTotal: ' + pesos_(Number(v('total'))) : '') +
      (ALIAS_PAGO ? '\n\nPodés transferir' + (Number(v('total')) ? ' ' + pesos_(Number(v('total'))) : '') +
        ' al alias: ' + ALIAS_PAGO + '\nCuando transfieras, mandanos el comprobante por acá.' : '') +
      '\n\nNos ponemos en contacto para coordinar la entrega. ¡Gracias por tu compra!'
    : estado === 'cancelado'
    ? hola + pedido + ' tuvo que ser cancelado. Si querés, te ayudamos a armar otro. ¡Perdón por las molestias!'
    : estado === 'sinstock'
    ? hola + 'Sobre tu pedido' + (codigo ? ' #' + codigo : '') + ', no nos alcanza el stock de:\n' +
      String(nota || '').replace(/^No alcanza el stock:\s*/, '').split(/\),\s*/).map(x => x.replace(/\)?$/, ')'))
        .map(x => '• ' + x.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*\(pide (\d+), hay (\d+)\)$/, ': pediste $1, tenemos $2'))
        .join('\n') +
      '\n¿Te mandamos lo que tenemos o preferís cambiarlo por otro producto?'
    : hola + 'Recibimos tu pedido' + (codigo ? ' #' + codigo : '') + '. ';
  const url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  if (texto === actual.texto && url === actual.url) return;    // ya está bien (mismo texto y mismo mensaje)
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
  const cId = titulos.indexOf('id'), cNombre = titulos.indexOf('nombre'), cActivo = titulos.indexOf('activo');
  let mayor = 0;
  for (let i = 1; i < valores.length; i++) mayor = Math.max(mayor, Number(valores[i][cId]) || 0);
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][cNombre]).trim() && String(valores[i][cId]).trim() === '') {
      mayor += 1;
      hoja.getRange(i + 1, cId + 1).setValue(mayor);
      // Producto nuevo: casilla "activo" destildada (se tilda cuando tenga precio y esté listo)
      if (cActivo >= 0 && valores[i][cActivo] === '') {
        hoja.getRange(i + 1, cActivo + 1).insertCheckboxes().setFontColor(COLOR_CASILLA);
      }
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


// ---------- Fotos de productos ----------
// Cremita → "Agregar foto al producto": se para en la fila del producto (hoja Productos),
// elige o pega una foto, y el script la achica, la guarda en Drive (carpeta "Cremita - Fotos de productos",
// compartida para que la página la pueda mostrar) y pone el link en la columna "foto".

const CARPETA_FOTOS = 'Cremita - Fotos de productos';

function agregarFoto() {
  const ui = SpreadsheetApp.getUi();
  const hoja = SpreadsheetApp.getActiveSheet();
  if (hoja.getName() !== HOJA_PRODUCTOS) {
    ui.alert('Andá a la hoja "Productos", hacé clic en el producto y volvé a tocar "Agregar foto al producto".');
    return;
  }
  const fila = hoja.getActiveRange().getRow();
  const c = columnas_(hoja);
  if (!c.foto) { ui.alert('No encuentro la columna "foto" en la hoja Productos.'); return; }
  const nombre = fila > 1 && c.nombre ? String(hoja.getRange(fila, c.nombre).getValue() || '').trim() : '';
  if (!nombre) { ui.alert('Hacé clic en la fila de un producto (no en los títulos ni en una fila vacía).'); return; }
  const id = c.id ? String(hoja.getRange(fila, c.id).getValue() || '') : '';
  const fotoActual = String(hoja.getRange(fila, c.foto).getValue() || '');
  const html = HtmlService.createHtmlOutput(htmlFoto_({ id, fila, nombre, fotoActual }))
    .setWidth(440).setHeight(520);
  ui.showModalDialog(html, 'Foto del producto');
}

// La llama la ventanita con la foto ya achicada (JPG en base64)
function subirFoto(datos) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PRODUCTOS);
  const c = columnas_(hoja);
  // Busca el producto por id (por si mientras tanto se ordenó la hoja)
  let fila = Number(datos.fila);
  if (c.id && datos.id && hoja.getLastRow() > 1) {
    const ids = hoja.getRange(2, c.id, hoja.getLastRow() - 1, 1).getValues();
    const i = ids.findIndex(r => String(r[0]) === String(datos.id));
    if (i < 0) throw new Error('No encontré el producto ' + datos.id + ' en la hoja.');
    fila = i + 2;
  }
  const nombreArchivo = 'producto-' + (datos.id || fila) + '-' + Utilities.formatDate(new Date(), 'GMT-3', 'yyyyMMdd-HHmmss') + '.jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(datos.base64), 'image/jpeg', nombreArchivo);
  const archivo = carpetaFotos_().createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://lh3.googleusercontent.com/d/' + archivo.getId();
  hoja.getRange(fila, c.foto).setValue(url);
  return url;
}

function carpetaFotos_() {
  const props = PropertiesService.getDocumentProperties();
  const guardada = props.getProperty('carpetaFotos');
  if (guardada) {
    try { const f = DriveApp.getFolderById(guardada); if (!f.isTrashed()) return f; } catch (err) {}
  }
  const existentes = DriveApp.getFoldersByName(CARPETA_FOTOS);
  const carpeta = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA_FOTOS);
  props.setProperty('carpetaFotos', carpeta.getId());
  return carpeta;
}

function htmlFoto_(info) {
  const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  return `<!doctype html><html><head><base target="_top"><style>
  body{font-family:Arial,sans-serif;margin:0;padding:4px 2px;color:#222;font-size:14px}
  .nombre{font-weight:bold;margin:0 0 10px}
  .zona{border:2px dashed #904d23;padding:16px;text-align:center;cursor:pointer;background:#fbf7f2}
  .zona.encima{background:#f1e3cf}
  .zona small{display:block;color:#666;margin-top:6px}
  #vista{display:block;max-width:100%;max-height:230px;margin:10px auto;object-fit:contain}
  .botones{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
  button{font-size:14px;padding:8px 14px;border:0;cursor:pointer}
  #subir{background:#904d23;color:#fff}#subir:disabled{background:#c8a68f;cursor:default}
  #cancelar{background:#e6e6e6}
  #msj{min-height:20px;margin-top:8px}.error{color:#b00020;font-weight:bold}
  </style></head><body>
  <p class="nombre">${esc(info.nombre)}</p>
  <div class="zona" id="zona">Hacé clic para elegir una foto<small>o arrastrala acá, o pegala con Ctrl+V</small></div>
  <input type="file" id="archivo" accept="image/*" hidden>
  <img id="vista" alt="" ${info.fotoActual ? `src="${esc(info.fotoActual)}"` : 'hidden'}>
  <div id="msj">${info.fotoActual ? 'Esta es la foto que tiene ahora. Elegí otra para reemplazarla.' : ''}</div>
  <div class="botones"><button id="cancelar">Cancelar</button><button id="subir" disabled>Guardar foto</button></div>
  <script>
  const info = ${JSON.stringify({ id: info.id, fila: info.fila })};
  const $ = id => document.getElementById(id);
  let base64 = null;
  const msj = (t, error) => { $('msj').textContent = t; $('msj').className = error ? 'error' : ''; };
  function cargar(archivo) {
    if (!archivo || !/^image\\//.test(archivo.type)) { msj('Eso no es una imagen.', true); return; }
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900, k = Math.min(1, max / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * k); lienzo.height = Math.round(img.height * k);
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height); // fondo blanco para PNG transparentes
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        const url = lienzo.toDataURL('image/jpeg', 0.82);
        base64 = url.split(',')[1];
        $('vista').src = url; $('vista').hidden = false;
        $('subir').disabled = false;
        msj('Lista para guardar (' + Math.round(base64.length * 0.75 / 1024) + ' KB).');
      };
      img.onerror = () => msj('No pude abrir esa imagen. Probá con otra (JPG o PNG).', true);
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  }
  $('zona').onclick = () => $('archivo').click();
  $('archivo').onchange = e => cargar(e.target.files[0]);
  $('zona').ondragover = e => { e.preventDefault(); $('zona').classList.add('encima'); };
  $('zona').ondragleave = () => $('zona').classList.remove('encima');
  $('zona').ondrop = e => { e.preventDefault(); $('zona').classList.remove('encima'); cargar(e.dataTransfer.files[0]); };
  document.addEventListener('paste', e => {
    const item = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
    if (item) cargar(item.getAsFile()); else msj('Lo que pegaste no es una imagen. Copiá la imagen (clic derecho → Copiar imagen).', true);
  });
  $('cancelar').onclick = () => google.script.host.close();
  $('subir').onclick = () => {
    $('subir').disabled = true; $('cancelar').disabled = true; msj('Guardando…');
    google.script.run
      .withSuccessHandler(() => { msj('¡Listo! La foto ya está en la página.'); setTimeout(() => google.script.host.close(), 900); })
      .withFailureHandler(err => { msj('No se pudo guardar: ' + (err && err.message || err), true); $('subir').disabled = false; $('cancelar').disabled = false; })
      .subirFoto({ id: info.id, fila: info.fila, base64 });
  };
  </script></body></html>`;
}
