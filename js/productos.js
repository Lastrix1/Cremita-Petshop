// Lista de productos. PLACEHOLDER: reemplazar por los productos reales.
//
// CATEGORIAS: cada botón de filtro y su submenú.
//   nombre        lo que se ve en el botón (ej: "Perros")
//   subcategorias opciones del submenú (ej: "Comida", "Juguetes")
//
// Campos de cada producto:
//   id           identificador único (no repetir)
//   nombre       lo que se ve en la tarjeta y en el mensaje de WhatsApp
//   precio       número sin puntos ni signo $ (ej: 15000)
//   categoria    debe coincidir con un "nombre" de CATEGORIAS
//   subcategoria debe coincidir con una de las "subcategorias" de esa categoría
//   imagen       ruta a la foto (ej: "img/productos/dog-chow.jpg"); si está vacía se muestra un ícono
//   icono        ícono de respaldo cuando no hay imagen (https://tabler.io/icons)

const CATEGORIAS = [
  { nombre: "Perros", subcategorias: ["Comida", "Juguetes", "Accesorios", "Higiene"] },
  { nombre: "Gatos",  subcategorias: ["Comida", "Juguetes", "Accesorios", "Higiene"] },
];

// Botones sueltos por tipo de producto (sin submenú): muestran ese tipo para todas las mascotas.
// Cada uno debe coincidir con una subcategoría de CATEGORIAS.
const TIPOS = ["Juguetes", "Accesorios", "Higiene"];

const PRODUCTOS = [
  { id: 1,  nombre: "[Producto] Alimento perro adulto 3kg", precio: 15000, categoria: "Perros", subcategoria: "Comida",     imagen: "", icono: "ti-bowl" },
  { id: 2,  nombre: "[Producto] Pelota mordedora",          precio: 3200,  categoria: "Perros", subcategoria: "Juguetes",   imagen: "", icono: "ti-ball-tennis" },
  { id: 3,  nombre: "[Producto] Hueso de cuero",            precio: 2500,  categoria: "Perros", subcategoria: "Juguetes",   imagen: "", icono: "ti-bone" },
  { id: 4,  nombre: "[Producto] Collar ajustable M",        precio: 4500,  categoria: "Perros", subcategoria: "Accesorios", imagen: "", icono: "ti-circle-dot" },
  { id: 5,  nombre: "[Producto] Correa extensible",         precio: 7600,  categoria: "Perros", subcategoria: "Accesorios", imagen: "", icono: "ti-link" },
  { id: 6,  nombre: "[Producto] Shampoo para perros",       precio: 5200,  categoria: "Perros", subcategoria: "Higiene",    imagen: "", icono: "ti-bottle" },
  { id: 7,  nombre: "[Producto] Alimento gato 1,5kg",       precio: 9800,  categoria: "Gatos",  subcategoria: "Comida",     imagen: "", icono: "ti-bowl" },
  { id: 8,  nombre: "[Producto] Ratón de juguete",          precio: 1900,  categoria: "Gatos",  subcategoria: "Juguetes",   imagen: "", icono: "ti-mouse" },
  { id: 9,  nombre: "[Producto] Rascador chico",            precio: 18000, categoria: "Gatos",  subcategoria: "Accesorios", imagen: "", icono: "ti-cat" },
  { id: 10, nombre: "[Producto] Piedras sanitarias 4kg",    precio: 6300,  categoria: "Gatos",  subcategoria: "Higiene",    imagen: "", icono: "ti-sparkles" },
];
