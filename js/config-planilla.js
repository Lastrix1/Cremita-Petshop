// =====================================================================
// CONEXIÓN CON LA PLANILLA DE GOOGLE
// Links de la planilla (ver borradores/prueba-planilla/INSTRUCCIONES.md).
// Si un link queda vacío (""), la página funciona como antes:
//   - sin productosCsv → usa los productos de js/productos.js
//   - sin pedidosUrl   → no anota los pedidos en la planilla
// =====================================================================
const PLANILLA = {
  // Archivo → Compartir → Publicar en la web → hoja "Productos" → CSV
  productosCsv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR24IOf1VHqLXa95JFkHfD_nsPVppARs_5DhXMUfGv7_MMf8ffuBujF7C8Ux1wgOU6UNrB4tvmyo0v5/pub?gid=993390588&single=true&output=csv",

  // Extensiones → Apps Script → Implementar → App web → URL (termina en /exec)
  pedidosUrl: "https://script.google.com/macros/s/AKfycbwBBMDx3GDIDBiupcNus6IeHa7U_J3TriUvI9qUIMqxk8Dpy8_Js8yFM3ueENhwGmVV/exec",

  // Carpeta desde donde se buscan las fotos que no son un link completo ("" = img/... desde la raíz).
  baseImagenes: "",
};
