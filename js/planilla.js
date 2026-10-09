// =====================================================================
// PLANILLA DE GOOGLE: leer productos y anotar pedidos
// Usa la configuración de js/config-planilla.js (objeto PLANILLA).
// =====================================================================

// ---------- Leer el CSV publicado ----------

// Convierte el texto CSV en filas y columnas (respeta comillas y comas dentro de los textos)
function leerCSV(texto) {
  const filas = [];
  let fila = [], campo = "", entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

// "TRUE", "VERDADERO", "sí", "1" → true
const esVerdadero = (v) => /^(true|verdadero|si|sí|1|x)$/i.test(String(v).trim());

// "$15.000", "15000", "15.000,50" → número (NaN si no es un número)
function aNumero(v) {
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(s) || /\.\d{3}\./.test(s)) s = s.replace(/\./g, "");
  return Number(s);
}

// Mascota "Mixto" (o "Ambos", "Perros y gatos"): el producto sirve para las dos
const esMixto = (m) => /^(mixto|ambos|perros y gatos)$/i.test(String(m).trim());

const ORDEN_TIPOS = ["Comida", "Juguetes", "Accesorios", "Higiene"];
const ordenarTipos = (lista) =>
  [...lista].sort((a, b) => {
    const ia = ORDEN_TIPOS.indexOf(a), ib = ORDEN_TIPOS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

const conParametro = (url, extra) => url + (url.includes("?") ? "&" : "?") + extra;

// Trae la hoja "Productos" como filas (la primera son los títulos).
// 1° pregunta al script (al instante); si falla, usa el CSV publicado (puede tardar ~5 min en actualizarse).
async function traerFilas() {
  if (PLANILLA.pedidosUrl) {
    try {
      const r = await fetch(conParametro(PLANILLA.pedidosUrl, "productos=1&t=" + Date.now()));
      const datos = await r.json();
      if (datos.ok && Array.isArray(datos.filas) && datos.filas.length > 1) return datos.filas;
    } catch (error) {
      console.warn("El script no respondió, pruebo con el CSV publicado:", error);
    }
  }
  if (!PLANILLA.productosCsv) throw new Error("No hay de dónde leer la planilla");
  const r = await fetch(conParametro(PLANILLA.productosCsv, "t=" + Date.now()), { cache: "no-store" });
  if (!r.ok) throw new Error("La planilla respondió " + r.status);
  return leerCSV(await r.text());
}

// Lee la hoja "Productos" y reemplaza PRODUCTOS, CATEGORIAS y TIPOS de js/productos.js.
// Devuelve false si no hay planilla configurada. Si algo falla, tira un error
// y la página sigue con los productos de js/productos.js.
async function cargarPlanilla() {
  if (typeof PLANILLA === "undefined" || (!PLANILLA.productosCsv && !PLANILLA.pedidosUrl)) return false;

  const filas = (await traerFilas()).map((f) => f.map((v) => String(v)));
  const titulos = (filas.shift() || []).map((t) => t.trim().toLowerCase());
  const col = (nombre) => titulos.indexOf(nombre);
  // Si faltan las columnas básicas, la planilla está rota (no es que no haya productos)
  if (["id", "nombre", "precio", "mascota", "tipo"].some((c) => col(c) < 0)) {
    throw new Error("A la planilla le faltan columnas de título");
  }

  const nuevos = [];
  for (const f of filas) {
    const dato = (nombre) => (col(nombre) >= 0 ? (f[col(nombre)] || "").trim() : "");
    const id = dato("id"), nombre = dato("nombre"), mascota = dato("mascota"), tipo = dato("tipo");
    const precio = aNumero(dato("precio"));

    // Filas incompletas o con errores se ignoran (no rompen la página)
    if (!id || !nombre || !mascota || !tipo || !(precio >= 0)) continue;
    // Casilla "activo" destildada → el producto no se muestra
    if (col("activo") >= 0 && !esVerdadero(dato("activo"))) continue;

    const stock = dato("stock") === "" ? null : aNumero(dato("stock"));
    let foto = dato("foto");
    if (foto && !/^https?:\/\//i.test(foto)) foto = (PLANILLA.baseImagenes || "") + foto;

    nuevos.push({
      id, nombre, precio,
      stock: Number.isFinite(stock) ? stock : null, // null = sin control de stock
      categoria: esMixto(mascota) ? "" : mascota, subcategoria: tipo,
      mixto: esMixto(mascota), // "Mixto": sirve para perros y gatos, aparece en las dos
      imagen: foto, icono: dato("icono") || "ti-paw",
      porKilo: /^kg$/i.test(dato("unidad")), // columna "unidad" = kg → se vende suelto por kilo
    });
  }
  // Sin productos activos es válido: la página muestra el catálogo vacío
  PRODUCTOS.length = 0;
  PRODUCTOS.push(...nuevos);

  // Los filtros se arman solos con las mascotas y los tipos que haya en la planilla
  // Los "Mixto" no tienen botón propio: entran en el menú de cada mascota
  const mascotas = [...new Set(nuevos.filter((p) => !p.mixto).map((p) => p.categoria))];
  CATEGORIAS.length = 0;
  mascotas.forEach((m) =>
    CATEGORIAS.push({ nombre: m, subcategorias: ordenarTipos(new Set(nuevos.filter((p) => p.mixto || p.categoria === m).map((p) => p.subcategoria))) })
  );
  // Botones sueltos por tipo (como antes, sin "Comida", que va dentro de cada mascota)
  TIPOS.length = 0;
  TIPOS.push(...ordenarTipos(new Set(nuevos.map((p) => p.subcategoria))).filter((t) => t !== "Comida"));
  return true;
}

// ---------- Anotar el pedido en la planilla ----------

// Código corto y fácil de dictar: sin 0/O ni 1/I para no confundirse
function nuevoCodigoPedido() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 5; i++) codigo += letras.charAt(Math.floor(Math.random() * letras.length));
  return codigo;
}

// Manda el pedido a la planilla (pestaña "Pedidos"). No espera respuesta:
// el WhatsApp se abre igual aunque la planilla tarde o falle.
function registrarPedido(pedido) {
  if (typeof PLANILLA === "undefined" || !PLANILLA.pedidosUrl) return false;
  try {
    fetch(PLANILLA.pedidosUrl, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(pedido),
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
