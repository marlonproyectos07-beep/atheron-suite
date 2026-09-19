# Red Atheron Zipaquirá — MVP (La Triada, Gallina al Vapor, grupos)

> Arrancado el 19 de septiembre de 2026 en `preview/red-atheron-zipaquira-20260919`
> (commit `dec3dfe`), sobre `origin/main` (`e6392a9`). Continuado el mismo día en
> `claude/atherton-zipaquira-recovery-cwc3la`, que parte de `dec3dfe` sin reconstruir nada.
> Este documento es interno: **no se publica** y no contiene condiciones comerciales.

## Qué se construyó

| Ruta | Qué es | Indexable |
|---|---|---|
| `/guia-zipaquira/restaurantes-y-cafes` | Hub editorial de restaurantes y cafés | No (noindex, follow) |
| `/guia-zipaquira/restaurantes-y-cafes/la-triada` | Ficha de La Triada (comercio piloto) | No (noindex, follow) |
| `/guia-zipaquira/gallina-al-vapor` | Jornada gastronómica permanente | Sí |

Modificados: la tarjeta «Dónde comer y cafés» y la sección de grupos del hub `/guia-zipaquira`,
la lista «Seguir leyendo» de `/zipaquira/catedral-de-sal`, el sitemap y `main.js` (una línea).

---

## La fecha de Gallina ya no depende del despliegue

Era el agujero grande del MVP: la página decidía **al construir** si anunciaba la jornada.
Si pasaba el día y nadie desplegaba, seguía publicando una fecha vencida con su precio,
indefinidamente y **sin ningún error visible**. Ahora hay tres defensas, y ninguna depende
de que alguien se acuerde:

1. **Calendario.** `JORNADAS` en `src/data/gallina-al-vapor.ts` es una lista. Se pueden dejar
   varias fechas cargadas por adelantado; al terminar una, la página pasa sola a la siguiente
   **sin desplegar nada**.
2. **Reloj del visitante.** La página pinta un bloque por jornada pendiente más el de «fecha
   por anunciar», deja visible el del build y lleva el calendario dentro. Un script de ~250 bytes
   (`src/components/SelectorJornada.astro`) vuelve a elegir con la hora de quien mira. Sin
   JavaScript queda lo que decidió el build: nunca peor que antes.
3. **Metadatos permanentes.** `<title>`, meta descripción y Open Graph **no llevan fecha ni
   precio**. Aunque Google guarde una versión antigua en caché, el resultado de búsqueda no
   puede anunciar una jornada que ya pasó. La fecha vive en el cuerpo, donde caduca a la vista.

La URL no cambia nunca, así que el SEO acumulado se conserva entero.

Lo único que el código no puede resolver solo es que se **agote** el calendario: eso es
contenido. `scripts/comprueba-jornadas.mjs` avisa al construir cuando queda una sola jornada
a menos de 7 días, o ninguna. Avisa, no detiene: quedarse sin fecha no es un error (la página
dice la verdad y ofrece el WhatsApp), y un bloqueo que estorba acaba desactivado.

**Probado en navegador** (Playwright, reloj falseado) con el build del 19 de septiembre:

| Visita | Lo que se ve |
|---|---|
| 19 sep | Jornada del 20, con precios |
| 20 sep 23:00 | Jornada del 20, con precios |
| 21 sep | «Fecha por anunciar». La fecha vencida **no aparece** |
| marzo 2027 | «Fecha por anunciar» |
| Con dos fechas cargadas, visita del 25 sep | Salta sola a la segunda |

### Pendiente de autorización: reconstrucción programada

Queda un caso residual: un visitante **sin JavaScript** que llegue después de la fecha seguiría
viendo el build viejo. Se cierra con un despliegue automático periódico, que **toca configuración
de producción y necesita el visto bueno de Marlon**. Cuando se autorice, es un Deploy Hook de
Vercel y un `.github/workflows/redespliegue.yml` de seis líneas:

```yaml
on:
  schedule:
    - cron: '0 8 * * *'   # 03:00 en Colombia
jobs:
  redesplegar:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsSL -X POST "${{ secrets.VERCEL_DEPLOY_HOOK }}"
```

No se ha creado: crea despliegues a producción, que es exactamente lo que no se hace sin orden.

---

## Cómo se actualiza

- **Nueva jornada de Gallina:** añadir un objeto a `JORNADAS` en `src/data/gallina-al-vapor.ts`
  (fecha, precios, título familiar, `verificadoEl`, y su `landing` si la tiene). La URL no cambia
  y el sitemap tampoco. Se pueden dejar varias cargadas.
- **Completar La Triada:** añadir campos al objeto en `src/data/experiencias-locales.ts` (dirección,
  horarios, fotos, sitio oficial) y/o a `src/data/fichas-lugares.ts` (carta, platos, familias, grupos,
  ruta a la Catedral, galería, video, opiniones). Cada bloque aparece solo cuando tiene dato.
- **Añadir otro comercio:** un objeto nuevo en `experiencias-locales.ts` con `rutaFicha`. La plantilla
  `restaurantes-y-cafes/[slug].astro` genera su página; no hay que tocar maqueta ni CSS.
- **Indexar:** `HUB_RESTAURANTES.indexable` y `fichasExtra[slug].indexable` en `fichas-lugares.ts`.
  La misma constante quita el noindex y mete la página en el sitemap.

## Datos que faltan confirmar con La Triada

Solo se publican hoy: **nombre, categoría «Restaurante» y ciudad**, con fuente en el listado de
Detour Cundinamarca. Lo que sigue apareció en resultados de búsqueda pero **no se pudo leer en la
fuente** (Detour devolvió 402 y zipaquira.travel un muro anti-bot), así que **no está publicado**:

- Nombre comercial exacto: los listados dicen «Triada Restaurante» / «Restaurante La Triada».
- Dirección (un resultado de Google Maps muestra «Cl. 1 #7-81»).
- Capacidad y parqueadero (un resumen habla de ~1.500 personas y ~150 vehículos).
- Especialidades (hornos de sal, papa a la salmuera, cuajada con melado) y menús ejecutivos entre semana.
- Si es también centro de eventos.
- Horarios, teléfono/WhatsApp, redes oficiales.
- Carta y precios **con fecha**, platos destacados.
- Condiciones para familias y para grupos (menús, cupos, anticipación).
- Cercanía o ruta a la Catedral de Sal **medida** (no se escribe ninguna cifra sin medir).
- Fotografías y video propios, con permiso y procedencia.
- Permiso expreso para publicar la ficha.

## Reglas que este MVP respeta

- Sin `AggregateRating`, `Review`, `Restaurant`, `LocalBusiness` ni `Event` en JSON-LD.
- Ninguna comisión ni condición privada con La Triada aparece en el sitio ni en el código.
- Cero datos personales en analítica: ni nombre, ni teléfono, ni texto libre.

## El vínculo comercial con La Triada: cómo se resolvió

El riesgo que quedó abierto el 19 de septiembre era este: el directorio define «Aliado Atheron»
como «existe un convenio firmado, que se declara», y mostrar como simple **Informativo** un
comercio con el que hay una relación comercial real es presentarlo como si no hubiera ningún
interés detrás. Eso es lo que hace engañosa una guía.

Se resolvió sin publicar ni una condición y sin afirmar lo que no consta:

- El estado sigue siendo `INFORMATIVO`. **No** se pone `ALIADO`, porque esa insignia afirma
  «convenio firmado» y lo confirmado por dirección es que existe una relación comercial.
- Se añadió el campo `divulgacionComercial` al modelo. Declara que la relación **existe** y que
  no condiciona lo que se publica. Aparece en la tarjeta y, en la ficha, en un bloque propio
  justo debajo del hero — fuera del hero a propósito, que es oscuro, para que se lea sin esfuerzo.
- **Nunca** lleva porcentajes, comisiones, cupos, plazos ni ningún término del acuerdo. Nada de
  eso está en el sitio ni en este repositorio.

Texto publicado hoy, literal:

> Atheron mantiene una relación comercial con este establecimiento. No condiciona lo que
> publicamos: los datos se comprueban igual y una comisión no compra posición editorial.

**Lo que decide Marlon:** si ese es el texto que quiere, y si al haber convenio firmado prefiere
pasar la ficha a `ALIADO`. Mientras tanto la página sigue **noindex** y no se promociona.

## Atribución (concepto)

`ATH-<ALIADO>-<5 caracteres>`, generado en el navegador (`src/data/leads-grupo.ts`). `TRI` = La Triada,
`GUI` = guía sin comercio concreto. Viaja dentro del mensaje de WhatsApp. **No es único garantizado,
no registra comisión ni prueba un convenio.** Cuando haya backend, el mismo formato pasa a ser un
identificador real.

## Eventos de analítica (GA4 ya instalado: G-KXXM0LJKK9)

`triada_click`, `lugar_click`, `gallina_click`, `gallina_whatsapp_click`, `hospedaje_click`,
`group_lead_submit`, además del `whatsapp_click` que ya existía. Se marcan con `data-red-evento`
(no con `data-evento`, para no alterar los botones ya medidos). Solo emiten desde hotelesatheron.com.

Comprobado sobre el JavaScript ya construido: `group_lead_submit` envía únicamente `origin`,
`referral_code`, `group_size_range` (rango, no la cifra), tres banderas de servicio y `page_path`.
**No viajan nombre, teléfono, fecha exacta, ciudad ni observaciones.**

## Otros arreglos hechos al continuar

- `.guia__fuente a` dentro del cuerpo se pintaba en sal claro sobre blanco (1,9:1). Corregido a
  `--acento-texto`. Era un fallo latente en `guia.css`, no solo de estas páginas.
- Las fichas publicaban la fecha de verificación en crudo: «Datos comprobados el 2026-09-19».
  Ahora todo el sitio usa una sola función, `src/data/fechas.ts`, que el blog también reexporta.
- El `lastmod` de Gallina en el sitemap estaba escrito a mano; ahora sale de `MODIFICADO` en su
  propio módulo de datos, que es donde se ve si cambia.
