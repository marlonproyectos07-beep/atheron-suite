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
**sin enlace**, a propósito: crear una página pública vacía solo para que la miga
tenga a dónde apuntar sería peor. Ver §17.

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
- La carpeta de Drive de fotografías del proyecto, **solo** a través del
  manifiesto aprobado.

El identificador de esa carpeta **no se escribe en el repositorio**, ni siquiera
en esta documentación: vive en el canal interno del proyecto (ver §16).

## 6. Fuentes prohibidas

- Atheron Suite / La Magia de Zipaquirá.
- Casa Algarra.
- Casa Neusa.
- Hotel Colonial Confort — **ojo con el nombre parecido: no es este proyecto.**
- Habitaciones 201, 202, 203, 301 y 302 de otras propiedades.
- La segunda carpeta de Drive de nombre similar, que mezcla propiedades.
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

**El identificador de la carpeta de Drive no está en este archivo.** La
instrucción permite conservarlo en documentación interna no publicada, pero
`docs/` vive en el repositorio: cualquiera con acceso al repositorio lo leería.
Se queda en el canal interno del proyecto. Si dirección prefiere lo contrario, se
añade.

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

- [ ] Página índice `/proyectos`, o decisión de no tenerla. Mientras no exista, la
      miga muestra el escalón sin enlace.
- [ ] Plataforma de analítica y el escucha delegado de `data-evento` en `main.js`.
- [ ] `tsconfig.json`: el repositorio no tiene ninguno, así que `astro check`
      marca ~64 errores de «tipo implícito» en archivos que llevan meses
      publicados. No es un fallo de esta página; se propone resolverlo aparte.

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
| Lighthouse móvil y escritorio | Rendimiento 100, accesibilidad 100 |
| Buenas prácticas | 96 en este entorno, por la tipografía de Google bloqueada. Una página ya publicada, medida como control, da el mismo 96 |
| SEO | 69, por el `noindex` deliberado. Las otras nueve auditorías SEO pasan |
| Revisión de dirección | **Pendiente** |
| Revisión jurídica | **Pendiente** |
