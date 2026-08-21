# Propuesta: multiidioma, video y superficies públicas

> **Documento de análisis, no de implementación.** Escrito el 21 de agosto de 2026.
> Nada de lo que aquí se propone está construido. Requiere aprobación explícita
> antes de tocar código.
>
> Decisiones estratégicas registradas por el usuario en esta sesión:
> soporte multiidioma (ES / EN / ZH), video por hospedaje, y trabajo de marca
> con logo que el usuario entregará. El logo **no se implementa** hasta recibir
> el archivo aprobado.

---

## Resumen en una página

| Tema | Recomendación corta |
|---|---|
| **Idiomas** | Prefijo de ruta `/en/`, `/zh/`. Español en la raíz, sin prefijo. Sin redirección automática nunca |
| **Fuente maestra** | Español. Declarado en el esquema y verificado por script |
| **CMS** | i18n nativo de Sveltia con `structure: multiple_folders`. Campos neutros marcados `i18n: duplicate` |
| **Puerta de calidad** | Un idioma no se indexa hasta que su traducción está marcada como revisada. Mismo patrón que la casilla `publicado` |
| **Video** | Fachada (*facade*): miniatura local + botón. El iframe de YouTube **solo** se crea al pulsar |
| **Transcripción** | Texto real en la página, no solo subtítulos. Junto al título, la descripción y el HTML estructurado, es la fuente textual fiable para SEO, GSEO, accesibilidad y sistemas de IA |
| **China** | Selección de proveedor **por idioma**, no por geolocalización. Mantiene el sitio estático |
| **Orden** | Fusionar lo actual a `main` primero. Después video. Después inglés. Después chino |

---

## A. Arquitectura recomendada para idiomas

### A.1 Direcciones

```
ESPAÑOL (maestro)   hotelesatheron.com/
                    hotelesatheron.com/hospedajes
                    hotelesatheron.com/hospedajes/la-magia-de-zipaquira

INGLÉS              hotelesatheron.com/en
                    hotelesatheron.com/en/hospedajes
                    hotelesatheron.com/en/hospedajes/la-magia-de-zipaquira

CHINO SIMPLIFICADO  hotelesatheron.com/zh
                    hotelesatheron.com/zh/hospedajes
                    hotelesatheron.com/zh/hospedajes/la-magia-de-zipaquira
```

**Tres decisiones dentro de esto:**

1. **El español no lleva prefijo.** Las 14 direcciones actuales **no se mueven ni
   una letra**. Los idiomas son direcciones nuevas que se suman. Esto es
   innegociable: mover las actuales tiraría el posicionamiento ya ganado.

2. **Un solo dominio, subcarpetas.** No subdominios (`en.hotelesatheron.com`) ni
   dominios por país. Las subcarpetas concentran toda la autoridad del dominio en
   un solo sitio, que es lo correcto cuando se parte de cero en autoridad.

3. **Los *slugs* NO se traducen en la etapa 1.** `/en/hospedajes/la-magia-de-zipaquira`,
   no `/en/stays/the-magic-of-zipaquira`. Razón: el nombre propio del hospedaje no
   se traduce de todos modos, y mantener el mismo *slug* hace que el `hreflang` sea
   trivial de generar y de verificar. Traducir *slugs* se puede añadir después sin
   rehacer nada, pero añade una tabla de equivalencias que hay que mantener a mano.

### A.2 Cómo se generan esas páginas sin triplicar el código

Restricción heredada que **no se toca**: `build.format: 'preserve'` y
`trailingSlash: 'never'`. Las direcciones salen de la forma de los archivos.

La forma ingenua sería duplicar las 9 páginas por idioma: 27 archivos que hay que
mantener sincronizados a mano. Inaceptable.

**Propuesta:** el cuerpo de cada página pasa a ser un componente que recibe el
idioma, y los archivos de página quedan como envoltorios de tres líneas.

```
src/paginas/Home.astro                  ← el marcado real, una sola vez
src/pages/index.astro                   ← <Home lang="es" />
src/pages/en/index.astro                ← <Home lang="en" />
src/pages/zh/index.astro                ← <Home lang="zh" />
```

Ventajas: una sola fuente de marcado, direcciones explícitas y visibles en el
árbol de archivos, `format: 'preserve'` intacto, y cero magia de enrutado que
alguien pueda romper sin darse cuenta. Es coherente con la filosofía del proyecto,
que ya rechazó `@astrojs/sitemap` por el mismo motivo.

Se descarta la alternativa (`src/pages/[...lang]/index.astro` con `getStaticPaths`)
porque las direcciones dejan de leerse en el árbol de archivos y porque la
interacción con `format: 'preserve'` es justo el tipo de detalle que se rompe en
silencio.

### A.3 Textos de interfaz

Los textos que no son contenido —botones, menú, pie, etiquetas, mensajes de
WhatsApp— viven en diccionarios:

```
src/i18n/es.ts    src/i18n/en.ts    src/i18n/zh.ts
```

Se resuelven **en tiempo de construcción**. Cero JavaScript adicional en el
navegador por tener tres idiomas.

El texto del mensaje de WhatsApp también se traduce: un huésped chino que abre
WhatsApp con un mensaje redactado en español no escribe, se va.

### A.4 Detección de idioma — el punto delicado

**Regla dura: ninguna redirección automática por idioma. Nunca.**

Redirigir según `Accept-Language` rompe el rastreo de Google (que rastrea casi
siempre desde Estados Unidos y con `Accept-Language` genérico), y atrapa al
usuario que quiere ver otra versión.

**Lo que sí se hace:**

| Pieza | Comportamiento |
|---|---|
| **Selector de idioma** | Visible siempre, en cabecera y pie. Enlaza a la **misma página** en el otro idioma, nunca a la portada |
| **Aviso sugerido** | Si `navigator.language` no coincide con el idioma de la página, aparece una franja discreta: *"View this page in English"*. Se puede cerrar. La elección se recuerda en `localStorage` |
| **Sin secuestro** | El aviso propone, no redirige. El usuario sigue viendo la página que pidió |

Detalle de rendimiento que importa: ese aviso se pinta **fijo abajo**
(`position: fixed`), no empujando el contenido. Si empujara, provocaría
desplazamiento de diseño (CLS) y penalizaría Core Web Vitals justo en la métrica
más frágil. El script son ~1 KB en línea, en la misma línea que la decisión ya
tomada de cargar `main.js` con `is:inline`.

### A.5 Señales para buscadores

En `src/layouts/Base.astro`, que ya es **el único sitio donde vive el `<head>`**:

```html
<link rel="canonical" href="https://hotelesatheron.com/en/hospedajes/la-magia-de-zipaquira">
<link rel="alternate" hreflang="es-CO" href="https://hotelesatheron.com/hospedajes/la-magia-de-zipaquira">
<link rel="alternate" hreflang="en"    href="https://hotelesatheron.com/en/hospedajes/la-magia-de-zipaquira">
<link rel="alternate" hreflang="zh-Hans" href="https://hotelesatheron.com/zh/hospedajes/la-magia-de-zipaquira">
<link rel="alternate" hreflang="x-default" href="https://hotelesatheron.com/hospedajes/la-magia-de-zipaquira">
```

Reglas que hay que cumplir o el `hreflang` se ignora entero:

- **Canónica apuntando a sí misma**, por idioma. Jamás cruzada entre idiomas.
- **Reciprocidad total**: cada versión declara a todas, **incluida ella misma**.
- **`x-default` → español**, por ser el maestro y el mercado principal.
- `<html lang="es|en|zh-Hans">` correcto en cada página.
- Solo se declaran idiomas **realmente publicados** (ver A.6).

**Sitemap.** Se conserva `src/pages/sitemap.xml.ts` y la dirección
`/sitemap.xml` exacta. Cambia el contenido: cada `<url>` incorpora sus
`<xhtml:link rel="alternate" hreflang="…">`. Un solo sitemap, no uno por idioma.

**JSON-LD.** Se traducen `name`, `description`, `amenityFeature` y textos
equivalentes. **No se traducen** la dirección postal, el nombre de la marca ni el
teléfono: la coherencia del NAP (nombre, dirección, teléfono) entre todos los
idiomas y el perfil de Google es más valiosa que la traducción. Se añade
`inLanguage` en `WebPage`.

### A.6 La puerta de calidad — la pieza más importante de todo esto

Publicar traducción automática sin revisar es una forma eficaz de que Google
degrade el dominio entero por contenido de baja calidad. Y el daño no se queda en
esa página: castiga a todo el sitio.

**Propuesta: replicar el mecanismo que ya funciona.** El proyecto ya resolvió el
problema equivalente con la casilla `publicado`, que apaga `noindex` y el sitemap
a la vez desde un solo interruptor.

```
publicadoEn:
  es: true      ← maestro, siempre
  en: false     ← hasta que la traducción esté revisada
  zh: false
```

Efecto de que un idioma esté apagado:

- Su página **se construye igualmente** (se puede revisar y enseñar)
- Lleva `noindex`
- **No aparece en el sitemap**
- **No aparece en el `hreflang`** de las demás
- **No aparece en el selector de idioma**

Así el sitio nunca queda a medio traducir de cara a Google, y el trabajo se puede
ir haciendo idioma por idioma y página por página sin prisa.

---

## B. Arquitectura recomendada para video

### B.1 El patrón fachada

Un `<iframe>` de YouTube cuesta entre **1 y 1,4 MB** y unas 8-10 peticiones a
terceros **antes de que nadie pulse Play**. En móvil con datos, en una ficha de
hospedaje, eso es inaceptable — y hunde Core Web Vitals.

`loading="lazy"` en el iframe **no resuelve el problema**: solo lo retrasa hasta
que el bloque entra en pantalla, y entonces cobra el peso completo aunque el
visitante nunca vaya a ver el video.

**La fachada carga cero bytes de terceros hasta que hay un clic:**

```
Miniatura local optimizada (WebP/AVIF, ~60-90 KB)
        +
<button> "Ver recorrido"  ← botón real, no un div
        │
   el usuario pulsa
        ▼
Se inyecta el <iframe> de youtube-nocookie.com con autoplay=1
```

### B.2 Detalles que hacen que funcione bien

| Aspecto | Decisión |
|---|---|
| **CLS** | El contenedor reserva `aspect-ratio: 16 / 9` desde el primer pintado. Cero desplazamiento al insertar el iframe |
| **LCP** | La miniatura es candidata a elemento LCP en la ficha. Si está sobre el pliegue: `fetchpriority="high"`. Si no: `loading="lazy"` |
| **INP** | Al pulsar solo se crea un nodo. Sin librerías, sin *framework* |
| **Conexión** | `<link rel="preconnect">` a YouTube inyectado en `pointerenter`/`focus`, no en la carga. Acelera el clic sin costar nada a quien no lo pulsa |
| **Accesibilidad** | `<button>` real, alcanzable por teclado, con `aria-label` descriptivo (*"Ver recorrido en video de La Magia de Zipaquirá"*). El foco pasa al reproductor tras cargar. La miniatura lleva `alt` |
| **Privacidad** | `youtube-nocookie.com`. Y como la fachada no contacta con YouTube hasta el clic, **quien no pulsa no genera ninguna petición a terceros**. Relevante para el visitante europeo y para banners de consentimiento |
| **Datos** | El visitante que no ve el video paga ~70 KB en vez de ~1,2 MB |
| **Peso propio** | ~1 KB de JavaScript en línea. Sin dependencias externas |

### B.3 SEO y GSEO del video

**El video en sí no posiciona en el sitio.** Lo que posiciona es el texto que lo
acompaña. Dos piezas:

1. **`VideoObject` en JSON-LD**: `name`, `description`, `thumbnailUrl`,
   `uploadDate`, `duration`, `embedUrl`, `inLanguage`. Habilita el resultado
   enriquecido de video en Google.

2. **La transcripción como texto real en la página**, dentro de un `<details>`
   plegable. La transcripción, el título, la descripción y el HTML estructurado son, en
   nuestra arquitectura, la fuente textual fiable. Una transcripción con datos concretos
   —distancias, servicios, qué se ve en cada habitación— es exactamente el
   material que hace que un sitio sea citado en una respuesta generada.

### B.4 Subtítulos y doblaje

- Los subtítulos se suben **a YouTube como pistas revisadas** (`.vtt`), una por
  idioma. **No se usan los automáticos** para información comercial: traducen mal
  precios, nombres propios y condiciones.
- El embebido recibe `cc_load_policy=1` y `cc_lang_pref=<idioma de la página>`.
- **Doblaje / pistas de audio adicionales**: es una función del lado de YouTube
  (*multi-language audio*). No requiere ningún cambio en esta arquitectura: se
  añaden las pistas al video y aparecen solas. Nada que construir ahora.

### B.5 China — arquitectura preparada, sin implementar

YouTube está bloqueado en China continental. Un visitante desde allí vería un
recuadro vacío.

**Propuesta: elegir el proveedor por idioma, no por geolocalización.**

```
videoProveedor:     youtube          ← usado en /es y /en
videoId:            xxxxxxxxxxx

videoProveedorZh:   (vacío)          ← cuando exista: bilibili | tencent | bunny
videoIdZh:          (vacío)
```

La página `/zh/…` usa el proveedor alternativo **si está definido**; si no, cae al
principal. El componente `Video.astro` decide con un `switch`.

Por qué así y no por país: detectar el país exige lógica en el borde (*edge*), lo
que convertiría un sitio estático en uno dinámico, con coste, complejidad y una
nueva superficie de fallo. La aproximación por idioma es una heurística imperfecta
—hay chinos que navegan en inglés— pero cuesta cero y resuelve el 90% del caso.

**No se implementa ahora.** Solo se dejan los campos previstos para que añadirlo
después no obligue a rehacer nada.

---

## C. Estructura de datos y CMS

### C.1 El problema a evitar

49 campos × 3 idiomas = 147 campos por hospedaje. Hecho a lo bruto, el panel se
vuelve inadministrable y los datos se desincronizan: el precio cambia en español
y se queda viejo en inglés.

### C.2 La solución: separar dato neutro de texto traducible

Sveltia CMS trae i18n nativo, y es la pieza que resuelve esto sin construir nada
a medida.

```yaml
i18n:
  structure: multiple_folders     # src/content/hospedajes/{es,en,zh}/slug.md
  locales: [es, en, zh]
  default_locale: es
```

Y después, **campo por campo**:

| Marca | Significado | Ejemplos |
|---|---|---|
| `i18n: duplicate` | Se escribe una vez y se copia idéntico a los tres idiomas | precio, latitud, longitud, check-in, mascotas, orden, `direccionPublica`, rutas de las fotos, `videoId` |
| `i18n: true` | Se traduce | nombre, título, descripción, presentación, características, experiencias, `alt` de cada foto, transcripción |
| `i18n: false` | Solo existe en el maestro | notas internas de trabajo |

En el panel esto se ve como **columnas de idioma lado a lado**: se traduce mirando
el original, que es como se traduce bien. Y los campos neutros aparecen una sola
vez.

### C.3 Campos nuevos propuestos

**Video** (todos neutros salvo los tres últimos):

```
videoActivo          booleano       interruptor maestro
videoProveedor       lista          youtube (por ahora, único valor)
videoId              texto          el identificador, no la URL completa
videoMiniatura       imagen         local y optimizada. Si falta, no se muestra el bloque
videoDuracion        texto          formato ISO 8601 (PT3M40S) para el JSON-LD
videoFecha           fecha          uploadDate del JSON-LD

videoMiniaturaAlt    texto     ← traducible
videoTitulo          texto     ← traducible
videoDescripcion     texto     ← traducible
videoTranscripcion   markdown  ← traducible
```

**Nota sobre `videoId` en vez de la URL completa:** evita que se pegue una URL con
parámetros de seguimiento, y hace imposible que alguien pegue un enlace de otro
sitio por error.

**Nota sobre `videoMiniatura` local:** se puede tirar de la miniatura de YouTube
(`i.ytimg.com`), pero eso reintroduce una petición a terceros en la carga inicial
—justo lo que la fachada evita— y en China no cargaría. Miniatura local, y pasa
por `npm run foto` como todo lo demás.

**Idiomas:**

```
publicadoEn          objeto     { es: true, en: false, zh: false }
traduccionRevisadaEn objeto     { en: false, zh: false }   quién y cuándo, opcional
```

### C.4 Lo que hay que probar antes de comprometerse

**El punto de fricción real:** los campos de lista con subcampos mixtos. La
galería es una lista de `{ imagen, alt }` donde `imagen` es neutra y `alt` se
traduce. El i18n por subcampo dentro de listas es la parte menos madura de
Sveltia.

**Recomendación: construir un prototipo de una sola colección y un solo idioma
antes de migrar las siete fichas.** Si las listas no se comportan, el plan B es
separar `galeriaAlt` como lista paralela traducible — más feo, pero funciona.

### C.5 Verificación automática

`scripts/comprueba-contenido.mjs` ya detiene la publicación ante contenido roto.
Se amplía con:

- Los campos neutros **coinciden** entre los tres idiomas (detecta la deriva)
- El `hreflang` es **recíproco** en todas las páginas
- Ningún idioma marcado como publicado tiene campos traducibles vacíos
- Ninguna miniatura de video supera el peso máximo
- Ninguna ficha publicada incumple el **mínimo publicable** (ver §F.1)

---

## D. Impacto sobre SEO y GSEO

### Lo favorable

- **De 8 a 24 páginas indexables.** Triplicar la superficie de entrada, en
  mercados sin competencia local en esos idiomas. En Zipaquirá, hospedaje descrito
  en chino simplificado es, con casi total seguridad, terreno vacío.
- **Las transcripciones de video** son contenido denso y concreto: el tipo de
  material que los asistentes de IA citan.
- **`inLanguage` y `hreflang`** correctos ayudan a que cada versión aparezca ante
  la audiencia correcta en vez de competir entre ellas.

### Lo peligroso

| Riesgo | Consecuencia | Mitigación |
|---|---|---|
| Traducción automática publicada | Degradación del dominio **entero**, no solo de la página | La puerta `publicadoEn` de §A.6 |
| `hreflang` no recíproco | Google ignora **todas** las señales de idioma | Verificación automática en el script |
| Canónica cruzada entre idiomas | Se desindexan las versiones traducidas | Canónica siempre a sí misma |
| Redirección por `Accept-Language` | Google rastrea solo una versión | Prohibida por diseño |
| Traducir la dirección postal | Incoherencia con el perfil de Google | El NAP no se traduce |

### El contexto que no conviene perder de vista

El pendiente 28 —**el perfil de Google ubica el negocio en Cogua, no en
Zipaquirá**— sigue abierto. Mientras siga así, el trabajo local no rinde. Tres
idiomas sobre un perfil mal ubicado siguen siendo tres idiomas mal ubicados. **El
multiidioma no sustituye a arreglar eso; lo amplifica cuando esté arreglado.**

---

## E. Impacto sobre rendimiento

| Cambio | Efecto |
|---|---|
| 24 páginas en vez de 8 | Construcción de ~2,5 s a ~5 s. Irrelevante |
| Diccionarios de idioma | **0 KB** en el navegador: se resuelven al construir |
| Aviso de idioma sugerido | ~1 KB en línea, `position: fixed`, sin CLS |
| Selector de idioma | HTML puro, sin JavaScript |
| **Video con fachada** | **−1,1 MB** y ~9 peticiones a terceros menos por visita que no pulsa Play |
| Miniatura de video | +60-90 KB por ficha con video |
| Fuentes chinas | **0 KB si se usa la pila del sistema** |

**Sobre las fuentes chinas — importa mucho.** Una tipografía web para chino
simplificado pesa entre 2 y 10 MB porque necesita miles de glifos. Cargarla
destruiría el rendimiento móvil de la versión que más lo necesita. **Se usa la
pila del sistema**, que en chino se ve perfectamente bien:

```css
font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

**Balance neto: la propuesta hace el sitio más rápido, no más lento**, porque el
ahorro de la fachada de video supera con mucho todo lo demás sumado.

---

## F. Riesgos

**Ordenados por lo que costaría arreglarlos.**

1. **Migrar los 7 archivos de contenido a `hospedajes/es/` mueve archivos.** Es el
   momento de mayor riesgo: si un *slug* cambia, cambia una dirección publicada.
   Va en un commit propio, aislado, con verificación de las 14 direcciones antes y
   después.
2. **`build.format: 'preserve'` con rutas anidadas por idioma** no está probado en
   este proyecto. Hay que verificarlo con una página de prueba antes de migrar
   nada.
3. **Coste real de traducción profesional.** 8 páginas × 2 idiomas. No es una
   decisión técnica sino de presupuesto, y determina el calendario.
4. **El i18n de Sveltia en listas con subcampos** (§C.4). Prototipo antes de
   comprometerse.
5. **Deriva entre idiomas** con el tiempo. Mitigado por campos neutros compartidos
   y por el script de comprobación.
6. **Que alguien añada una redirección por idioma** "para mejorar la experiencia".
   Queda anotado en la lista de §14 de *Continuidad* como prohibición.
7. **El permiso `repo` del CMS** sigue alcanzando todos los repositorios. Sin
   cambios respecto a hoy, pero más superficie de contenido editable.
8. **La rama `astro` crece demasiado** si se acumula todo esto antes de fusionar.
   Ver §G.

---

## G. Qué haría ahora y qué dejaría para después

### Etapa 0 — antes que nada

**Fusionar a `main` lo que ya está terminado y probado.**

Acumular multiidioma y video sobre una rama que lleva desde el 20 de agosto sin
fusionar convierte un merge limpio y verificado en uno grande y arriesgado. Lo
construido ya funciona, está auditado y aporta valor hoy. **Fusionar primero,
construir después.** (Sigue esperando autorización explícita: aquí no se hace
nada.)

### Etapa 1 — sin depender de idiomas

| Qué | Por qué ahora |
|---|---|
| Categoría B: ocultar bloques sin dato | Ya está decidido el criterio. Solo falta ejecutarlo |
| Mínimo publicable y ocultar hospedajes 02-07 | Lo que más daña hoy la impresión comercial |
| **Video con fachada, solo en español** | Autocontenido, no depende del i18n, y es la mayor ganancia de rendimiento disponible |
| Campos de video en el CMS | Se pueden ir rellenando mientras se decide lo demás |

### Etapa 2 — inglés

Esqueleto completo de i18n (envoltorios, diccionarios, selector, aviso, `hreflang`,
canónicas, sitemap, puerta `publicadoEn`) **con un solo idioma añadido: inglés.**

Hacerlo con un idioma antes que con dos permite descubrir los problemas con la
mitad del trabajo perdido si algo hay que rehacer.

### Etapa 3 — chino

Chino simplificado, pila de fuentes del sistema, transcripciones y subtítulos
revisados, y campos de proveedor alternativo de video (**sin implementar el
proveedor**).

### Etapa 4 — marca

Logo e identidad visual, **cuando el usuario entregue el archivo aprobado**:
cabecera de escritorio y móvil, favicon, Open Graph (pendiente 14, hoy sin
imagen), pie, y variantes sobre fondo claro y oscuro.

### Explícitamente fuera de alcance por ahora

Doblaje, proveedor de video para China, traducción de *slugs*, cuarto idioma,
auditoría comercial por perfil de turista.

---

## H. Qué necesito de ti

### Para poder avanzar ya

1. **Datos reales de La Magia de Zipaquirá**: precio, y de cada
   habitación/apartamento — nombre, huéspedes, camas, baños y descripción.
2. **La tercera experiencia** de la ficha.
3. **Decisión sobre los hospedajes 02-07**: ocultarlos hasta tener datos, o qué
   hacer con ellos mientras tanto.
4. **Decisión sobre los formularios de contacto** (ver la nota al final).

### Para el video

5. **¿El canal de YouTube es propio de Atheron Suite?** Los videos deben estar en
   un canal controlado por el negocio, no en uno personal ni de un tercero.
6. **Identificadores de los videos** que ya existan, si hay alguno.
7. **Miniaturas**, o autorización para extraer un fotograma del propio video.
8. **Transcripciones**: ¿las escribes tú, o transcribo yo del audio y tú revisas?
   El texto comercial debe pasar por tu revisión en cualquier caso.

### Para los idiomas

9. **Quién traduce.** Traductor profesional, agencia, o alguien de confianza
   bilingüe. Determina calendario y coste. **Yo no publico traducción automática
   sin revisión humana**, por lo explicado en §D.
10. **Confirmación de que el español es el idioma maestro.**
11. **¿WhatsApp sigue siendo el canal para el visitante chino?** En China
    continental WhatsApp está bloqueado y el canal real es WeChat. Afecta a qué
    botón se muestra en `/zh/`.
12. **¿Traducir los *slugs* o no?** Mi recomendación es que no, en la etapa 1.

### Para la marca

13. **El archivo del logo aprobado**, preferiblemente en SVG, con las variantes
    para fondo claro y oscuro. **No lo diseño ni lo modifico.**

---

## I. Cómo encaja sin romper lo construido

| Pieza actual | Qué le pasa |
|---|---|
| Las **14 direcciones** publicadas | **No se mueve ninguna.** Los idiomas son direcciones nuevas |
| `build.format: 'preserve'` | Intacto. La propuesta se construye encima, no en contra |
| `trailingSlash: 'never'` | Intacto |
| `/sitemap.xml` propio | **Se conserva la dirección exacta.** Solo cambia el contenido |
| `src/layouts/Base.astro` | Sigue siendo el único `<head>`. `hreflang` y canónicas salen de ahí, en un solo sitio |
| La casilla `publicado` | Se extiende a `publicadoEn` por idioma. Mismo patrón, ya entendido |
| `scripts/comprueba-contenido.mjs` | Se amplía con las verificaciones de §C.5. Sigue deteniendo la publicación |
| Las landings sin menú | **Se mantiene la decisión.** El selector de idioma no es un menú |
| `main.js` con `is:inline` | Mismo criterio para el script de video y el aviso de idioma |
| El panel en `/admin` | Misma dirección, misma autenticación. Gana columnas de idioma |
| Cloudflare, OAuth, dominio, DNS | **No se tocan.** Nada de esto los afecta |

**Lo único que se mueve de sitio son los 7 archivos de contenido**, que pasan a
`src/content/hospedajes/es/`. Los *slugs* y por tanto las direcciones se conservan.
Ese commit va aislado y verificado.

---

## Nota aparte: los formularios de contacto

Detectado durante la limpieza del 21 de agosto, y **no resuelto**.

Las cuatro páginas con formulario responden al enviar:

> *"Gracias, recibimos tu mensaje. (Demostracion: todavia no se envia a ningun
> servidor.)"*

El formulario **no envía nada a ninguna parte**. Se eliminó la nota técnica que lo
advertía —era texto interno, categoría A— pero el mensaje de respuesta sigue en
`public/assets/js/main.js` y le dice al visitante que su mensaje fue recibido
cuando no lo fue.

**Esto pierde clientes reales y no es cosmético.** Tres salidas posibles:

| Opción | Qué implica |
|---|---|
| **Ocultar los formularios** *(recomendada)* | Queda WhatsApp, que es el canal que sí funciona. Coherente con la regla de ocultar en vez de fingir. Reversible en una línea |
| Conectarlos a un servicio de envío real | Cierra el pendiente 50. Requiere elegir servicio y tener el correo oficial (pendiente 22) |
| Dejarlos como están | No recomendable: promete algo que no ocurre |

**Requiere tu decisión.** No se ha tocado.
