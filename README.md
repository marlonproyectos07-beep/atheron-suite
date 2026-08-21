# Atheron Suite — Sitio web

Sitio de hospedajes en **Zipaquirá, Cundinamarca**, publicado en
**[hotelesatheron.com](https://hotelesatheron.com)**.

Hecho con **Astro**: el contenido vive en archivos de texto, y de ahí se
generan páginas HTML estáticas. Sin base de datos y sin servidor propio.

> **El contenido se edita desde un panel en el navegador**, no tocando código.
> Ver **[docs/panel-de-edicion.md](docs/panel-de-edicion.md)**.

---

## Cómo ver el sitio en tu computador

Necesitas **Node.js** instalado (versión 24 o superior). Después, en una
terminal dentro de esta carpeta:

```bash
npm install
npm run dev
```

Y abre `http://localhost:4321`.

Si acabas de instalar Node, **abre una terminal nueva**: las que ya tuvieras
abiertas no lo conocen todavía.

---

## Los comandos del proyecto

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el sitio en tu computador para trabajar |
| `npm run build` | Construye el sitio para publicar, en `dist/` |
| `npm run comprueba` | Revisa el contenido sin construir nada |
| `npm run foto` | Comprime y renombra una foto para el sitio |

### `npm run foto`

```bash
npm run foto -- "C:/ruta/a/tu/foto.jpg" sala la-magia-de-zipaquira
```

Reduce a 1600 px, convierte a JPG y guarda en
`public/assets/img/hospedajes/la-magia-de-zipaquira-sala.jpg`.
En la prueba: de 1.095 KB a 102 KB, **un 91% menos** sin diferencia visible.

---

## Cambiar el número de WhatsApp

Está en **un solo lugar**: la primera línea de
[public/assets/js/main.js](public/assets/js/main.js).

```js
var WHATSAPP_NUMERO = "573188983167";   // ← cámbialo aquí
```

Formato internacional, **sin `+` y sin espacios**. Colombia es `57`.

Con ese cambio se actualizan todos los botones del sitio a la vez. Cada botón
lleva su propio mensaje, así el cliente no tiene que explicar cuál hospedaje le
gustó: el mensaje ya llega escrito.

### Códigos promocionales y de referido

Se comparte un enlace con el código dentro:

```
hotelesatheron.com/?codigo=CICLISTAS
hotelesatheron.com/hospedajes?codigo=JUANP
```

El código se guarda mientras dure la visita y se añade automáticamente a
**todos** los mensajes de WhatsApp del sitio. Tú recibes el mensaje con el
código dentro y ya sabes quién te lo mandó, sin ningún sistema de seguimiento.

---

## Estructura del proyecto

```
/
├── src/
│   ├── pages/                    Una carpeta = una dirección del sitio
│   │   ├── index.astro                       →  /
│   │   ├── hospedajes/index.astro            →  /hospedajes
│   │   ├── hospedajes/[slug].astro           →  UNA plantilla, 7 fichas
│   │   ├── blog/                             →  /blog y sus artículos
│   │   ├── landing/                          →  las dos landings
│   │   └── sitemap.xml.ts                    →  el mapa del sitio, generado
│   │
│   ├── content/hospedajes/       LOS DATOS de los 7 hospedajes.
│   │                             Esto es lo que edita el panel.
│   ├── content.config.ts         Qué campos tiene un hospedaje
│   │
│   ├── layouts/Base.astro        El <head> de TODAS las páginas
│   ├── components/               Cabecera, pie, botones, fotos
│   └── data/navegacion.ts        Todos los menús del sitio
│
├── public/                       Se copia tal cual al sitio publicado
│   ├── admin/                    EL PANEL DE EDICIÓN
│   ├── assets/css/               Los 3 archivos de estilo
│   ├── assets/js/main.js         WhatsApp, códigos, menú móvil
│   ├── assets/img/hospedajes/    Las fotos
│   └── robots.txt
│
├── scripts/
│   ├── comprueba-contenido.mjs   Se ejecuta ANTES de cada publicación
│   └── optimiza-fotos.mjs        `npm run foto`
│
├── docs/                         Estrategia, pendientes y guías
├── astro.config.mjs              Configuración del sitio
└── vercel.json                   Publicación y redirecciones
```

### Por qué esta estructura

Antes, cada página era un archivo HTML completo. La cabecera estaba escrita a
mano **16 veces** y las seis fichas de hospedaje eran 2.496 líneas para
almacenar seis números distintos.

Ahora cada cosa vive en un solo sitio:

| Si quieres cambiar... | Tocas |
|---|---|
| Un dato de un hospedaje | El panel (o `src/content/hospedajes/`) |
| Un enlace del menú | `src/data/navegacion.ts` |
| Algo del `<head>` de todas las páginas | `src/layouts/Base.astro` |
| Un color o una tipografía | `public/assets/css/base.css` |

---

## Publicación

```
editas → git commit → git push → Vercel republica
```

Cada `push` a la rama `main` genera un despliegue nuevo en menos de un minuto.
Si algo sale mal, en el panel de Vercel puedes volver a un despliegue anterior
con un clic.

**Antes de publicar se ejecuta sola una comprobación** del contenido
(`scripts/comprueba-contenido.mjs`). Si encuentra un problema, **detiene la
publicación y el sitio anterior sigue en pie.** Hoy revisa dos cosas:

1. **Texto cortado por YAML.** Una almohadilla precedida de espacio empieza un
   comentario, así que `zona: Cra. 9 #10-32` se leía como `"Cra. 9"` y el resto
   desaparecía sin ningún aviso. Nos pasó de verdad. La solución es escribir el
   valor entre comillas, y el script señala la línea exacta.
2. **Fotos.** Que existan, y que no pesen de más. Avisa por encima de 300 KB y
   detiene la publicación por encima de 1 MB.

---

## Direcciones del sitio

**El dominio oficial es `hotelesatheron.com`, sin `www`.**
`www.hotelesatheron.com` redirige permanentemente a él. Hay **una sola versión
canónica**, y es la que aparece en las canónicas, en el sitemap y en el
`robots.txt`.

`vercel.json` activa **cleanUrls**: las direcciones se ven sin la extensión.
También contiene las redirecciones permanentes de las dos plantillas que se
retiraron del sitio.

Las direcciones no cambiaron al migrar a Astro: `build.format: 'preserve'` en
`astro.config.mjs` genera los archivos exactamente con la misma forma que
tenían antes. **No toques esa opción.**

---

## Contenido provisional

Todo lo que no es un dato real va **marcado en amarillo**, para que sea
imposible publicarlo por error creyendo que era definitivo:

- En el panel, las casillas **"Provisional"** junto a cada campo
- En el código, `<span class="pendiente">texto</span>`
- Las fichas sin publicar salen en amarillo solas en el listado

**Buscar todo lo pendiente:** busca en el proyecto la palabra `pendiente`, o
mira [docs/pendientes.md](docs/pendientes.md).

---

## Cómo añadir un hospedaje nuevo

**Desde el panel:** pulsa "Nuevo hospedaje" y rellena los campos. La dirección
del sitio sale del nombre que le pongas.

**Desde el código:** copia un archivo de `src/content/hospedajes/`, renómbralo
(minúsculas, sin tildes, con guiones) y cambia los datos. El nombre del archivo
manda la dirección: `casa-del-portal.md` se publica en
`/hospedajes/casa-del-portal`.

En los dos casos, el listado, la portada, el mapa del sitio y los enlaces se
actualizan solos.

---

## Convenciones de código

- **Todo en español**: clases, comentarios y nombres de archivo.
- **Nombres de clase estilo BUEM**: `bloque`, `bloque__elemento`,
  `bloque--variante`. Ejemplo: `.tarjeta`, `.tarjeta__titulo`, `.boton--primario`.
- **Móvil primero**: el CSS se escribe para celular y luego se amplía con
  `@media (min-width: ...)`.
- **Los atributos `data-*`** son los ganchos del JavaScript. Nunca uses una
  clase de estilo para seleccionar algo desde JS: si cambia el diseño, se rompe.
- **Nunca escribas un color a mano** (`#0f172a`). Usa la variable
  (`var(--color-noche)`).
- **Los comentarios van entre llaves**, no como comentario de HTML. Los de HTML
  se envían al navegador y cualquiera los lee con "ver código fuente"; los
  nuestros incluyen notas internas que no deben viajar.
