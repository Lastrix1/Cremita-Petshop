# Prueba: productos y pedidos desde Google Sheets

Esta carpeta es una **prueba**. La página real (`index.html` de la raíz) no cambia.
Cuando la prueba funcione, se pasa a la página real.

Archivos:
- `Cremita-planilla.xlsx`: planilla de ejemplo (hojas Productos, Pedidos y Cómo usar).
- `apps-script.gs`: el script que va dentro de la planilla.
- `index.html` + `js/`: copia de la página que lee la planilla.
- `js/config-planilla.js`: acá se pegan los dos links.

---

## 1. Subir la planilla a Google

1. Entrá a drive.google.com → **Nuevo → Subir archivo** → elegí `Cremita-planilla.xlsx`.
2. Abrila con doble clic → arriba: **Abrir con Hojas de cálculo de Google**.
3. **Archivo → Guardar como Hojas de cálculo de Google.** (Trabajá siempre en esa copia, no en el .xlsx.)
4. Convertí "activo" en casillas de tilde, **solo en la hoja Productos**:
   clic en **B2** → con `Shift` apretado, clic en **B101** → **Insertar → Casilla de verificación**.
   (Las filas vacías no molestan. Si algún día hay más de 100 productos, se repite con más filas.)
   - **En la hoja Pedidos NO pongas casillas**: el script las agrega solo en cada pedido nuevo.
     Si las ponés de antemano, los pedidos se anotarían al final de esas filas vacías.

## 2. Pegar el script

1. En la planilla: **Extensiones → Apps Script**.
2. Borrá lo que aparece y pegá todo el contenido de `apps-script.gs`. Guardá (ícono del disquete).
3. **Implementar → Nueva implementación** → en el engranaje elegí **App web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. **Implementar**. La primera vez pide autorizar: elegí tu cuenta → *Configuración avanzada* → *Ir a (proyecto)* → **Permitir**.
   (Google avisa que la app "no está verificada" porque la hiciste vos; es normal.)
5. Copiá la **URL de la app web** (termina en `/exec`).
6. Para comprobar: abrí esa URL en el navegador. Tiene que decir *"La planilla de Cremita está conectada"*.

## 3. Publicar los productos

1. En la planilla: **Archivo → Compartir → Publicar en la web**.
2. En "Vínculo" elegí la hoja **Productos** y el formato **Valores separados por comas (.csv)**.
3. **Publicar** → copiá el link.

Esto solo publica una copia de lectura: nadie puede editar desde ese link.

## 4. Conectar la página de prueba

Abrí `js/config-planilla.js` y pegá los dos links entre las comillas:

```js
productosCsv: "https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&single=true&output=csv",
pedidosUrl: "https://script.google.com/macros/s/.../exec",
```

## 5. Probar

Abrí `borradores/prueba-planilla/index.html` con Go Live y fijate:

- [ ] Se ven los productos de la planilla. El "Rascador" no aparece (está con activo destildado).
- [ ] "Pelota mordedora" dice **Sin stock** y no se puede agregar.
- [ ] "Collar" dice **¡Últimas unidades!** y no deja agregar más de 2.
- [ ] Cambiá un precio en la planilla, esperá unos 5 minutos y recargá: se actualiza.
- [ ] Hacé un pedido: el WhatsApp sale con "Pedido #XXXXX" y aparece una fila nueva en **Pedidos**.
- [ ] Tildá **confirmado** en ese pedido: el stock de esos productos baja.
- [ ] Destildalo: el stock vuelve.

## Quién puede editar

- **Compartir** (botón verde arriba a la derecha): agregá solo a la dueña y a KRS como *Editor*.
  "Acceso general" en **Restringido**.
- Para que la planilla sea de la dueña: Compartir → al lado de su nombre → **Transferir propiedad**.
- Si se borra algo sin querer: **Archivo → Historial de versiones**.

## Si algo no anda

- **No aparecen los productos nuevos:** Google tarda hasta 5 minutos en actualizar lo publicado.
- **Si la planilla falla**, la página muestra los productos de `js/productos.js` (no queda en blanco).
- **Cambiaste el script:** hay que volver a **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva → Implementar**. El link `/exec` sigue siendo el mismo.

---

## Menú "Cremita" y columnas nuevas

Después de pegar el script, recargá la planilla (F5): arriba aparece el menú **Cremita**.

1. **Cremita → Preparar planilla**: agrega las columnas **nombre**, **telefono**, **cancelado** y **whatsapp** en Pedidos
   (y saca las columnas ▲ ▼ / ajustar de versiones anteriores). Se puede usar las veces que quieras.
2. **Ajustar stock** en la misma celda de *stock*: escribí `-3` y Enter para restar 3.
   Para sumar, escribí la cuenta: si hay 9 y entraron 5, escribí `9+5` (queda 14).
   Un número solo (`8`) deja el stock en ese número. Nunca baja de 0; abajo a la derecha aparece cómo quedó.
3. **Confirmar un pedido**: tildá *confirmado*. Baja el stock y en *whatsapp* aparece **Avisar confirmación**.
4. **Cancelar un pedido**: tildá *cancelado*. Si estaba confirmado, el stock vuelve; la fila queda tachada
   y en *whatsapp* aparece **Avisar cancelación**. Los links abren el chat del comprador con el mensaje ya escrito; lo mandás vos.
   Mientras el pedido está pendiente, *whatsapp* dice **Escribirle** (abre el chat con un saludo, para consultarle algo antes de confirmar o cancelar).
5. **Si no alcanza el stock** al tildar *confirmado*: no se confirma y el link pasa a **Avisar falta de stock**
   (le dice al cliente qué falta y cuánto hay). Después de hablar con el cliente podés **editar el pedido en *detalle***:
   una línea por producto, `cantidad x nombre` (ej: `1x Collar ajustable M`). Cambiá cantidades, borrá líneas o agregá
   productos (Ctrl+Enter para pasar de línea). Se recalcula el total solo y queda una nota "Editado a mano".
   Después tildá *confirmado* o *cancelado*. Un pedido confirmado no se puede editar: destildalo primero.
6. **Cremita → Borrar pedidos cancelados**: borra las filas tachadas (pregunta antes).
7. **Cremita → Revisar pedidos y stock**: si algún pedido quedó desparejo (por ejemplo, después de clickear muy rápido).

La columna *items* queda oculta (la usa el script). Las columnas se buscan por el **título**, así que se pueden mover de lugar, pero no cambiarles el nombre.
No borres a mano un pedido confirmado que querés cancelar: primero tildá *cancelado* para que vuelva el stock.

---

## Entregados y ganancias

- En **Pedidos** hay una casilla **entregado**. Tildala cuando el pedido ya se entregó (tiene que estar *confirmado*):
  el pedido pasa a la hoja **Entregados** y sale de Pedidos.
- En la hoja **Costos** cargá cuánto te cuesta cada producto (lo que pagás al proveedor, por unidad).
  Esta hoja **no se publica**: los clientes no la ven. Los productos nuevos aparecen solos al usar *Preparar planilla*.
- En **Entregados** se calcula el **costo** y la **ganancia** de cada pedido. Si falta algún costo, queda vacío
  con una notita que dice cuál falta; al cargarlo en *Costos* se completa solo.
- La hoja **Resumen** muestra por mes: pedidos, ventas, costo, ganancia y margen. Se actualiza sola;
  si algo no cuadra, usá **Cremita → Actualizar ganancias**.

