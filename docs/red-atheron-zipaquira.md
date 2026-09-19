# Red Atheron Zipaquirá — MVP (La Triada, Gallina al Vapor, grupos)

> 19 de septiembre de 2026. Rama `feat/red-atheron-zipaquira`, sobre `origin/main` (e6392a9).
> Este documento es interno: **no se publica** y no contiene condiciones comerciales.

## Qué se construyó

| Ruta | Qué es | Indexable |
|---|---|---|
| `/guia-zipaquira/restaurantes-y-cafes` | Hub editorial de restaurantes y cafés | No (noindex, follow) |
| `/guia-zipaquira/restaurantes-y-cafes/la-triada` | Ficha de La Triada (comercio piloto) | No (noindex, follow) |
| `/guia-zipaquira/gallina-al-vapor` | Jornada gastronómica permanente | Sí |

Modificados: la tarjeta «Dónde comer y cafés» y la sección de grupos del hub `/guia-zipaquira`,
la lista «Seguir leyendo» de `/zipaquira/catedral-de-sal`, el sitemap y `main.js` (una línea).

## Cómo se actualiza

- **Nueva jornada de Gallina:** editar `JORNADA` en `src/data/gallina-al-vapor.ts` (fecha, precios,
  título familiar) y volver a construir. La URL no cambia. Pasada la fecha, la página deja de mostrar
  fecha y precios sola, **pero la comprobación es al construir**: hay que desplegar el lunes 21.
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
- La Triada sale como **INFORMATIVO**. Ver el riesgo abajo.
- Cero datos personales en analítica: ni nombre, ni teléfono, ni texto libre.

## Riesgo de transparencia que decide Marlon

El directorio define «Aliado Atheron» como «existe un convenio firmado, que se declara». Si hay un
acuerdo comercial con La Triada, mostrarla como *Informativo* es incoherente con esa regla y con las
buenas prácticas de divulgación de vínculos comerciales. Las opciones son declarar el estado
`ALIADO` (sin publicar condiciones ni porcentajes) o no publicar la ficha hasta decidirlo. **No debe
indexarse ni promocionarse antes de resolver esto.**

## Atribución (concepto)

`ATH-<ALIADO>-<5 caracteres>`, generado en el navegador (`src/data/leads-grupo.ts`). `TRI` = La Triada,
`GUI` = guía sin comercio concreto. Viaja dentro del mensaje de WhatsApp. **No es único garantizado,
no registra comisión ni prueba un convenio.** Cuando haya backend, el mismo formato pasa a ser un
identificador real.

## Eventos de analítica (GA4 ya instalado: G-KXXM0LJKK9)

`triada_click`, `lugar_click`, `gallina_click`, `gallina_whatsapp_click`, `hospedaje_click`,
`group_lead_submit`, además del `whatsapp_click` que ya existía. Se marcan con `data-red-evento`
(no con `data-evento`, para no alterar los botones ya medidos). Solo emiten desde hotelesatheron.com.
