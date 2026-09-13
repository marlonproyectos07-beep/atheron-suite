# Fotografías: nombres, recortes y pesos

> Escrito el 21 de agosto de 2026, al preparar la recepción del paquete
> fotográfico de la **Suite 301 de La Magia de Zipaquirá**.
>
> Objetivo: que las fotos lleguen ya clasificadas y con el nombre correcto, para
> subirlas sin decidir nada sobre la marcha.

---

## 1. Lo primero: no renombres a mano

Hay una herramienta que **comprime y nombra en el mismo paso**:

```bash
npm run foto -- "C:/ruta/de/la/foto.jpg" 301-principal la-magia-de-zipaquira
```

Deja el archivo en `public/assets/img/hospedajes/` y **te imprime en pantalla la
dirección exacta** que hay que pegar en el panel. No hay que escribir rutas.

Lo que hace: reduce a 1600 px de ancho, convierte a JPEG de calidad 82, respeta la
orientación de la cámara y muestra cuánto pesaba antes y después.

> Recordatorio de por qué existe: la primera foto que se subió al panel era una
> captura de 1.095 KB. Multiplicada por 5 fotos y 7 hospedajes: 38 MB que el
> visitante descarga en móvil con datos.

---

## 2. Convención de nombres

```
<slug-del-hospedaje>-<habitacion>-<contenido>[-<n>].jpg
```

Para la Suite 301:

```
la-magia-de-zipaquira-301-principal.jpg
la-magia-de-zipaquira-301-camas.jpg
la-magia-de-zipaquira-301-sala.jpg
la-magia-de-zipaquira-301-cocina.jpg
la-magia-de-zipaquira-301-bano.jpg
la-magia-de-zipaquira-301-vista.jpg
```

**Por qué el slug completo y no `la-magia-301`:** el slug es el mismo identificador
del archivo de contenido (`src/content/hospedajes/la-magia-de-zipaquira.md`) y de
la dirección pública (`/hospedajes/la-magia-de-zipaquira`). Con siete hospedajes en
la misma carpeta, ese nombre dice sin ambigüedad a qué ficha pertenece cada foto.
Además es exactamente lo que `npm run foto` genera solo: no hay que recordar nada.

El nombre es largo, pero **nunca se escribe a mano**: lo imprime la herramienta.

**Reglas:**

| Regla | Motivo |
|---|---|
| Todo en minúsculas, sin tildes ni eñes | Evita problemas entre Windows, Linux y el navegador |
| Palabras separadas por guion, nunca por espacio ni guion bajo | Convención web, y Google lee el guion como separador |
| Sin fechas ni números de cámara (`DSC_0421`) | El nombre debe decir qué se ve, no cuándo se disparó |
| Si hay varias del mismo tipo, sufijo numérico: `-camas-2` | Ordena solo |
| Para fotos del hospedaje sin habitación concreta, se omite el tramo de habitación: `la-magia-de-zipaquira-fachada.jpg` | Ya existe así `…-sala.jpg` |

**Formato: `.jpg` por ahora.** WebP pesaría un 25-30 % menos, pero la herramienta
actual produce JPEG. Migrar a WebP/AVIF es el pendiente 55, y cuando se haga
bastará regenerar los archivos: las direcciones viven en el contenido, no en el
código.

---

## 3. Orden recomendado de la galería

El orden **no es decorativo**: la primera foto ocupa el doble de espacio en el
mosaico de escritorio y es la que más pesa en la decisión.

| # | Contenido | Por qué en esa posición |
|---|---|---|
| 1 | **Principal** — el plano más amplio y atractivo | Ocupa el doble en el mosaico. Es la que vende |
| 2 | **Camas / dormitorio** | Es lo primero que un huésped quiere confirmar |
| 3 | **Sala / zona común** | Da la sensación de espacio real |
| 4 | **Cocina** | En La Magia es un argumento de venta: permite quedarse varios días |
| 5 | **Baño** | Se busca siempre, y su ausencia genera desconfianza |
| 6 | **Vista / entorno** | Cierra con el contexto: montaña, calle, fachada |

**Cinco o seis por habitación es el punto justo.** Menos deja dudas; más no
mejora la conversión y sí el peso de la página.

---

## 4. Recortes: dónde se corta cada foto

Esto es lo que más sorpresas da. Cada sitio del diseño recorta a una proporción
distinta, con `object-fit: cover` — es decir, **recorta, no deforma**.

| Sitio | Proporción | Consecuencia al encuadrar |
|---|---|---|
| **Foto principal de la ficha** | **3:4 vertical** | Una foto horizontal pierde los laterales. Encuadra con margen o entrega una vertical |
| **Galería** | **1:1 cuadrado** | Se recorta arriba y abajo. Deja aire alrededor del motivo |
| **Foto de tarjeta** (portada y listado) | **4:3 horizontal** | La más "normal". Es la que ve un cliente antes de entrar |
| **Foto dentro de una habitación** | **4:3 horizontal** | Igual que la tarjeta |
| Bloques anchos de sección | 16:9 | Panorámicas |

**Regla práctica: deja siempre aire alrededor del motivo.** Una cama que toca los
bordes de la foto original quedará cortada en el cuadrado de la galería.

---

## 5. Pesos y dimensiones

El sistema tiene dos umbrales, ya activos en `scripts/comprueba-contenido.mjs`:

- **Aviso a partir de 300 KB** — sigue publicando, pero deja constancia
- **Detiene la publicación por encima de 1 MB** — el daño en móvil ya es real

Dentro de eso, los objetivos recomendados:

| Uso | Ancho | Peso objetivo | Tope |
|---|---|---|---|
| **Foto principal de la ficha** | 1600 px | ≤ 200 KB | 300 KB |
| **Foto de tarjeta** | 1200 px | ≤ 120 KB | 300 KB |
| **Cada foto de galería** | 1600 px | ≤ 150 KB | 300 KB |
| **Foto de habitación** | 1600 px | ≤ 150 KB | 300 KB |

`npm run foto` deja las fotos dentro de estos números sin tocar nada.

**Presupuesto por ficha:** una habitación con 6 fotos de galería ronda los 900 KB.
Es asumible. Dos habitaciones con galería propia y fotos sin comprimir se van a
varios megas, y ahí se pierde al visitante en móvil.

---

## 6. Textos alternativos (ALT)

**No son opcionales.** El esquema exige `alt` en cada foto de galería, y el
componente `Foto` avisa por consola si falta.

Es lo que lee Google y lo que oye quien usa lector de pantalla. También es lo
único que describe la imagen a un sistema que no puede verla.

| Mal | Bien |
|---|---|
| `foto1` | `Cama king de la Suite 301 con mesas de noche y lámparas` |
| `habitacion` | `Baño de la Suite 301 con ducha y lavamanos` |
| `la magia de zipaquira hospedaje zipaquira catedral de sal` | `Sala de la Suite 301 con sofá, televisor y ventana a la montaña` |

**Una frase, describiendo lo que se ve.** Sin repetir palabras clave: eso ya no
funciona y se detecta.

---

## 7. Qué entregar para la Suite 301

**Datos:**

| Campo | Formato | Ejemplo de forma |
|---|---|---|
| Nombre comercial | texto | *Suite 301* |
| Capacidad máxima | texto | *4* |
| Camas | texto libre — **admite el tipo** | *1 cama king y 1 sofá cama* |
| Baños | texto | *1* |
| Descripción corta | una o dos frases | — |
| Precio por noche | texto con formato de moneda | *$ 000.000* |

**Fotos:** las seis del apartado 3, ya procesadas con `npm run foto`, más el texto
ALT de cada una.

**Dónde van, en el panel:** dentro de la propia habitación hay un apartado
**Galería de la habitación** (imagen + texto alternativo, tantas como quieras).
Es opcional: una habitación sin fotos se sigue viendo igual, solo que sin ese
bloque.

> **No confundir con la galería del hospedaje**, que está más abajo en el mismo
> formulario y se mantiene aparte a propósito: esa es para **zonas comunes,
> fachada y entorno**, no para una habitación concreta.

**Nada de esto se inventa.** Mientras un dato no llegue, su bloque permanece
oculto: es la regla fijada el 21 de agosto y está descrita en §21.9 de
[CONTINUIDAD-PROYECTO.md](CONTINUIDAD-PROYECTO.md).

> **Sobre imágenes generadas:** decisión del usuario, registrada aquí para que no
> se pierda. **No se usan fotografías generadas por IA.** La edición permitida
> conserva arquitectura, tamaño aparente de los espacios, muebles, número y tipo
> de camas, ventanas, baños, acabados y distribución. Se puede mejorar
> iluminación, exposición, balance de blancos, perspectiva, ruido, nitidez, color
> y pequeñas distracciones visuales. El resultado debe parecer una fotografía
> hotelera profesional **del mismo lugar**, nunca un render.

---

## 8. Registro de procedencia de activos visuales

Aquí queda constancia de cada imagen del sitio cuyo origen **no** sea una
fotografía tomada del lugar. La lista existe para que nadie tenga que
deducirlo mirando el archivo: los ficheros llegan sin EXIF, sin XMP y sin
C2PA, así que la procedencia no se puede comprobar desde el repositorio.
Si no está escrita, se pierde.

### 8.1 Hero de la portada

| | |
|---|---|
| **Archivo** | `public/assets/img/portada/zipaquira-centro-historico-atardecer-*.{avif,webp}` |
| **Procedencia** | Activo visual generado con inteligencia artificial para Atheron. Recreación visual conceptual de Zipaquirá. **No constituye fotografía documental del lugar.** |
| **Aprobado por** | Marlon, sobre el commit `c42d78f`, el 8 de septiembre de 2026 |
| **Alcance** | Prueba en la rama `astro`. **No autorizado para producción todavía.** |
| **Cómo se presenta** | Imagen decorativa: `alt` vacío y `aria-hidden`. No se describe en ningún texto visible, ni en `alt`, ni en Open Graph, ni en JSON-LD. |

**Lo que no se puede hacer con este activo**, y es el motivo de que el registro
exista: no se describe en público como fotografía real, ni como toma real de
dron, ni se le atribuye autoría fotográfica. Si algún día se le pone pie de
foto, texto alternativo o mención en redes, tiene que decir lo que es.

### 8.2 Video de fondo del hero

| | |
|---|---|
| **Archivo** | `public/assets/video/portada/zipaquira-plaza-dron.{webm,mp4}` |
| **Procedencia** | Recreación audiovisual generada con inteligencia artificial a partir de un activo visual conceptual de Zipaquirá. **No constituye grabación documental ni toma real de dron.** |
| **Herramienta** | Higgsfield |
| **Aprobado por** | Marlon, el 8 de septiembre de 2026 |
| **Alcance** | Prueba en la rama `astro`. **No autorizado para producción todavía.** |
| **Cómo se presenta** | Fondo decorativo: `aria-hidden`, sin controles, sin pista de audio en el archivo, fuera del orden de tabulación. No se describe en ningún texto visible. |

Se descartó un segundo material generado con Gemini: perdía el encuadre aprobado a
los tres segundos y llevaba la marca de agua del generador visible sobre el
empedrado.

Vale aquí lo mismo que para la imagen, y con más motivo: **el movimiento refuerza
la lectura de metraje real** mucho más que una fotografía fija. No se describe como
grabación real, ni como toma de dron, ni se le atribuye autoría.

### 8.3 Relación con la regla del apartado 7

El apartado 7 registra una decisión que sigue vigente: **no se usan fotografías
generadas por IA**. Esa regla habla de las **fichas de hospedaje**, donde una
imagen generada engañaría sobre lo que el huésped va a encontrarse: el tamaño de
la habitación, las camas, el baño, los acabados.

El hero de la portada es un caso distinto y una **excepción explícita**: no
muestra ningún alojamiento, no promete nada verificable sobre una estancia y
funciona como fondo del titular. Aun así es una excepción, no una puerta abierta:
está aquí escrita, con fecha y con quien la aprobó, igual que la de las siete
imágenes de la Suite 301 recogida en §23.1 de
[CONTINUIDAD-PROYECTO.md](CONTINUIDAD-PROYECTO.md).

Toda excepción nueva se registra en este apartado antes de entrar en el sitio.

---

### 8.3 Recompresión del hero de portada (9 de septiembre de 2026)

Autorizada por Dirección como pendiente S.2. **La imagen no cambia**: es la
misma fotografía, sin añadir ni quitar nada, sin tocar arquitectura ni
mobiliario. Solo cambia cómo está comprimida.

| Archivo | Antes | Después | |
|---|---|---|---|
| `…-700.avif` | 51,3 KB | **42,8 KB** | −16 % |
| `…-700.webp` | 73,1 KB | **58,4 KB** | −20 % |
| `…-1600.avif` | 197,9 KB | **180,1 KB** | −9 % |
| `…-1600.webp` | 286,2 KB | 286,2 KB | **sin tocar** |

**El 1600.webp no se toca, y es deliberado:** es el archivo con más
información del repositorio y la fuente de las otras tres conversiones.
Recomprimirlo sería perder el original. Ningún ajuste probado lo mejoraba.

#### Cómo se decidió que no hay degradación

No a ojo. Cada candidato se comparó por **SSIM** contra una referencia de
máxima fidelidad —el propio 1600.webp reducido con Lanczos— y el criterio
de aceptación fue estricto:

> se elige el ajuste **más ligero** cuyo SSIM sea **igual o mejor** que el
> del archivo que ya estaba publicado. Si ninguno lo consigue, no se toca.

Resultado: los cuatro archivos puntúan **igual o mejor** que antes, y tres
pesan menos.

| Archivo | SSIM antes | SSIM después |
|---|---|---|
| `…-700.avif` | 0,95914 | **0,96024** |
| `…-700.webp` | 0,96886 | **0,97302** |
| `…-1600.avif` | 0,97172 | **0,97560** |
| `…-1600.webp` | 1,00000 | 1,00000 |

> **Trampa ya pagada, para quien repita esto.** El primer intento midió el
> archivo publicado con un `.resize()` y un `.toBuffer()` de más, que lo
> vuelven a codificar y le añaden pérdida que el candidato no tenía. Con
> esa medida, ajustes que en realidad empeoraban la imagen parecían
> mejorarla, y se llegó a escribir en disco una versión peor. **Los dos
> lados de la comparación tienen que decodificarse exactamente igual:**
> a gris en crudo, sin reescalar y sin recodificar.

#### Parámetros exactos, para poder reproducirlo

Fuente: `…-1600.webp`. Reducción `lanczos3`.

```
700.avif    sharp.avif({ quality: 58, effort: 9, chromaSubsampling: '4:4:4' })
700.webp    sharp.webp({ quality: 78, effort: 6 })
1600.avif   sharp.avif({ quality: 58, effort: 9, chromaSubsampling: '4:4:4' })
```

`chromaSubsampling: '4:4:4'` conserva el color a plena resolución. En un
atardecer con degradados amplios, el 4:2:0 por defecto es justo lo que se
nota.

**El original anterior sigue disponible** en el historial, en `ee3c6aa`:

```bash
git show ee3c6aa:public/assets/img/portada/zipaquira-centro-historico-atardecer-700.avif > /tmp/original.avif
```

---

### 8.4 Tipografía Fraunces servida desde nuestro dominio

Desde el 9 de septiembre de 2026 la tipografía de titulares ya no se pide a
Google Fonts: vive en `public/assets/fuentes/`. Procedencia, licencia
(SIL Open Font License 1.1), alcance del subconjunto y procedimiento de
actualización, en
[`public/assets/fuentes/PROCEDENCIA.md`](../public/assets/fuentes/PROCEDENCIA.md).
