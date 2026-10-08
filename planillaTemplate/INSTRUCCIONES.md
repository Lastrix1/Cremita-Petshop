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
