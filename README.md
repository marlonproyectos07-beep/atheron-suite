# Atheron Suite — Sitio web

Proyecto web de práctica: sitio de hospedajes en **Zipaquirá, Cundinamarca**.
Hecho con **HTML, CSS y JavaScript puros** — sin frameworks, sin servidor, sin base de datos.

---

## Cómo ver el sitio

Abre `index.html` con doble clic en el navegador. Ya funciona.

Recomendado si usas VS Code: instala la extensión **Live Server** y da clic derecho
sobre `index.html` → *Open with Live Server*. Así la página se recarga sola al guardar.

---

## Cambiar el número de WhatsApp

Está en **un solo lugar**: la primera línea de [assets/js/main.js](assets/js/main.js).

```js
var WHATSAPP_NUMERO = "573000000000";   // ← cámbialo aquí
```

Formato internacional, **sin `+` y sin espacios**. Colombia es `57`, así que un
número como `300 123 4567` se escribe `573001234567`.

Con ese cambio se actualizan todos los botones del sitio a la vez. Cada botón lleva
su propio mensaje en el atributo `data-whatsapp`, así el cliente no tiene que
explicar cuál hospedaje le gustó: el mensaje ya llega escrito.

---

## Publicación (Vercel)

El sitio se publica solo. El flujo es:

```
editas un archivo  →  git add / git commit  →  git push  →  Vercel republica
```

Cada `push` a la rama `main` genera un despliegue nuevo en unos segundos.
Si algo sale mal, en el panel de Vercel puedes volver a un despliegue anterior.

`vercel.json` activa **cleanUrls**: las direcciones se ven sin la extensión.
`/landing/hospedaje-en-zipaquira.html` se publica como `/landing/hospedaje-en-zipaquira`.
Los enlaces internos siguen funcionando igual: Vercel redirige automáticamente.

Comandos del día a día:

```bash
git add -A
git commit -m "Describe aquí el cambio"
git push
```

---

## Estructura de carpetas

```
/
├── index.html                          Home (página principal)
│
├── landing/
│   └── hospedaje-en-zipaquira.html     Landing comercial (objetivo: captar contactos)
│
├── hospedajes/
│   ├── index.html                      Listado de los 7 hospedajes
│   └── plantilla-hospedaje.html        Plantilla para crear cada ficha individual
│
├── robots.txt                          Permisos de rastreo para buscadores
├── sitemap.xml                         Lista de páginas para Google
├── vercel.json                         Configuración del despliegue
│
├── docs/
│   └── estrategia-seo.md               Plan de posicionamiento y contenido
│
├── assets/
│   ├── css/
│   │   ├── base.css                    Variables, reset, tipografía, utilidades
│   │   ├── componentes.css             Header, botones, tarjetas, formularios, footer
│   │   └── paginas.css                 Hero, galería, ubicación, experiencias...
│   ├── js/
│   │   └── main.js                     Menú móvil, animaciones, formulario
│   └── img/
│       └── hospedajes/                 Aquí van las fotos reales
│
└── README.md                           Este archivo
```

### Por qué el CSS está en 3 archivos

| Archivo | Contiene | Cuándo lo tocas |
|---|---|---|
| `base.css` | Colores, tipografías, espacios (variables) | Al cambiar la identidad visual |
| `componentes.css` | Piezas que se repiten (botón, tarjeta) | Al crear o ajustar una pieza |
| `paginas.css` | Secciones concretas (hero, galería) | Al diseñar una sección nueva |

**Regla de oro:** nunca escribas un color "a mano" (`#0f172a`). Usa la variable
(`var(--color-noche)`). Así cambias el color una vez y se actualiza todo el sitio.

---

## Contenido provisional

Todavía no tenemos los datos reales de los 7 hospedajes. Para que sea imposible
publicar algo inventado por error, el contenido temporal está **marcado en amarillo**:

- `<span class="pendiente">texto</span>` → texto provisional (fondo amarillo)
- `<div class="placeholder">` → foto que falta (rectángulo rayado)
- `[[TEXTO ENTRE CORCHETES]]` → campo por llenar en la plantilla
- La banda amarilla superior (`.aviso-borrador`) se borra cuando el sitio esté listo

**Buscar todo lo pendiente:** busca en el proyecto la palabra `pendiente`.

---

## Cómo agregar un hospedaje nuevo

1. Copia `hospedajes/plantilla-hospedaje.html`.
2. Renómbralo con el nombre del hospedaje: `casa-del-portal.html`
   (minúsculas, sin tildes, con guiones — así queda una URL limpia).
3. Reemplaza todo lo que esté entre `[[ ]]`.
4. Pon las fotos en `assets/img/hospedajes/` y cambia los `.placeholder` por `<img>`.
5. En `hospedajes/index.html`, actualiza la tarjeta correspondiente y su enlace `href`.

---

## Datos que faltan para avanzar

- [ ] Nombre, sector y descripción de cada uno de los 7 hospedajes
- [ ] Número de habitaciones, camas, baños y capacidad
- [ ] Precios por noche y política de estancia mínima
- [ ] Fotos de cada hospedaje
- [ ] Correo y teléfono de contacto oficiales
- [ ] Dirección o coordenadas de cada hospedaje (para el mapa)
- [ ] Horarios de check-in / check-out, política de mascotas y de pagos
- [ ] Logo definitivo (hoy el logo es solo texto)

---

## Siguientes etapas del curso

Ya hecho en la etapa 1:

- [x] Estructura del proyecto
- [x] Diseño base (variables, componentes)
- [x] Home
- [x] Landing comercial de Zipaquirá
- [x] Estructura preparada para los 7 hospedajes

Por hacer más adelante:

- [ ] Página propia para cada uno de los 7 hospedajes
- [ ] Página de contacto independiente
- [ ] Página sobre Zipaquirá (contenido del destino)
- [ ] Galería con visor de fotos (lightbox)
- [ ] Envío real del formulario
- [ ] Optimización de imágenes y SEO
- [ ] Publicación del sitio en internet

---

## Convenciones de código

- **Todo en español**: clases, comentarios y nombres de archivo.
- **Nombres de clase estilo BUEM**: `bloque`, `bloque__elemento`, `bloque--variante`.
  Ejemplo: `.tarjeta`, `.tarjeta__titulo`, `.boton--primario`.
- **Móvil primero**: el CSS se escribe para celular y luego se amplía con
  `@media (min-width: ...)`.
- **Los atributos `data-*`** (como `data-menu-movil`) son los ganchos del JavaScript.
  Nunca uses una clase de estilo para seleccionar algo desde JS: si cambia el diseño,
  se rompe el código.
