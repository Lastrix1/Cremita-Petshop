// =====================================================================
// CONFIGURACIÓN DE LA TIENDA
// Cambiá SOLO los datos de "DATOS BÁSICOS". Todo lo demás (links,
// textos que se ven en la página, mensaje de WhatsApp) se arma solo
// a partir de ellos, así que si cambiás algo acá se actualiza en toda la página.
// Si dejás un dato vacío ("") esa línea no se muestra.
// =====================================================================

// ---------- DATOS BÁSICOS ----------

// Número de WhatsApp en formato internacional, sin "+", espacios ni guiones.
// Argentina: 549 + código de área sin 0 + número sin 15 → "5491123456789"
const WHATSAPP = "5491128796683";

const INSTAGRAM_USUARIO = "cremitapetshop"; // lo que va después de instagram.com/
const FACEBOOK_USUARIO = "cremitapetshop";  // lo que va después de facebook.com/
const FACEBOOK_NOMBRE = "Cremita Petshop";  // cómo se muestra en la página

// Texto que se ve en el pie al lado del ícono de WhatsApp (al tocarlo abre el chat).
// Si lo dejás vacío ("") se muestra el número, ej. "11 6567-2883".
const TELEFONO_TEXTO = "Teléfono";

const BARRIO = "Barracas";
const MAPS_ID = "12934420130235000651"; // número "cid" de la ficha de Google Maps

const HORARIOS = "09-18 hs"; // ej. "Lun a Sáb de 9 a 18 hs"
const FRASE = "[Frase corta] Todo para tu mascota, con cariño."; // PLACEHOLDER

const SALUDO_WHATSAPP = "¡Hola Cremita! Quiero hacer este pedido:";

// Página de KRSp (los que hicimos la web). Mientras esté vacío, el logo del pie no lleva a ningún lado.
const SITIO_KRSP = ""; // ej. "https://krsp.com.ar"

// ---------- A PARTIR DE ACÁ NO HACE FALTA TOCAR NADA ----------

// "5491165672883" → "11 6567-2883"
function formatearTelefono(numero) {
  const local = numero.replace(/^549/, "");
  if (local.length !== 10) return "+" + numero;
  const largoArea = local.startsWith("11") ? 2 : 3; // CABA y GBA: 11, resto del país: 3 dígitos
  const area = local.slice(0, largoArea);
  const resto = local.slice(largoArea);
  const corte = resto.length - 4;
  return `${area} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

const CONFIG = {
  // Usados por el carrito para armar el pedido
  whatsapp: WHATSAPP,
  saludo: SALUDO_WHATSAPP,

  // Textos que se muestran en el pie
  frase: FRASE,
  direccion: BARRIO,
  horarios: HORARIOS,
  telefono: WHATSAPP ? TELEFONO_TEXTO || formatearTelefono(WHATSAPP) : "",

  // Links
  mapa: MAPS_ID ? `https://maps.google.com/?cid=${MAPS_ID}` : "",
  whatsappLink: WHATSAPP ? `https://wa.me/${WHATSAPP}` : "",
  krsp: SITIO_KRSP,
  instagram: {
    url: INSTAGRAM_USUARIO ? `https://www.instagram.com/${INSTAGRAM_USUARIO}/` : "",
    texto: `@${INSTAGRAM_USUARIO}`,
  },
  facebook: {
    url: FACEBOOK_USUARIO ? `https://www.facebook.com/${FACEBOOK_USUARIO}` : "",
    texto: FACEBOOK_NOMBRE,
  },
};
