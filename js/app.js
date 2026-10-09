const CLAVE_CARRITO = "cremita-carrito";
const CLAVE_COMPRADOR = "cremita-comprador"; // nombre y celular, para no escribirlos cada vez

const $ = (id) => document.getElementById(id);
const formatoPrecio = (n) => "$" + Math.round(n).toLocaleString("es-AR");
const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// animal: "Perros", "Gatos"… | tipo: "Comida", "Juguetes"… | vacío = sin filtrar.
// origen indica qué botón se usó ("animal" o "tipo") para resaltar ese y no el otro.
let filtro = { animal: "", tipo: "", origen: "" };
let menuAbierto = null; // clave del submenú desplegado, ej: "animal:Perros" o "tipo:Comida"
let busqueda = "";
let carrito = cargarCarrito(); // { [idProducto]: cantidad }
let ultimoPedido = null; // { codigo, url } del último pedido enviado, para el mensaje de "¡Gracias!"

// ---------- Persistencia ----------

function cargarCarrito() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO)) || {};
    // Descarta productos que ya no existen en la lista
    return Object.fromEntries(Object.entries(guardado).filter(([id]) => buscarProducto(id)));
  } catch {
    return {};
  }
}

function guardarCarrito() {
  try {
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
  } catch {
    // Sin almacenamiento disponible: el carrito funciona igual mientras la página esté abierta
  }
}

function buscarProducto(id) {
  return PRODUCTOS.find((p) => String(p.id) === String(id));
}

// ---------- Stock (viene de la planilla; null = sin control de stock) ----------

const hayStock = (p) => p.stock == null || p.stock > 0;
const maximoPermitido = (p) => (p.stock == null ? 99 : Math.max(0, p.stock));

// Saca del carrito lo que ya no hay y ajusta cantidades al stock disponible
function ajustarCarritoAlStock() {
  for (const id of Object.keys(carrito)) {
    const p = buscarProducto(id);
    const max = p ? maximoPermitido(p) : 0;
    if (!max) delete carrito[id];
    else if (carrito[id] > max) carrito[id] = max;
  }
  guardarCarrito();
}

// ---------- Catálogo ----------

function botonConSubmenu(clave, etiqueta, activo, opciones) {
  const abierto = menuAbierto === clave;
  const items = opciones
    .map(
      (o) => `<button class="submenu-opcion ${o.activo ? "activo" : ""}"
                data-animal="${escapar(o.animal)}" data-tipo="${escapar(o.tipo)}" data-origen="${o.origen}">${escapar(o.texto)}</button>`
    )
    .join("");
  return `
    <div class="filtro-grupo">
      <button class="chip ${activo ? "activo" : ""}" data-menu="${escapar(clave)}" aria-expanded="${abierto}">
        ${escapar(etiqueta)} <i class="ti ti-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="submenu" ${abierto ? "" : "hidden"}>${items}</div>
    </div>`;
}

function renderFiltros() {
  const { animal, tipo, origen } = filtro;
  const todos = `<button class="chip ${!animal && !tipo ? "activo" : ""}" data-filtro="Todos">Todos</button>`;

  // Por mascota: Perros ▾ → Todo para perros, Comida, Juguetes…
  const porAnimal = CATEGORIAS.map((c) => {
    const activo = origen === "animal" && animal === c.nombre;
    const opciones = [
      { texto: `Todo para ${c.nombre.toLowerCase()}`, animal: c.nombre, tipo: "" },
      ...c.subcategorias.map((t) => ({ texto: t, animal: c.nombre, tipo: t })),
    ].map((o) => ({ ...o, origen: "animal", activo: activo && tipo === o.tipo }));
    return botonConSubmenu(`animal:${c.nombre}`, activo && tipo ? `${c.nombre} · ${tipo}` : c.nombre, activo, opciones);
  }).join("");

  // Por tipo: botones simples que muestran ese tipo para todas las mascotas
  const porTipo = TIPOS.map(
    (t) => `<button class="chip ${origen === "tipo" && tipo === t ? "activo" : ""}"
              data-animal="" data-tipo="${escapar(t)}" data-origen="tipo">${escapar(t)}</button>`
  ).join("");

  $("filtros").innerHTML = `${todos}${porAnimal}<span class="filtros-separador" aria-hidden="true"></span>${porTipo}`;
}

function aplicarFiltro(animal = "", tipo = "", origen = "") {
  filtro = { animal, tipo, origen };
  menuAbierto = null;
  renderFiltros();
  renderGrilla();
}

function renderGrilla() {
  const texto = busqueda.trim().toLowerCase();
  const visibles = PRODUCTOS.filter(
    (p) =>
      (!filtro.animal || p.categoria === filtro.animal) &&
      (!filtro.tipo || p.subcategoria === filtro.tipo) &&
      p.nombre.toLowerCase().includes(texto)
  );

  $("grilla").innerHTML = visibles
    .map((p) => {
      const imagen = p.imagen
        ? `<img src="${escapar(p.imagen)}" alt="${escapar(p.nombre)}" loading="lazy">`
        : `<i class="ti ${escapar(p.icono || "ti-paw")}" aria-hidden="true"></i>`;
      const sinStock = !hayStock(p);
      // El cliente ya tiene en el carrito todo el stock que hay de este producto
      const alTope = !sinStock && p.stock != null && (carrito[p.id] || 0) >= maximoPermitido(p);
      const cartel = sinStock
        ? `<span class="cartel-stock">Sin stock</span>`
        : alTope
        ? `<span class="cartel-stock">No quedan más</span>`
        : p.stock != null && p.stock <= 3
          ? `<span class="cartel-stock ultimas">¡Últimas unidades!</span>`
          : "";
      return `
        <article class="tarjeta${sinStock ? " sin-stock" : alTope ? " al-tope" : ""}">
          <div class="tarjeta-imagen">${imagen}${cartel}</div>
          <div class="tarjeta-cuerpo">
            <span class="tarjeta-categoria">${escapar(p.categoria)} · ${escapar(p.subcategoria)}</span>
            <h3>${escapar(p.nombre)}</h3>
            <div class="tarjeta-pie">
              <span class="precio">${formatoPrecio(p.precio)}</span>
              <button class="btn-agregar" data-agregar="${p.id}" aria-label="${sinStock ? "Sin stock" : "Agregar " + escapar(p.nombre)}" ${sinStock || (carrito[p.id] || 0) >= maximoPermitido(p) ? "disabled" : ""}>
                <i class="ti ti-plus" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </article>`;
    })
    .join("");

  $("sin-resultados").textContent = PRODUCTOS.length
    ? "No encontramos productos con ese filtro."
    : "Por ahora no hay productos disponibles. ¡Volvé pronto!";
  $("sin-resultados").hidden = visibles.length > 0;
}

// ---------- Carrito ----------

function cambiarCantidad(id, delta) {
  const p = buscarProducto(id);
  if (!p) return;
  const nueva = Math.min((carrito[id] || 0) + delta, maximoPermitido(p)); // no deja pasar el stock
  if (nueva > 0) carrito[id] = nueva;
  else delete carrito[id];
  if (delta > 0) ultimoPedido = null; // empezó otro pedido: se saca el "¡Gracias!"
  guardarCarrito();
  renderCarrito();
  renderGrilla(); // para activar o desactivar el "+" si se llegó al stock
}

function calcularTotal() {
  return Object.entries(carrito).reduce((suma, [id, cant]) => suma + buscarProducto(id).precio * cant, 0);
}

function renderCarrito() {
  const ids = Object.keys(carrito);
  const unidades = ids.reduce((s, id) => s + carrito[id], 0);

  $("contador").textContent = unidades;
  $("contador").hidden = unidades === 0; // sin productos, no se muestra el contador
  $("total").textContent = formatoPrecio(calcularTotal());
  $("carrito-aviso").hidden = true;
  $("carrito-items").classList.remove("con-error");

  $("carrito-items").innerHTML = ids.length
    ? ids
        .map((id) => {
          const p = buscarProducto(id);
          return `
            <div class="item">
              <div class="item-info">
                <span class="item-nombre">${escapar(p.nombre)}</span>
                <span class="item-precio">${formatoPrecio(p.precio)} c/u</span>
              </div>
              <div class="item-cantidad">
                <button data-restar="${p.id}" aria-label="Quitar uno">−</button>
                <span>${carrito[id]}</span>
                <button data-agregar="${p.id}" aria-label="Agregar uno" ${carrito[id] >= maximoPermitido(p) ? "disabled" : ""}>+</button>
              </div>
              <span class="item-subtotal">${formatoPrecio(p.precio * carrito[id])}</span>
            </div>`;
        })
        .join("")
    : ultimoPedido
    ? `<div class="pedido-enviado">
         <p><strong>¡Gracias por tu pedido!</strong></p>
         <p>${ultimoPedido.codigo ? `Tu pedido <strong>#${ultimoPedido.codigo}</strong> se abrió en WhatsApp.` : "Tu pedido se abrió en WhatsApp."} Mandá el mensaje para confirmarlo.</p>
         <p>¿No se abrió? <a href="${ultimoPedido.url}" target="_blank" rel="noopener">Abrir WhatsApp de nuevo</a></p>
       </div>`
    : `<p class="carrito-vacio">Todavía no agregaste productos.</p>`;
}

function abrirCarrito() {
  $("carrito").classList.add("abierto");
  $("carrito").setAttribute("aria-hidden", "false");
  $("overlay").hidden = false;
  document.body.classList.add("sin-scroll");
}

function cerrarCarrito() {
  $("carrito").classList.remove("abierto");
  $("carrito").setAttribute("aria-hidden", "true");
  $("overlay").hidden = true;
  document.body.classList.remove("sin-scroll");
}

// ---------- Datos del comprador ----------

function cargarComprador() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_COMPRADOR)) || {};
    $("comprador-nombre").value = c.nombre || "";
    $("comprador-telefono").value = c.telefono || "";
  } catch {
    // sin almacenamiento: se escriben cada vez
  }
}

function leerComprador() {
  const nombre = $("comprador-nombre").value.replace(/\s+/g, " ").trim();
  const telefono = $("comprador-telefono").value.trim();
  try {
    localStorage.setItem(CLAVE_COMPRADOR, JSON.stringify({ nombre, telefono }));
  } catch {}
  return { nombre, telefono };
}

// Nombre: solo letras (con tildes y ñ) y espacios entre palabras
function nombreValido(nombre) {
  return /^\p{L}{2,}( \p{L}+)*$/u.test(nombre) && nombre.length <= 40;
}

// Celular argentino → 10 números (código de área + número), o "" si no es válido.
// Acepta: "11 2345-6789", "011 15 2345-6789", "+54 9 11 2345 6789", "(0351) 15 123-4567"
function normalizarCelular(texto) {
  let d = texto.replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  d = d.replace(/^0/, "");
  if (d.length === 12) {
    // Saca el "15" que va después del código de área (de 2, 3 o 4 números)
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === "15" && (area !== 2 || d.startsWith("11"))) {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
    }
  }
  // 10 números y código de área argentino (empieza con 1, 2 o 3)
  return /^[123]\d{9}$/.test(d) ? d : "";
}

// Error bien visible: cartel con ícono, el campo marcado y un "sacudón" para que se note
function avisar(texto, campo) {
  const aviso = $("carrito-aviso");
  aviso.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i> <span>${escapar(texto)}</span>`;
  aviso.hidden = false;
  aviso.setAttribute("role", "alert");
  aviso.classList.remove("sacudir");
  void aviso.offsetWidth; // reinicia la animación si se repite el error
  aviso.classList.add("sacudir");
  aviso.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (campo) {
    $(campo).classList.add("con-error");
    $(campo).setAttribute("aria-invalid", "true");
    $(campo).focus();
  } else {
    $("carrito-items").classList.add("con-error");
  }
}

// Al corregir un campo se le saca la marca de error
["comprador-nombre", "comprador-telefono"].forEach((id) =>
  $(id).addEventListener("input", () => {
    $(id).classList.remove("con-error");
    $(id).removeAttribute("aria-invalid");
    $("carrito-aviso").hidden = true;
  })
);

function enviarWhatsApp() {
  const ids = Object.keys(carrito);
  if (!ids.length) return avisar("Agregá al menos un producto para hacer el pedido.");

  const comprador = leerComprador();
  if (!comprador.nombre) return avisar("Escribí tu nombre para hacer el pedido.", "comprador-nombre");
  if (!nombreValido(comprador.nombre)) return avisar("El nombre solo puede tener letras y espacios.", "comprador-nombre");
  const digitos = normalizarCelular(comprador.telefono);
  if (!digitos) return avisar("Revisá tu celular: tiene que tener código de área y 10 números en total, ej: 11 2345 6789.", "comprador-telefono");

  const lineas = ids.map((id) => {
    const p = buscarProducto(id);
    return `• ${carrito[id]}x ${p.nombre} – ${formatoPrecio(p.precio * carrito[id])}`;
  });

  // Se anota el pedido en la planilla con un código; el WhatsApp lleva ese mismo código
  const codigo = nuevoCodigoPedido();
  const anotado = registrarPedido({
    pedido: codigo,
    nombre: comprador.nombre,
    telefono: digitos,
    items: ids.map((id) => ({ id, cant: carrito[id] })),
  });

  const mensaje = [
    CONFIG.saludo,
    ...(anotado ? [`Pedido #${codigo}`] : []),
    `A nombre de: ${comprador.nombre}`,
    ...lineas,
    "",
    `Total: ${formatoPrecio(calcularTotal())}`,
  ].join("\n");

  const url = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank", "noopener");

  // Pedido hecho: se vacía el carrito y queda el aviso con el link por si WhatsApp no se abrió
  ultimoPedido = { codigo: anotado ? codigo : "", url };
  carrito = {};
  guardarCarrito();
  renderCarrito();
  renderGrilla();
}

// ---------- Datos de contacto (vienen de config.js) ----------

function renderContacto() {
  // Textos simples: <span data-dato="direccion"></span> → CONFIG.direccion
  document.querySelectorAll("[data-dato]").forEach((el) => {
    const valor = CONFIG[el.dataset.dato] || "";
    el.textContent = valor;
    if (!valor) el.closest("p").hidden = true; // dato vacío: se oculta la línea
  });

  // Link del mapa: <a data-link="mapa"> → CONFIG.mapa
  document.querySelectorAll("[data-link]").forEach((el) => {
    const url = CONFIG[el.dataset.link];
    if (url) el.href = url;
    else el.removeAttribute("href"); // sin link queda como texto común
  });

  // Redes: <a data-red="instagram"> → CONFIG.instagram.url y .texto
  document.querySelectorAll("[data-red]").forEach((el) => {
    const red = CONFIG[el.dataset.red];
    if (!red || !red.url) {
      el.closest("p").hidden = true;
      return;
    }
    el.href = red.url;
    el.querySelector("span").textContent = red.texto || red.url;
  });
}

// ---------- Eventos ----------

document.addEventListener("click", (e) => {
  const boton = e.target.closest("button");

  // Cierra el submenú abierto al hacer clic fuera de él
  if (menuAbierto && !e.target.closest(".filtro-grupo")) {
    menuAbierto = null;
    renderFiltros();
  }
  if (!boton) return;

  if (boton.dataset.filtro) {
    aplicarFiltro();
  } else if (boton.dataset.menu) {
    menuAbierto = menuAbierto === boton.dataset.menu ? null : boton.dataset.menu;
    renderFiltros();
  } else if (boton.dataset.origen) {
    aplicarFiltro(boton.dataset.animal, boton.dataset.tipo, boton.dataset.origen);
  } else if (boton.dataset.agregar) {
    cambiarCantidad(boton.dataset.agregar, 1);
    // Pequeña animación del contador al agregar desde el catálogo
    if (!boton.closest(".carrito")) {
      $("contador").classList.remove("salto");
      void $("contador").offsetWidth;
      $("contador").classList.add("salto");
    }
  } else if (boton.dataset.restar) {
    cambiarCantidad(boton.dataset.restar, -1);
  }
});

$("buscador").addEventListener("input", (e) => {
  busqueda = e.target.value;
  renderGrilla();
});

$("abrir-carrito").addEventListener("click", abrirCarrito);
$("cerrar-carrito").addEventListener("click", cerrarCarrito);
$("overlay").addEventListener("click", cerrarCarrito);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  cerrarCarrito();
  if (menuAbierto) {
    menuAbierto = null;
    renderFiltros();
  }
});
$("enviar-whatsapp").addEventListener("click", enviarWhatsApp);
$("vaciar-carrito").addEventListener("click", () => {
  carrito = {};
  ultimoPedido = null; // también saca el cartel de "¡Gracias por tu pedido!"
  guardarCarrito();
  renderCarrito();
  renderGrilla(); // vuelve a activar los "agregar" que estaban al tope del stock
});

// ---------- Arranque ----------

async function iniciar() {
  renderContacto();
  cargarComprador();
  if (typeof PLANILLA !== "undefined" && (PLANILLA.productosCsv || PLANILLA.pedidosUrl)) {
    $("grilla").innerHTML = `<p class="cargando">Cargando productos…</p>`;
    try {
      await cargarPlanilla();
    } catch (error) {
      // Si la planilla falla, se muestran los productos de js/productos.js
      console.warn("No se pudo leer la planilla, uso js/productos.js:", error);
    }
  }
  carrito = cargarCarrito();
  ajustarCarritoAlStock();
  renderFiltros();
  renderGrilla();
  renderCarrito();
  vigilarPlanilla();
}

// ---------- Actualización automática (sin recargar la página) ----------

const CADA_MS = 60000; // cada cuánto se revisa la planilla (60 segundos)
let ultimaVersion = JSON.stringify(PRODUCTOS);
let revisando = false;

// Vuelve a leer la planilla; si algo cambió, actualiza productos, filtros y carrito
async function revisarPlanilla() {
  if (revisando || document.hidden) return;
  revisando = true;
  try {
    await cargarPlanilla();
    const version = JSON.stringify(PRODUCTOS);
    if (version !== ultimaVersion) {
      ultimaVersion = version;
      ajustarCarritoAlStock();
      renderFiltros();
      renderGrilla();
      renderCarrito();
    }
  } catch (error) {
    // Si falla una revisión, queda lo que había; se reintenta en la próxima
  } finally {
    revisando = false;
  }
}

function vigilarPlanilla() {
  if (typeof PLANILLA === "undefined" || (!PLANILLA.productosCsv && !PLANILLA.pedidosUrl)) return;
  ultimaVersion = JSON.stringify(PRODUCTOS);
  setInterval(revisarPlanilla, CADA_MS);
  // Al volver a la pestaña (por ejemplo, después de mandar el WhatsApp) revisa enseguida
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) revisarPlanilla();
  });
}

iniciar();
