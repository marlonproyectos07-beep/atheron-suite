# Pendientes numerados — Atheron Suite

> Lista maestra. Los vamos cerrando uno a uno.
> Para trabajar en uno, basta con decir el número: *"hagamos el 12"*.
> Última actualización: 20 de agosto de 2026.
>
> **Muchos de estos pendientes ya no se resuelven tocando código:** se resuelven
> desde el panel de edición. Ver [panel-de-edicion.md](panel-de-edicion.md).
>
> **Estado del proyecto y qué no tocar:**
> [CONTINUIDAD-PROYECTO.md](CONTINUIDAD-PROYECTO.md).

---

## Bloque 0 — Antes de publicar el sitio nuevo

> El sitio migrado a Astro y el panel online están terminados y probados, pero
> viven en la rama `astro`. Esto es lo que falta para fusionar a `main`.

| # | Pendiente | Quién |
|---|---|---|
| **0.1** | **Cambiar `public/admin/config.yml` línea 45: `branch: astro` → `branch: main`.** Si se olvida, el panel guardará en una rama que ya no se publica y el sitio no cambiará nunca, **sin ningún error visible** | Claude |
| 0.2 | Rotar el Client Secret de la aplicación OAuth (el anterior pasó por un chat) | Usuario |
| 0.3 | Quitar el texto de prueba `ZIPAQUIRA` del nombre del hospedaje 01, desde el panel | Usuario |
| 0.4 | Activar verificación en dos pasos en GitHub | Usuario |
| 0.5 | Decidir sobre el plan de Vercel (ver el 62) | Usuario |

**Nombre comercial confirmado: "Atheron Suite"** (singular). No usar "Atheron Suites".

**Dominio oficial: `hotelesatheron.com`, sin `www`.** Una sola versión canónica;
`www` redirige permanentemente a ella.

---

## Bloque A — Datos de los hospedajes

Estos solo los tienes tú. Son los que más desbloquean: sin ellos, seis fichas siguen con `noindex`.

| # | Pendiente | Dónde impacta |
|---|---|---|
| 1 | Nombre real de los hospedajes 02 a 07 | Fichas, listado, URLs |
| 2 | Zona o barrio de referencia de cada uno (sin dirección exacta) | Fichas, SEO local |
| 3 | Capacidad de cada casa: personas, habitaciones, camas, baños | Fichas, landing de grupos |
| 4 | Descripción de dos líneas por hospedaje | Listado y fichas |
| 5 | Precio por noche de cada uno | Listado y fichas |
| 6 | Características particulares de cada casa (qué tiene que los otros no) | Fichas |
| 7 | Distancias reales a la Catedral de Sal y a la plaza, por hospedaje | Fichas |
| 8 | Coordenadas de La Magia de Zipaquirá (Google Maps → clic derecho sobre el pin) | Mapa y JSON-LD |

> **Nota sobre el punto 1:** cuando me des los nombres, renombro los archivos de `hospedaje-02.html` a algo como `casa-del-portal.html`. Conviene hacerlo **antes** de que Google los indexe; después obliga a montar redirecciones.

---

## Bloque B — Fotos

Es lo que más falta visualmente. Sin fotos, el diseño se ve incompleto y la conversión cae.

| # | Pendiente | Dónde impacta |
|---|---|---|
| 9 | Foto principal de cada hospedaje (7) | Listado, fichas, Home |
| 10 | 5 fotos de galería por hospedaje | Fichas |
| 11 | Foto de portada del Home (hero) | Home |
| 12 | Foto para la landing de grupos: casa completa o grupo | Landing de grupos |
| 13 | Foto para la sección de historia | Home y artículo del blog |
| 14 | Imagen de 1200×630 px para vista previa al compartir | Todas las páginas |
| 15 | Logo definitivo (hoy el logo es solo texto) | Todo el sitio |

---

## Bloque C — Landing de grupos

Es la página de mayor retorno. Ya respondiste factura y estancia mínima.

| # | Pendiente | Estado |
|---|---|---|
| 16 | ¿Emiten factura electrónica? | ✅ **Resuelto:** sí |
| 17 | Estancia mínima | ✅ **Resuelto:** una noche, sin mínimo |
| 18 | Descuentos por volumen y recurrencia | ✅ **Resuelto:** sí, se estudian por caso |
| 19 | Capacidad del parqueadero: cuántos vehículos, cuántas motos o bicis, si hay espacio cubierto | Pendiente |
| 20 | Capacidad máxima total sumando todas las casas | Pendiente |
| 21 | ¿Hay servicios extra para grupos? (transporte, desayuno, salón de reuniones) | Pendiente |

---

## Bloque D — Contacto e información general

| # | Pendiente | Dónde impacta |
|---|---|---|
| 22 | Correo electrónico oficial | Home, footer, fichas |
| 23 | Horarios de check-in y check-out para el resto de hospedajes | Fichas |
| 24 | Política de mascotas por hospedaje | Fichas y JSON-LD |
| 25 | Formas de pago aceptadas | Preguntas frecuentes |
| 26 | Proceso de reserva definitivo | Preguntas frecuentes |
| 27 | Política de privacidad y términos | Footer (obligatorio si se recogen datos) |

---

## Bloque E — Fuera del sitio web

Aquí está el 32% del peso del posicionamiento local. No es código, pero vale más que el código.

| # | Pendiente | Prioridad |
|---|---|---|
| 28 | **Corregir la ubicación del perfil de Google: aparece en Cogua, debe ser Zipaquirá.** Paso a paso en [corregir-perfil-google.md](corregir-perfil-google.md). **Lo que está mal es el pin del mapa, no la dirección: no toques el texto de la dirección o puedes disparar una reverificación.** | Máxima |
| 29 | Renombrar el perfil de "Atheronsas" a "Atheron Suite" | Alta |
| 30 | Completar el perfil: categoría, horarios, teléfono, enlace al sitio, atributos | Alta |
| 31 | Separar o cerrar el perfil de Atheron Security para que no compita | Media |
| 32 | Unificar el nombre en Booking, Trivago e Instagram | Media |
| 33 | ~~Comprar dominio~~ ✅ `hotelesatheron.com` — **conectado y funcionando** |
| 33.a | ~~Recuperar acceso a Namecheap~~ ✅ Hecho (cuenta `comercialgsc001@gmail.com`) — **falta activar la renovación automática, vence 23/03/2027** |
| 33.b | ~~Recuperar acceso a Cloudflare~~ ✅ Hecho |
| 33.c | Activar renovación automática en Namecheap | Alta |
| 34 | ~~Conectar el dominio a Vercel y actualizar las direcciones del código~~ ✅ **Hecho — el sitio vive en https://hotelesatheron.com** |
| 34.a | Redirigir `atheron1.odoo.com` al dominio nuevo (301) para no competir contigo mismo | Después del 34 |
| 35 | Crear cuenta de Google Search Console y enviar el sitemap | Alta |
| 36 | Pedir reseñas a los huéspedes anteriores | Alta y continua |
| 36.a | Crear cuenta en Metricool (plan gratuito: 1 marca, 50 publicaciones/mes) | Media |
| 36.b | Conectar Google Business Profile a Metricool y programar publicaciones y fotos | Alta — es el 32% del ranking local |
| 36.c | Conectar Instagram, Facebook y TikTok | Media |
| 36.d | Usar códigos en el enlace de la biografía (`?codigo=INSTAGRAM`, `?codigo=TIKTOK`) para medir qué red trae clientes reales | Media |

> **Sobre el orden:** el perfil de Google y las redes **no dependen** de que el sitio esté terminado. Van en paralelo. Como el posicionamiento local tarda de 3 a 6 meses, cada mes de espera es un mes que no empieza a contar.
>
> **Sobre el cuello de botella:** las fotos del punto 9 son las mismas que alimentan el perfil de Google y las redes. Una sola sesión fotográfica que cubra los siete hospedajes resuelve tres frentes a la vez.

---

## Bloque F — Contenido del blog

Un artículo cada 15 días. El orden importa: los primeros son los que más buscan.

| # | Artículo | Estado |
|---|---|---|
| 37 | Cómo nació Atheron Suite | ✅ **Publicado** |
| 38 | Guía de Zipaquirá (página pilar) | Publicada, faltan datos |
| 39 | Completar la tabla de transporte de la guía: duración y costo de bus, carro y tren | Pendiente |
| 40 | Completar horarios, precios y duración del recorrido de la Catedral de Sal | Pendiente |
| 41 | Cómo llegar de Bogotá a Zipaquirá | Por escribir |
| 42 | Catedral de Sal: horarios, precios y qué esperar | Por escribir |
| 43 | Qué hacer en Zipaquirá en un fin de semana | Por escribir |
| 44 | Dónde comer en Zipaquirá | Por escribir |
| 45 | Zipaquirá con niños | Por escribir |
| 46 | Dónde dormir cerca de la Catedral de Sal | Por escribir |

> Los puntos 39 y 40 requieren verificar en fuente oficial. **No inventar horarios ni precios**: los datos falsos hacen más daño que la falta de datos.

---

## Bloque G — Técnico

| # | Pendiente | Cuándo |
|---|---|---|
| 47 | ~~Quitar el `noindex` de cada ficha~~ ✅ **Resuelto por el panel:** es la casilla "Publicado" |
| 48 | ~~Añadir cada ficha al `sitemap.xml`~~ ✅ **Resuelto:** el sitemap se genera solo desde la misma casilla |
| 49 | Quitar la banda amarilla de "versión de trabajo" | Cuando el sitio esté listo. **Ahora es un campo del panel:** se vacía y desaparece |
| 50 | Construir el formulario de contacto real, conectado al flujo comercial/CRM de Atheron | **Los formularios falsos se desactivaron el 21/08/2026** (interruptor en `src/data/ajustes.ts`). Mientras tanto el canal es WhatsApp. Requiere el correo oficial, pendiente 22 |
| 51 | Visor de fotos (lightbox) en las galerías | Cuando haya fotos |
| 52 | Optimizar el peso de las imágenes | **Parcial.** Hay compresión manual (`npm run foto`), aviso a partir de 300 KB y la publicación se detiene por encima de 1 MB. Falta la parte automática, ver el 55 |
| 53 | Página de contacto independiente | Etapa posterior |
| 54 | Página sobre Zipaquirá como destino | Etapa posterior |

### Nacidos de la migración a Astro y del panel

| # | Pendiente | Prioridad |
|---|---|---|
| 55 | **Optimización automática de imágenes al subirlas: compresión y conversión a WebP/AVIF.** Hoy es manual con `npm run foto`. El objetivo es que el administrador no tenga que saber nada de optimización de imágenes | Media. No se hizo antes para no añadir riesgo a la etapa del panel |
| 56 | Migrar los artículos del blog a colección de contenido, para poder editarlos desde el panel | Media |
| 57 | Ajustes generales editables desde el panel: número de WhatsApp, correo, textos del pie | Media |
| 58 | Colores y tipografías editables desde el panel | Baja |
| 59 | ~~Decidir si las fichas en obra deben dejar de tener enlace "Ver ficha"~~ ✅ **Resuelto el 21/08/2026:** las fichas sin publicar desaparecen enteras de la portada y del listado. Ver §21.5 de CONTINUIDAD |
| 60 | `/blog` es la única página del sitio sin botón flotante de WhatsApp. Parece un olvido | Baja |
| 61 | Unificar los menús: el listado muestra 5 enlaces, el blog 3 y la ficha otros 4. Descoordinación heredada | Baja |
| 62 | Vercel: el plan gratuito es para uso **no comercial**. Un sitio de hospedajes lo es. Valorar si conviene pasar al plan de pago antes de que lo revisen ellos | Media — riesgo de suspensión |

---

## Los tres que desbloquean más

Si solo puedes hacer tres cosas esta semana:

1. **El 28** — corregir Cogua → Zipaquirá. Sin esto, nada de lo construido sale en las búsquedas del municipio.
2. **El 9** — una foto principal por hospedaje. Es lo que separa un sitio en obra de uno terminado.
3. **El 1** — los nombres reales, para poder cerrar las URLs antes de que Google indexe.

---

## Material fotográfico que falta (retirado de la interfaz el 8 sep 2026)

Dirección decidió que los rectángulos con el texto «Foto pendiente» no son
aceptables de cara al huésped: le cuentan que la casa no está terminada. Se
retiraron todos. **El material sigue faltando**, y es esto:

| Dónde | Qué falta |
|---|---|
| Portada · sección Zipaquirá | Foto de Zipaquirá o la sabana de Cundinamarca |
| Portada · bloque de experiencias | Fachada o interior representativo |
| Blog · índice | Portada de la guía de Zipaquirá y del artículo de historia |
| Landing de grupos | Zona común o comedor de una casa completa |
| Landing de hospedaje | Zona común o habitación |
| Fichas: La Margarita, Colonial Confort | Fotos que la ficha declara y aún no existen |

Mientras no lleguen, `src/components/Foto.astro` **no pinta nada** si no hay
imagen, y los bloques que quedaban vacíos se retiraron del marcado. En cuanto
se suba la foto desde el panel, aparece sola.

Reglas al reponerlas: nada generado por IA presentado como fotografía real,
nada de fotos de otra propiedad, y ningún render pasando por estado actual.

---

## Pendientes operativos (no son tareas de desarrollo)

| Qué | Estado | Registrado |
|---|---|---|
| Evaluar compra de horno microondas para la Suite 301 | Dirección lo está evaluando. **No existe hoy, no se anuncia** | 9 sep 2026 |

---

## Backlog editorial del blog

Dirección identificó seis temas que **sí** queremos cubrir. Hoy no existe
ninguno, y **no hay ningún enlace apuntando a ellos**: no hay enlaces rotos.
Se escribirán en el sprint de SEO, con información real y verificada, no para
rellenar.

| Tema | Estado |
|---|---|
| Cómo llegar de Bogotá a Zipaquirá | Pendiente |
| Catedral de Sal: horarios, precios y qué esperar | Pendiente — requiere datos actualizados de la fuente oficial |
| Qué hacer en Zipaquirá en un fin de semana | Pendiente |
| Dónde comer en Zipaquirá | Pendiente |
| Zipaquirá con niños | Pendiente |
| Dónde dormir cerca de la Catedral de Sal | Pendiente |

Publicados hoy: **`/blog/guia-de-zipaquira`** y
**`/blog/como-nacio-atheron-suite`**. Nada más.

Regla para cuando se escriban: horarios y precios de terceros se verifican
contra la fuente el día de publicación y se fecha el dato. Un horario
desactualizado en nuestro blog es un huésped que llega y se encuentra cerrado.

---

## Servicios: qué puede decirse de forma global

Comprobado el 9 de septiembre de 2026 contra las cuatro fichas publicadas:

| Servicio | En cuántas fichas | ¿Global? |
|---|---|---|
| Wi-Fi | 4 de 4 | **Sí** |
| Check-in coordinado | 4 de 4 | **Sí** |
| Agua caliente | 3 de 4 | No |
| Cocina | 3 de 4 | No |
| Parqueadero | 3 de 4, y hay propiedades con parqueadero aliado o a confirmar | No |
| Ropa de cama | 2 de 4 | No |
| Netflix | 2 de 4 | No |

Regla fijada por Dirección: **global = solo lo universalmente confirmado**.
Todo lo demás se declara por propiedad, en su ficha.

---

## Bloque S — Abiertos por el sprint UX/CRO/SEO del 9 de septiembre de 2026

> Cada uno sale de una medición o de una comprobación hecha ese día, no de una
> impresión. La evidencia está en el informe de la jornada.

| # | Pendiente | Quién | Evidencia |
|---|---|---|---|
| **S.1** | **Servir la tipografía Fraunces desde nuestro dominio en vez de Google Fonts.** Es el único obstáculo que queda entre el sitio y el 100 de rendimiento en TODAS las rutas, y no es una hipótesis: midiendo con el mismo código y bloqueando solo `fonts.googleapis.com` y `fonts.gstatic.com`, la portada sube de 92-96 a **99**, `/hospedajes` de 87 a **99** y la guía de la Catedral de 93 a **100**, con el CLS de esa página cayendo de 0,029 a **0**. La causa es concreta: el LCP de casi todas las páginas es el `<h1>`, y su *element render delay* es de 1.283 ms esperando 65,8 KB de fuente servidos desde un tercero, con dos conexiones extra (DNS + TLS). Se decide con Marlon porque implica añadir el archivo de la fuente al repositorio y retirar una dependencia de terceros | Marlon decide · Claude ejecuta | Lighthouse 13.4.1, local, sitio construido y servido con gzip |
| S.2 | **Aligerar la imagen del hero de la portada.** 51,5 KB en AVIF a 700 px para el elemento que Lighthouse mide como LCP. Ya está cargada de forma óptima (`fetchpriority=high`, `eager`, descubrible en el documento: las dos auditorías de descubrimiento del LCP puntúan 1), así que lo único que queda es el peso. **Requiere autorización: sobrescribir un activo versionado** | Marlon autoriza | LCP 2,8 s en portada |
| S.3 | **Capacidad de Hotel Atheron Suite (P1 conocido).** Su ficha no declara ninguna cifra de personas en `datos`: las tres que trae son distancia, tiempo y hora de entrada. En el cuerpo sí aparece «hasta 7 huéspedes con las camas fijas» y «de 8 a 10 añadiendo camas», pero eso es texto libre, no un dato estructurado. Por eso la propiedad **no entra** en el total de `/grupos`. No se resuelve suponiendo: se añade la cifra validada a `datos` desde el panel y entra sola | Marlon | `/grupos` publica hoy 58 huéspedes, sin contarla |
| S.4 | **Fotografías legítimas de la Catedral de Sal y del centro histórico.** No hay ninguna en el repositorio: lo único con ese motivo está generado con IA y su registro de procedencia (§8.1 de [fotografias.md](fotografias.md)) prohíbe describirlo como el lugar. Las tarjetas de experiencias y el hero de la guía están diseñados para funcionar **sin** foto; el día que exista una legítima se rellena `foto` en `src/data/experiencias.ts` y entra sola | Marlon | Tarjetas y guía publicadas sin imagen, a propósito |
| S.5 | **Revisar los datos de la Catedral de Sal contra la fuente oficial.** Horario y modalidades comprobados el 9 de septiembre de 2026 en `catedraldesal.gov.co`. Revisar antes de cualquier campaña pagada que apunte a esa página, y como mínimo cada seis meses. Un horario viejo en nuestra guía es un huésped que llega y se encuentra cerrado | Claude | `src/data/catedral-de-sal.ts`, cabecera |
| S.6 | **Testimonios de grupos.** La estructura está hecha y vacía a propósito: no hay ninguno con permiso escrito. Cuando llegue el primero se añade a `testimonios` en `src/data/grupos.ts` y aparece solo. Hasta entonces, únicamente la frase genérica | Marlon | `/grupos`, sección «Grupos que ya hemos recibido» |
| S.7 | **Comprimir `casa-algarra-01-fachada-atardecer.webp`**, que pesa 326 KB y supera el límite recomendado de 300 KB. Lo avisa `npm run comprueba` en cada construcción. **Requiere autorización: sobrescribe un activo versionado** | Marlon autoriza | Aviso del guardián de contenido |
| S.8 | **Convenio con la Catedral de Sal.** Mientras no exista, la guía dice explícitamente que **no** somos operador autorizado, que **no** hay convenio ni descuento y que **no** vendemos entradas individuales. *Actualizado el 10 sep 2026:* por decisión de dirección, para grupos alojados sí se ofrece **gestionar las boletas dentro de la cotización, al valor oficial vigente y sujetas a confirmación**; la misma frase en `/grupos`, en la guía de la Catedral y en el hub. Sin acceso preferencial, filas evitadas ni QR. El día que se firme un convenio, estas frases cambian | Marlon | `src/data/catedral-de-sal.ts`, `loQueNoHacemos` y `loQueHacemosPorUnGrupo` |

### Lo que este sprint dejó cerrado y conviene no volver a romper

- **El destino de WhatsApp va escrito en el HTML**, no lo pone `main.js` al
  cargar. 219 enlaces comprobados en el sitio construido: todos al número
  oficial, todos con mensaje precargado, todos con `target="_blank"` y
  `rel="noopener noreferrer"`. Si alguien vuelve a escribir un `href="#contacto"`
  con `data-whatsapp`, reintroduce la fricción que costó el recorrido de cliente
  del 9 de septiembre.
- **El total de capacidad de `/grupos` se calcula**, no se escribe. Ver las tres
  reglas en `src/data/grupos.ts`.
- **`perteneceA`** en las fichas evita el doble conteo el día que se publiquen a
  la vez el edificio de Algarra y sus apartamentos.

---

## Bloque G — Guía Atheron Zipaquirá (10 de septiembre de 2026)

> Frente 2. El hub `/guia-zipaquira` queda publicado con lo que se pudo
> verificar. Aquí está lo que quedó preparado y esperando dato real.

| # | Pendiente | Quién |
|---|---|---|
| **G.1** | **Canónica: la orden pedía `https://www.hotelesatheron.com/guia-zipaquira/`, con `www` y barra final.** Las dos cosas contradicen lo ya decidido: el dominio oficial es **sin `www`** (bloque 0 de este documento) y `astro.config.mjs` declara `trailingSlash: 'never'`. Se siguió la regla del proyecto —`https://hotelesatheron.com/guia-zipaquira`— porque lo contrario habría metido la única canónica distinta de las otras 28 páginas. **Confirmar que la regla del proyecto sigue siendo la buena** | ChatGPT confirma |
| **G.2** | **Canibalización con `/blog/guia-de-zipaquira`.** Ese artículo ya existía, está indexado y apunta a la misma búsqueda («guía de Zipaquirá»). No se tocó su URL ni su canónica. Se separaron las intenciones: el hub es **descubrimiento** (qué ver, alrededores, itinerario) y el artículo es **logística** (cómo llegar, cuántos días, clima), y se enlazan entre sí con textos distintos. **Vigilar en Search Console si se quitan posiciones**; si ocurre, la salida es un 301 del artículo al hub, que hoy sería prematuro | ChatGPT vigila |
| G.3 | **Sin fotografías del destino.** El hub y la guía de la Catedral no tienen ninguna: la única imagen con ese motivo está generada con IA y su registro (§8.1 de [fotografias.md](fotografias.md)) prohíbe describirla como el lugar. Por eso tampoco llevan `og:image`, y un enlace compartido por WhatsApp sale sin miniatura. Es el mismo pendiente S.4, ahora con una segunda página afectada | Marlon |
| G.4 | **Ningún lugar en `src/data/experiencias-locales.ts`.** La lista está vacía a propósito: no hay ni un restaurante o café con dirección, horario, foto y permiso verificados. Las categorías «Dónde comer» y «Cafés» salen visibles y **no enlazables**. El primer lugar entra con estado `INFORMATIVO` | Marlon aporta datos |
| G.5 | **Bagatela e Indulto: no publicados, y no por olvido.** Hay interés en conversar, pero conversar no es un convenio. Hasta que exista uno firmado no pueden aparecer como aliados, ni con beneficio, ni con porcentaje, ni con Atheron Pass; y hasta tener sus datos verificados y su permiso, tampoco como fichas informativas | Marlon |
| G.6 | **Mina de Sal de Nemocón: sin horario ni tarifa.** El sitio del operador no se pudo leer (verificación anti-bot) y la orden ya advertía de inconsistencias entre fuentes. Se publica qué es y en qué municipio, con enlace a la Alcaldía de Nemocón. **Antes de publicar horario o precio hay que verificarlo contra el operador** | Claude, cuando se pueda |
| G.7 | **Guías profundas de Neusa y Nemocón.** Hoy son tarjetas de descubrimiento dentro del hub. Merecen página propia cuando haya datos suficientes y, sobre todo, fotografías legítimas. La arquitectura ya los trata como `Descubrimiento`, con municipio, fuentes y fecha | Claude |
| G.8 | **Atheron Pass, portal de aliados, atribución y Odoo: nada construido.** Y a propósito: no hay QR, ni códigos, ni redenciones, ni comisiones. El modelo de datos deja el gancho (`codigoPartner`, `beneficio.vigencia`) y el componente **no pinta ningún botón de canje**, porque un botón que promete lo que nadie puede cumplir hace más daño que no tenerlo | Otro frente |

### Lo que este frente dejó cerrado y conviene no romper

- **Una sola URL para la Catedral.** `/zipaquira/catedral-de-sal` sigue siendo
  la única guía; el hub la resume y enlaza, leyendo el resumen de la **misma**
  fuente de datos. No hay dos páginas compitiendo.
- **Los distintivos comerciales se deducen, no se escriben.** «Recomendado por
  Atheron» y «Aliado Atheron» salen del estado de la ficha, igual que
  `ProyectoFoto` deduce el rótulo del tipo de imagen. Sin convenio no hay
  insignia, y sin beneficio el bloque de beneficio **no existe en el DOM**.
- **Cada lugar de los alrededores lleva su municipio en grande.** Es el error
  más caro de una guía: mandar a alguien al municipio equivocado. Casa Neusa
  está en Cogua, y la página lo dice antes del botón, no después.
- **«Zipaquirá» en el menú ya no es un ancla**, es la guía. Se cambió el destino
  de una entrada existente en vez de añadir una octava: mismo recuento, sin
  apretar el móvil y sin duplicar el concepto.

---

## Bloque F3 — Blog y Guía Atheron (10 de septiembre de 2026)

> Frente 3: cierre editorial de `/blog`, `/blog/guia-de-zipaquira`,
> `/guia-zipaquira` y `/zipaquira/catedral-de-sal` (commits `a231243` y
> siguientes, rama `astro`). Aquí queda lo que no se cerró y por qué.

| # | Pendiente | Quién |
|---|---|---|
| **F3.1** | **Revisar «~50 km» antes de volver a publicarlo.** Sigue en `src/pages/index.astro` (tres veces: el dato del hero, el párrafo «A unos 50 km al norte de Bogotá» y la lista «Desde Bogotá · ~50 km»), en `src/pages/landing/hospedaje-en-zipaquira.astro` («Zipaquirá esta a unos 50 km al norte de Bogotá») y en las seis fichas borrador `src/content/hospedajes/hospedaje-02.md` a `hospedaje-07.md` (`valor: ~50 km`). **No se asume que sea distancia lineal ni vial.** Antes de publicarla hay que definir cuatro cosas: **origen** (qué punto de Bogotá: Portal Norte, centro, aeropuerto…), **destino** (centro de Zipaquirá, Catedral, cada hospedaje), **ruta** (qué vía, si es por carretera) y **fuente** (con fecha de consulta). Mientras tanto la guía práctica del blog ya no da la cifra: dice «al norte de Bogotá, en la provincia de Sabana Centro». Por orden de dirección, **las seis fichas borrador no se tocan todavía** | Marlon define origen, destino y ruta · Claude verifica y ejecuta |
| **F3.2** | **Afirmaciones empresariales de «Cómo nació Atheron Suite»**, pendientes de confirmación de Marlon y **sin modificar** hasta entonces: «hoy operamos siete propiedades» (y «siete hospedajes»), «cerca de mil turistas de China», «un grupo mexicano de sesenta personas se quedó diez noches en dos de nuestras casas» y «en estos dos años». *Identificadas por Claude en el texto; confirmar que son las cuatro que dirección tiene señaladas.* El 10 de septiembre solo se corrigieron tildes, sin cambiar ninguna afirmación | Marlon confirma |
| F3.3 | **Agenda del Trail Running (18 de octubre de 2026).** El bloque del hub se oculta solo, pero **la comprobación se hace al construir**: si no hay un despliegue después del 18 de octubre, sigue visible hasta el siguiente. El texto ya no afirma el estado de las inscripciones. El botón «Ver anuncio oficial» lleva a un reel de Instagram, que puede pedir iniciar sesión | Claude, en el primer despliegue tras el 18 oct |
| F3.4 | **Sin `og:image` en las cuatro rutas.** Mismo motivo que G.3 y S.4: no hay una fotografía real y con licencia de Zipaquirá. Un enlace compartido sale sin miniatura | Marlon |

### Lo que este frente dejó cerrado y conviene no romper

- **Tres intenciones, tres páginas.** El hub descubre (qué ver), la Catedral
  tiene la suya (horario y pasaportes) y el blog resuelve (cómo llegar, cuántos
  días, dónde dormir). El artículo se llama «Guía práctica» y resume «qué ver»
  en dos párrafos que enlazan; no se redirige.
- **Datos geográficos con fuente, verificada el 10 sep 2026 y citada a la
  vista y en el JSON-LD** (`src/data/blog.ts`): 2.650 m sobre el nivel del mar,
  según «Nuestro municipio» de la Alcaldía; provincia de Sabana Centro, según la
  publicación institucional «Casa a Casa, así inició estrategia de seguridad en
  Zipaquirá», de la misma Alcaldía. «Nuestro municipio» **no** nombra Sabana
  Centro: por eso cada dato cita su propia página.
- **Los artículos en preparación no llevan enlace** y no repiten intenciones ya
  cubiertas (nada de «Catedral de Sal: horarios y precios»). La lista está en
  `proximosArticulos`, en `src/data/blog.ts`.
- **«Dónde comer» y «Cafés» son una sola tarjeta** en el índice del hub, y la
  sección de gastronomía no se pinta mientras no haya lugares verificados.
