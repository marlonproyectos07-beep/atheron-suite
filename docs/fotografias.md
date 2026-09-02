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
