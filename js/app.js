const CLAVE_CARRITO = "cremita-carrito";

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
      return `
        <article class="tarjeta">
          <div class="tarjeta-imagen">${imagen}</div>
          <div class="tarjeta-cuerpo">
            <span class="tarjeta-categoria">${escapar(p.categoria)} · ${escapar(p.subcategoria)}</span>
            <h3>${escapar(p.nombre)}</h3>
            <div class="tarjeta-pie">
              <span class="precio">${formatoPrecio(p.precio)}</span>
              <button class="btn-agregar" data-agregar="${p.id}" aria-label="Agregar ${escapar(p.nombre)}">
                <i class="ti ti-plus" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </article>`;
    })
    .join("");

  $("sin-resultados").hidden = visibles.length > 0;
}

// ---------- Carrito ----------

function cambiarCantidad(id, delta) {
  const nueva = (carrito[id] || 0) + delta;
  if (nueva > 0) carrito[id] = nueva;
  else delete carrito[id];
  guardarCarrito();
  renderCarrito();
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
                <button data-agregar="${p.id}" aria-label="Agregar uno">+</button>
              </div>
              <span class="item-subtotal">${formatoPrecio(p.precio * carrito[id])}</span>
            </div>`;
        })
        .join("")
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

function enviarWhatsApp() {
  const ids = Object.keys(carrito);
  if (!ids.length) {
    $("carrito-aviso").textContent = "Agregá al menos un producto para hacer el pedido.";
    $("carrito-aviso").hidden = false;
    return;
  }

  const lineas = ids.map((id) => {
    const p = buscarProducto(id);
    return `• ${carrito[id]}x ${p.nombre} – ${formatoPrecio(p.precio * carrito[id])}`;
  });
  const mensaje = [CONFIG.saludo, ...lineas, "", `Total: ${formatoPrecio(calcularTotal())}`].join("\n");

  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
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
  guardarCarrito();
  renderCarrito();
});

renderContacto();
renderFiltros();
renderGrilla();
renderCarrito();
