# Red Atheron Zipaquirá — MVP (La Triada, Gallina al Vapor, grupos)

> Arrancado el 19 de septiembre de 2026 en `preview/red-atheron-zipaquira-20260919`
> (commit `dec3dfe`), sobre `origin/main` (`e6392a9`). Continuado el mismo día en
> `claude/atherton-zipaquira-recovery-cwc3la`, que parte de `dec3dfe` sin reconstruir nada.
> Segunda tanda del mismo día: redespliegue programado preparado y **apagado**, y La Triada
> pasada a aliado por decisión de dirección.
> Este documento es interno: **no se publica** y no contiene condiciones comerciales.

## Qué se construyó

| Ruta | Qué es | Indexable |
|---|---|---|
| `/guia-zipaquira/restaurantes-y-cafes` | Hub editorial de restaurantes y cafés | No (noindex, follow) |
| `/guia-zipaquira/restaurantes-y-cafes/la-triada` | Ficha de La Triada (aliado piloto) | No (noindex, follow) |
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

### El caso sin JavaScript: redespliegue programado (implementado, APAGADO)

Queda un caso que el navegador no puede resolver: quien tenga JavaScript desactivado, y un
rastreador que no ejecute scripts, reciben el HTML tal como quedó el último despliegue. En un
sitio estático eso solo se cierra volviendo a construir.

El mecanismo está escrito y probado. **No está activo y no puede activarse solo.**

| Pieza | Qué hace |
|---|---|
| `.github/workflows/redespliegue-programado.yml` | Cron diario a las 05:07 UTC = **00:07 en Colombia** |
| `scripts/necesita-redespliegue.mjs` | Decide si hace falta. Sin él, el flujo desplegaría a diario sin motivo |

**Cómo decide.** Descarga `/guia-zipaquira/gallina-al-vapor` del sitio publicado y mira qué bloque
`data-jornada-id` **no** lleva `hidden`. Lo compara con lo que correspondería hoy según `JORNADAS`.
Si coinciden, no hace nada. Si no, dispara el Deploy Hook.

**En caso de duda, no despliega.** Si la página no responde, devuelve un 404, no trae ningún
marcador (por ejemplo, porque el dominio todavía sirve el sitio antiguo) o muestra dos bloques a
la vez, la respuesta es «no hace falta» y queda un aviso en el registro. Un fallo de lectura no
puede convertirse en un despliegue diario en bucle contra producción.

**Por qué las 00:07.** Una jornada deja de anunciarse a las 23:59:59 hora de Colombia. Siete
minutos después ya está vencida: la ventana en que alguien sin JavaScript podría ver la fecha
pasada baja de días a minutos. El minuto 7 y no el 0 porque GitHub retrasa los cron en las horas
en punto.

#### Los tres cerrojos

Para que este flujo llame a Vercel tienen que cumplirse **las tres**:

1. **Estar en la rama por defecto.** GitHub solo ejecuta `schedule` en la rama por defecto. Mientras
   viva en `claude/atherton-zipaquira-recovery-cwc3la`, **no se ejecuta ni una vez**.
2. **Variable `REDESPLIEGUE_ACTIVO` = `si`** (acepta `SI`, `sí`, `true`, `1`).
   *Settings → Secrets and variables → Actions → Variables.*
3. **Secreto `VERCEL_DEPLOY_HOOK`** con la dirección del Deploy Hook.
   *Settings → Secrets and variables → Actions → Secrets.*

Falta cualquiera de las tres y el flujo se ejecuta, lo deja dicho en el registro y termina sin
llamar a nadie.

#### Qué hay que activar en Vercel, exactamente

1. Vercel → proyecto → **Settings → Git → Deploy Hooks → Create Hook**.
   Nombre: `jornada-gallina`. Rama: la que publica producción (**hoy `main`**; el hook dispara un
   despliegue de esa rama, así que crearlo apuntando a otra no serviría de nada).
2. Copiar la URL que devuelve. **Es un secreto: quien la tenga puede desplegar.** No se pega en el
   chat ni en el repositorio.
3. Pegarla en GitHub como secreto `VERCEL_DEPLOY_HOOK`.
4. Crear la variable `REDESPLIEGUE_ACTIVO` con valor `si`.
5. Opcional: variable `URL_PUBLICADA` si alguna vez se quiere comprobar otro dominio. Por defecto
   `https://hotelesatheron.com`.
6. Probar sin desplegar: **Actions → Redespliegue programado → Run workflow**, dejando *simular*
   en `true`. Llega hasta la decisión y no llama al hook. (`workflow_dispatch` solo aparece en la
   interfaz cuando el archivo está en la rama por defecto.)

**Frecuencia: una vez al día.** Es lo que corresponde al problema: las jornadas cambian de estado
a medianoche, no cada hora. Con el filtro de `necesita-redespliegue.mjs`, los días en que no
cambia nada no se crea ningún despliegue: el historial de Vercel sigue mostrando solo los
despliegues que importan. Un consumo típico son ~30 ejecuciones de menos de un minuto al mes.

**Ojo al orden.** Mientras `hotelesatheron.com` sirva el sitio antiguo, el script no encontrará
ningún `data-jornada-id` y responderá «no hace falta». Es lo correcto, pero significa que este
mecanismo **no empieza a servir hasta después del merge a `main`**.

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

## La Triada: aliado declarado, acuerdo no publicado

Decisión de dirección del 19 de septiembre de 2026: **tratar La Triada como Aliado Atheron**,
porque existe una relación comercial confirmada con el propietario. Cómo quedó implementado:

- `estadoComercial: 'ALIADO'` en `src/data/experiencias-locales.ts`. Se pinta la insignia
  **Aliado Atheron** en la tarjeta y en la ficha.
- Texto público, **literal y sin una palabra de más**, el autorizado:

  > Establecimiento aliado de la Red Atheron Zipaquirá.

- **Ninguna condición.** Ni comisión, ni porcentaje, ni cupos, ni plazos, ni vigencia. Nada de
  eso está en el sitio ni en este repositorio, y no se puede deducir de nada publicado.
- **Sin beneficio.** No hay ninguno acordado que publicar, así que el objeto `beneficio` no
  existe y su bloque no se pinta. La maqueta ya lo contemplaba.
- **Aliado no es recomendado.** Es el punto delicado. Antes, el componente pintaba la insignia
  «Recomendado por Atheron» a cualquier `ALIADO`, lo que habría afirmado que alguien de Atheron
  estuvo allí y responde por el sitio. No es cierto: nadie ha ido. Ahora esa insignia depende de
  `motivoRecomendacion`, no del estado. La Triada sale como aliado y nada más.
- La definición del hub se ajustó para que sea sostenible: «Existe un acuerdo comercial con
  Atheron, y se declara en su ficha. Las condiciones del acuerdo son privadas y no se publican.»
  Antes decía «convenio firmado», que es una afirmación que hoy no consta por escrito aquí.
- **Sigue `noindex, follow` y fuera del sitemap**, tal como se pidió: la página no tiene todavía
  contenido suficiente para sostener una URL pública de calidad.

Nada de lo de arriba añade un solo dato del local. Dirección, horarios, capacidad, menú, precios,
parqueadero, teléfono y fotografías siguen sin publicarse: ver la lista de abajo.

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

## Pruebas que quedan en el repositorio

```bash
npm run comprueba          # contenido, fotos y estado del calendario
npm run prueba             # 42 pruebas de mínimo publicable
npm run prueba-jornadas    # 25 pruebas del calendario: antes, durante y después
npm run redespliegue-necesario   # ¿el sitio publicado está al día? (no despliega)
```

`npm run prueba-jornadas` cubre el 19 (antes), el 20 por la mañana y a las 23:59:58 (durante),
el 21 a las 00:00:00 (después) y meses más tarde; el mismo instante escrito en UTC y en hora de
Colombia, para que la zona horaria del servidor que construye no pueda colarse; y el encadenado
de dos fechas con un calendario de mentira, local a la prueba: **en `JORNADAS` no se inventa
ninguna fecha**.

Lo que no cabe en un script queda comprobado con navegador real (Playwright, reloj falseado):
los seis momentos de arriba sobre la página construida el 19, la tarjeta del hub, y el caso
**sin JavaScript**, que es exactamente el que justifica el redespliegue programado.

## Otros arreglos hechos al continuar

- `.guia__fuente a` dentro del cuerpo se pintaba en sal claro sobre blanco (1,9:1). Corregido a
  `--acento-texto`. Era un fallo latente en `guia.css`, no solo de estas páginas.
- La insignia de aliado salía en gris sobre verde (1,29:1) y estirada a todo el ancho en la
  ficha: `.guia__cuerpo p` le ganaba en especificidad, y `align-self` no hace nada fuera de un
  contenedor flex. Nunca se había visto porque hasta hoy ningún lugar era aliado.
- Las fichas publicaban la fecha de verificación en crudo: «Datos comprobados el 2026-09-19».
  Ahora todo el sitio usa una sola función, `src/data/fechas.ts`, que el blog también reexporta.
- El `lastmod` de Gallina en el sitemap estaba escrito a mano; ahora sale de `MODIFICADO` en su
  propio módulo de datos, que es donde se ve si cambia.
