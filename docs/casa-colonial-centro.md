# Casa Colonial Centro by Atheron

> Documentación interna del proyecto. No se publica en el sitio.
> Última actualización: 4 de septiembre de 2026.
>
> **Estado: borrador privado.** La página existe, no está publicada y no debe
> publicarse sin aprobación escrita. Ver §18, *Gates de publicación*.

---

## 1. Objetivo

Presentar Casa Colonial Centro como un **proyecto en desarrollo** de Atheron: la
historia del inmueble, su recuperación, el estado actual, la visión de
transformación, las cuatro unidades proyectadas (hotel, restaurante, cafetería y
restaurante gastrobar), el modelo de integración de Atheron, la búsqueda de
aliados y la futura bitácora.

**Lo que la página no es:** no es una oferta de inversión, no pide dinero, no
promete rentabilidad y no declara ningún servicio como existente.

---

## 2. Ruta

`/proyectos/casa-colonial-centro`

No existe una página índice en `/proyectos`. La miga de pan muestra ese escalón
**como texto no enlazado**, a propósito: crear una página pública vacía solo para
que la miga tenga a dónde apuntar sería peor que dejar el escalón sin enlace.

**Decisión tomada:** la página índice `/proyectos` se evaluará antes de la
publicación pública o cuando exista un portafolio suficiente de proyectos.

---

## 3. Estado

| Elemento | Estado |
|---|---|
| Estructura de las diez secciones | Hecho |
| Textos de dirección (apartados 15–25 de la instrucción) | Integrados |
| Fotografías | **Ninguna.** Huecos reservados |
| Textos jurídicos (contrato, opción de compra) | Fuera de la página, pendientes de abogados |
| Bitácora | Estructura lista, sin entradas |
| Publicación | **No.** noindex, nofollow, fuera del sitemap, sin enlaces |

---

## 4. Rama

`claude/casa-colonial-centro-estructura-p24amq`

Sale de `main`, que es la rama viva del sitio desde la migración a Astro. No se
fusiona, no se publica y no se toca `main` ni `astro`.

*Nota:* la instrucción pedía `claude/casa-colonial-centro-estructura`. El entorno
de ejecución en la nube impone el sufijo `-p24amq` y no permite crear la rama sin
él.

---

## 5. Fuentes autorizadas

- La instrucción maestra del proyecto y su continuación (apartados 1–41).
- Los archivos que Marlon y ChatGPT aprueben expresamente más adelante.
- Carpeta privada de Google Drive aprobada por Marlon y administrada fuera del
  repositorio. Su contenido entra **solo** a través del manifiesto aprobado.

El identificador de esa carpeta **no se escribe en el repositorio**, ni siquiera
en esta documentación: permanece únicamente en el canal interno entre Marlon y
ChatGPT (ver §16).

## 6. Fuentes prohibidas

- Atheron Suite / La Magia de Zipaquirá.
- Casa Algarra.
- Casa Neusa.
- Hotel Colonial Confort — **ojo con el nombre parecido: no es este proyecto.**
- Habitaciones 201, 202, 203, 301 y 302 de otras propiedades.
- La segunda carpeta de nombre similar, que mezcla varias propiedades.
- Bancos de imágenes y cualquier imagen externa.

---

## 7. Reglas fotográficas

1. **Ninguna foto entra sin manifiesto aprobado.** Una imagen con
   `aprobada: false` no se pinta, aunque el archivo exista.
2. **La fachada no se usa** en ningún sitio: ni hero, ni galería, ni Open Graph,
   ni tarjetas, ni blog, ni miniaturas, ni datos estructurados.
3. Las fotografías reales admiten ajustes de exposición, iluminación, balance de
   blancos, color, contraste, nitidez, perspectiva, encuadre y compresión.
   **No** admiten añadir mobiliario, quitar elementos estructurales, cambiar
   puertas o ventanas, inventar acabados, cambiar la distribución, añadir
   personas ni modificar la vista real.
4. La dirección exacta no se publica. La ubicación se comunica como
   «En el corazón de Zipaquirá».

### 8. Diferencia entre imagen real y conceptual

| | Real (`REAL` / `OBRA`) | Conceptual (`CONCEPTUAL`) |
|---|---|---|
| Qué es | Fotografía del inmueble | Imagen generada |
| Dónde puede salir | Galería «La casa hoy», hero, comparador | **Solo** en el comparador |
| Rótulo | «Fotografías reales del estado actual y del proceso de recuperación» | «Representación conceptual», siempre, sobre la propia imagen |
| Aviso al pie | — | «No corresponde al estado actual» + «El diseño, mobiliario, distribución y acabados pueden cambiar durante el desarrollo del proyecto» |

El componente `ProyectoGaleria` **descarta automáticamente** cualquier imagen
conceptual que se cuele en la galería de fotografías reales, y avisa por consola
al construir. Los rótulos de las conceptuales no son opcionales ni configurables.

---

## 9. Secciones implementadas

| # | Sección | ID | Estado del contenido |
|---|---|---|---|
| 1 | Hero | — | Verificado. Foto pendiente |
| 2 | Historia | `#historia` | Pendiente de revisión jurídica |
| 3 | La casa hoy | `#estado-actual` | Verificado. Galería vacía |
| 4 | Transformación | `#transformacion` | Propuesta. Sin espacios cargados |
| 5 | Cuatro experiencias | `#unidades` | Propuesta |
| 6 | Modelo Atheron | `#modelo-atheron` | Verificado |
| 7 | Alianzas | `#alianzas` | Verificado |
| 8 | Bitácora | `#bitacora` | Pendiente. Sin entradas |
| 9 | Aviso informativo | `#aviso` | Verificado. Texto exacto |
| 10 | Cierre | `#contacto` | Verificado |

**Archivos:**

- `src/pages/proyectos/casa-colonial-centro.astro` — la maqueta.
- `src/data/casa-colonial-centro.ts` — **todo** el contenido y los modelos.
- `src/components/ProyectoEstado.astro` — distintivo VERIFICADO / PENDIENTE / PROPUESTA.
- `src/components/ProyectoGaleria.astro` — galería de fotografía real.
- `src/components/ProyectoComparador.astro` — comparador de tres estados.
- `src/components/ProyectoUnidad.astro` — tarjeta de unidad.
- `src/components/AvisoInformativo.astro` — el aviso legal.
- `public/assets/css/proyecto-casa-colonial.css` — estilos, solo de esta página.

`src/layouts/Base.astro` ganó dos opciones **aditivas** que no cambian ninguna
página existente: `seguirEnlaces` (para `noindex, nofollow`) y `hojasExtra` (para
incrustar una hoja de estilo solo en la página que la pide).

---

## 10. CTAs

| Sección | Botón | Destino |
|---|---|---|
| Hero | Conocer el proyecto | `#historia` |
| Hero | Ver la transformación | `#transformacion` |
| Hero | Quiero ser aliado estratégico | `#alianzas` |
| Unidades | Conocer la visión… (×4) | Despliega el detalle en la propia tarjeta |
| Alianzas | Quiero operar una unidad | WhatsApp |
| Alianzas | Quiero aportar al proyecto | WhatsApp |
| Alianzas | Solicitar información preliminar | WhatsApp |
| Bitácora | Seguir la transformación | `#bitacora` (hasta que exista la categoría del blog) |
| Cierre | Seguir la transformación | `#bitacora` |
| Cierre | Proponer una alianza | `#alianzas` |
| Cierre | Hablar con Atheron | WhatsApp |

Ningún botón pide dinero, monto disponible, patrimonio, ingresos, datos
bancarios, número de identificación ni compromiso económico. No hay formularios,
pasarelas de pago, checkout, transferencias ni simuladores de retorno.

## 11. Mensajes de WhatsApp

El número **no se escribe en esta página**. Vive en `public/assets/js/main.js`,
que construye todos los enlaces del sitio, con el respaldo de
`src/data/ajustes.ts` por si el guion no carga. Los mensajes están en
`src/data/casa-colonial-centro.ts`:

| Origen | Mensaje |
|---|---|
| General (cabecera, cierre, botón flotante) | «Hola, Atheron. Conocí el proyecto Casa Colonial Centro y quisiera recibir más información.» |
| Aliado operador | «…quisiera conversar sobre la posibilidad de operar una de sus unidades gastronómicas.» |
| Aliado estratégico o técnico | «…quisiera presentar una propuesta como aliado, proveedor o colaborador del proyecto.» |
| Componente hotelero | «…quisiera recibir información preliminar sobre el componente hotelero cuando esté disponible.» |

## 12. Eventos analíticos

**El repositorio no tiene ninguna plataforma de analítica instalada** — ni Google
Analytics, ni Tag Manager, ni Plausible, ni la de Vercel. Se comprobó antes de
escribir esto, y no se instaló ninguna.

Lo que hay es el evento **declarado en el HTML**, en el atributo `data-evento` de
cada botón. El día que se conecte una plataforma, **un solo** escucha delegado en
`main.js` lee ese atributo y envía el evento: ni se duplican escuchas ni hay que
volver a tocar esta página. Los eventos no llevan información personal.

**Plataforma de analítica pendiente de decisión. Los nombres de eventos ya están
definidos.** No se instaló Google Analytics, Meta Pixel, Vercel Analytics, Tag
Manager ni ninguna otra.

Mientras no haya plataforma, los eventos son **inertes**: `data-evento` es un
atributo del HTML, sin escuchas, sin variables globales simuladas, sin peticiones
y sin dependencias nuevas. La auditoría de consola de Lighthouse lo confirma: el
único mensaje es el de la tipografía bloqueada por este entorno.

Los doce declarados: `ccc_hero_conocer_click`, `ccc_transformacion_click`,
`ccc_aliado_operador_click`, `ccc_aliado_estrategico_click`,
`ccc_informacion_hotel_click`, `ccc_proponer_alianza_click`,
`ccc_whatsapp_click`, `ccc_bitacora_click`, `ccc_unidad_hotel_click`,
`ccc_unidad_restaurante_click`, `ccc_unidad_cafeteria_click`,
`ccc_unidad_gastrobar_click`.

---

## 13. SEO

- **Title:** `Casa Colonial Centro | Proyecto Atheron en Zipaquirá`
- **Meta description:** «Conoce la recuperación de Casa Colonial Centro, un
  proyecto de Atheron que integrará hotel, restaurante, cafetería y restaurante
  gastrobar en el corazón de Zipaquirá.»
- **Canónica:** la construye `Base.astro` con el dominio de `astro.config.mjs`.
  El dominio no se escribe a mano en ningún sitio.
- **Open Graph:** sin imagen. Las candidatas serían la fachada (prohibida), una
  conceptual (no puede ir sin rótulo, y una vista previa no admite rótulos) o una
  foto de otra propiedad (prohibida). Campo preparado en `seo.imagen`, pendiente
  de la fotografía interior real aprobada.
- **Datos estructurados:** solo `WebPage`, `Organization` y `BreadcrumbList`. No
  se usan `Hotel`, `LodgingBusiness`, `Restaurant`, `BarOrPub`,
  `FoodEstablishment`, `Offer`, `Product`, `AggregateRating`, `Review`,
  `PriceSpecification`, `Event` ni `OpeningHoursSpecification`: describirían
  servicios que todavía no existen.

## 14. Noindex

`noindex, nofollow`, vía `indexable={false}` y `seguirEnlaces={false}` en
`Base.astro`. Verificado sobre el HTML construido.

## 15. Sitemap

La ruta **no está** en `src/pages/sitemap.xml.ts`, y hay un comentario en ese
archivo explicando por qué: pedirle a Google que visite una página a la que se le
está diciendo que no la indexe es contradictorio.

Tampoco hay ningún enlace entrante desde el resto del sitio. Verificado sobre las
18 páginas construidas.

---

## 16. Privacidad

No se publican, ni en la página ni en el repositorio: cédulas, firmas, poderes,
contratos, nombres de propietarios, dirección exacta, matrícula inmobiliaria,
datos bancarios, presupuestos, datos de terceros, metadatos GPS de fotografías ni
información de Planeación o del Ministerio que no esté aprobada.

**El identificador de la carpeta de Drive no está en este archivo, y así se
queda.** Decisión de dirección del 4 de septiembre de 2026: el identificador
permanece únicamente en el canal interno entre Marlon y ChatGPT. En el
repositorio, la fuente se nombra así y nada más:

> Carpeta privada de Google Drive aprobada por Marlon y administrada fuera del repositorio.

Se verificó que ese identificador no aparece en ningún archivo rastreado, ni en
el HTML construido, ni en el JavaScript del cliente, ni en los datos
estructurados, ni en ningún comentario, ni en ningún commit de la historia del
repositorio.

---

## 17. Pendientes

**Contenido y fotografía**

- [ ] Selección del hero: fotografía interior real con vista hacia la Catedral.
- [ ] Manifiesto de fotografías reales, clasificadas por espacio y planta.
- [ ] Selección de imágenes conceptuales.
- [ ] Descripciones finales de cada espacio.
- [ ] Textos alternativos (`alt`) definitivos.
- [ ] Open Graph definitivo.
- [ ] Vídeo final.
- [ ] Detalle ampliado de cada una de las cuatro unidades.
- [ ] Primeras entradas de la bitácora.

**Datos que no se publican hasta estar confirmados**

- [ ] Dirección exacta.
- [ ] Número definitivo de habitaciones y capacidad.
- [ ] Permisos y concepto de patrimonio (Ministerio de Cultura o autoridad competente).
- [ ] Fecha de apertura.
- [ ] Operadores.
- [ ] Modelo jurídico, financiero y de vinculación.

**Técnicos**

- [ ] Página índice `/proyectos`: **se evaluará antes de la publicación pública o
      cuando exista un portafolio suficiente de proyectos.** Mientras no exista, la
      miga muestra «Proyectos» como texto no enlazado.
- [ ] **Plataforma de analítica pendiente de decisión. Los nombres de eventos ya
      están definidos.** Falta elegir plataforma y añadir el escucha delegado de
      `data-evento` en `main.js`.
- [ ] `tsconfig.json` y linter: **el repositorio no tiene ninguno de los dos.**
      `package.json` no define `lint` ni `test`. Sin `tsconfig.json`, `astro check`
      no puede inferir los tipos de `Astro.props` y marca **64 errores
      preexistentes** repartidos en archivos que llevan meses publicados
      (`[slug].astro` 48, `hospedajes/index.astro` 7, `index.astro` 5,
      `Cabecera.astro` 2, `Base.astro` 1, `Foto.astro` 1). **No los produjo esta
      página y no se corrigen en esta rama:** arreglarlos toca a todo el
      repositorio y necesita su propia autorización. Tampoco se modifica ningún
      archivo ajeno para ocultarlos.

Ninguno de estos pendientes se muestra al visitante como un error.

---

## 18. Gates de publicación

Ninguno de estos pasos se da sin los anteriores:

1. Aprobación de contenido.
2. Aprobación fotográfica (manifiesto).
3. Aprobación jurídica de los textos de contrato, opción de compra y permisos.
4. Aprobación escrita de Marlon.
5. Auditoría final de ChatGPT.

Y entonces, en el mismo repaso y no por separado:

- `BORRADOR = false` en `src/data/casa-colonial-centro.ts`.
- `indexable` y `seguirEnlaces` a `true` en la página.
- Añadir la ruta a `src/pages/sitemap.xml.ts`.
- Decidir desde dónde se enlaza.
- Volver a medir: SEO 100/100 y accesibilidad 100/100.

---

## 19. Fecha de actualización

4 de septiembre de 2026.

## 20. Estado de revisión

| Revisión | Estado |
|---|---|
| Construcción del sitio | Pasa. 18 páginas |
| Comprobador de contenido (`npm run comprueba`) | Pasa |
| Rendimiento | **100** en móvil y escritorio |
| Accesibilidad | **100** en móvil y escritorio |
| Buenas prácticas | **96**, por una condición global relacionada con la tipografía. No se corrige en esta rama. Una página ya publicada, medida como control, da el mismo 96 |
| SEO | **69**, por el `noindex` deliberado. Las otras nueve verificaciones SEO pasan. El `noindex` no se retira para subir la nota |
| Revisión de dirección | **Pendiente** |
| Revisión jurídica | **Pendiente** |
