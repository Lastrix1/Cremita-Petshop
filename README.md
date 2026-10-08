# Cremita-Petshop

Catálogo web de Cremita Petshop. Los clientes eligen productos y envían el pedido por WhatsApp.

## Qué completar

| Qué | Dónde |
|---|---|
| Número de WhatsApp | `js/config.js` → `WHATSAPP` (también arma el teléfono y el link del pie) |
| Productos, precios y stock | Planilla de Google (hoja **Productos**). Los links están en `js/config-planilla.js` |
| Productos de respaldo (si la planilla falla) | `js/productos.js` |
| Pedidos | Planilla de Google (hoja **Pedidos**): tildar *confirmado* descuenta el stock |
| Fotos de productos | `img/productos/` y el campo `imagen` de cada producto |
| Logo | `img/logo.png` |
| Texto de "Quiénes somos" | `index.html`, sección `quienes-somos` |
| Datos de contacto y links (dirección, horarios, teléfono, mapa, Instagram, Facebook) | `js/config.js` |
| Colores | `css/colores.css` (cada color tiene un nombre y una nota de dónde se usa) |

Todo lo que falta completar está marcado con `[corchetes]` o con un comentario `PLACEHOLDER`.

## Ver la página localmente

Abrir `index.html` en el navegador, o servir la carpeta:

```bash
python -m http.server 5500
```
