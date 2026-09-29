# ATH-ODOO-HOTEL-008 — Web -> Odoo Staging Canary (2026-09-29)

> Continuacion de la rama `night/ath-odoo-hotel-008-level1-20260929`.
> Produccion, Booking, Airbnb y NOBEDS: no tocados. Ningun secreto llego
> al navegador (verificado, ver seccion SECRET_EXPOSURE_CHECK).

## ARCHITECTURE_SELECTED

```
NAVEGADOR
  -> fetch('/api/hotel/availability')  [same-origin, sin credenciales]
    -> src/pages/api/hotel/availability.ts  [Vercel Function, prerender=false]
      -> WebHotelClient (integrations/odoo-hotel-gateway/clients/web-client.mjs)
        -> Hotel Gateway (HOTEL_GATEWAY_BASE_URL)
          -> Odoo STAGING (atheron1-hotel-staging-20260923, accion 1967)
```

Se eligio **Astro `output: 'static'` (sin cambiar) + adaptador
`@astrojs/vercel`**, que permite que UNA sola ruta (`src/pages/api/hotel/
availability.ts`) se sirva on-demand (`export const prerender = false`)
mientras **todas** las demas paginas del sitio siguen prerenderizadas
exactamente igual que antes. No se convirtio el sitio a SSR. Se verifico
con `npm run build`: mismas 34 rutas estaticas, mismas URLs, mismo
`format: 'preserve'`.

## FILES_CHANGED

```
Modificados:
  astro.config.mjs                        (+adaptador @astrojs/vercel, sin tocar site/trailingSlash/format)
  package.json                            (+@astrojs/vercel, +2 scripts de prueba)
  package-lock.json                       (dependencia nueva)
  src/pages/hospedajes/[slug].astro       (+1 import, +1 render condicional para hotel-atheron-suite)

Nuevos:
  src/pages/api/hotel/availability.ts     (puente server-side, Fase 2)
  src/components/CanarioDisponibilidad.astro  (widget minimo, Fase 4)
  scripts/prueba-canario-endpoint.mts     (12 verificaciones, Fase 6)
  scripts/prueba-canario-seguridad.mjs    (verifica el build real, Fase 6)
```

Nada se reconstruyo: `WebHotelClient` y `requestAccommodationAlternatives`
(de `alternatives-engine.mjs`) se **reutilizan** tal cual del turno
anterior; el endpoint tambien reutiliza `RateLimiter` ya existente del
gateway (Fase 8 de HOTEL-007).

## SERVER_SIDE_BRIDGE

`src/pages/api/hotel/availability.ts`:
- `prerender = false` (unica ruta server-side del sitio).
- Variables **server-side exclusivamente**, nunca `PUBLIC_*`:
  `HOTEL_GATEWAY_BASE_URL`, `HOTEL_WEB_AGENT_ID`, `HOTEL_WEB_AGENT_KEY`
  (leidas con `process.env`, nunca `import.meta.env.PUBLIC_*` -- esa es
  la diferencia tecnica exacta que evita que Vite las inline en el bundle
  cliente).
- Valida `unit` (whitelist de 6 valores), `checkIn`/`checkOut` (formato
  `YYYY-MM-DD`, checkout > checkin), `guests` (entero 1-20). Cualquier
  otro valor -> 400, sin llegar al gateway.
- Content-Type distinto de `application/json` -> 400.
- Metodo GET -> 405.
- Sin configuracion server-side (variables ausentes) -> 503
  `SERVICE_UNAVAILABLE`, **nunca inventa disponibilidad**.
- Rate limit: 30 req/min por IP (`clientAddress`), reutilizando
  `RateLimiter` del gateway -> 429 al superarlo.
- Cualquier error del gateway se traduce a `AVAILABILITY_LOOKUP_FAILED`
  (502) generico: nunca reenvia el mensaje/stack real ni datos internos.
- Si la unidad pedida no esta disponible, usa
  `requestAccommodationAlternatives` (ya probado el turno anterior) para
  devolver solo alternativas que el propio gateway confirmo disponibles.

## FRONTEND_WIDGET

`src/components/CanarioDisponibilidad.astro`, insertado **solo** en la
ficha `hotel-atheron-suite` (condicion `ficha.id === 'hotel-atheron-suite'`
en `[slug].astro`), como seccion nueva y aislada entre "Habitaciones" y
"Galeria" -- no toca ningun CTA, id ni seccion existente, no cambia texto
de SEO/schema.org. Campos: entrada, salida, personas, unidad (201-302,
Casa completa). El `<script>` del navegador solo hace `fetch('/api/hotel/
availability', ...)` same-origin; no importa nada del gateway ni lee
ninguna variable de entorno.

## SECRET_EXPOSURE_CHECK

```
npm run build
npm run prueba-canario-seguridad
```

Resultado real (no simulado): **1334 archivos** de la salida cliente
(`dist/client/` + `.vercel/output/static/`) revisados uno por uno --
**0** contienen `HOTEL_WEB_AGENT_KEY`, `HOTEL_GATEWAY_BASE_URL`, `rawKey`
ni la cadena `Bearer `. El endpoint server-side SI aparece (como se
espera) en los chunks del servidor (`.vercel/output/functions/.../
availability_*.mjs`), nunca en los archivos que se sirven al navegador.

Ademas, `npm run prueba-canario` demuestra en caliente (interceptando
`fetch`) que la clave configurada **si** viaja del servidor al gateway
(`Authorization: Bearer <clave>`), pero **nunca** aparece en la respuesta
JSON que recibe el navegador -- verificado con una aserion explicita
sobre el cuerpo de la respuesta.

## BUILD_RESULT

```
npm run build  -> [build] Complete! (mismas 34 rutas estaticas que antes,
                   mas el endpoint server-side nuevo. Ningun URL cambio.)
```

## TEST_RESULT

```
npm run prueba-canario             -> 12/12 verificaciones OK
npm run prueba-canario-seguridad   -> 2/2 verificaciones OK (sobre el build real)
integrations/odoo-hotel-gateway    -> 158/158 tests PASS (sin regresion)
integrations/odoo-hotel-ical       -> 28/28 tests PASS (sin regresion)
```

## STAGING_CONNECTION_STATUS

**NO se ejecuto contra Odoo STAGING real esta noche.** No se abrio ni se
reutilizo ninguna sesion de staging (regla explicita de este turno:
seguir sin tocar produccion/staging por red salvo el secure-store local
ya existente, que tampoco se cargo -- no hizo falta, todo se probo
interceptando `fetch`). El puente esta listo para conectarse en cuanto
`HOTEL_GATEWAY_BASE_URL`/`HOTEL_WEB_AGENT_ID`/`HOTEL_WEB_AGENT_KEY`
apunten a un gateway real desplegado contra staging.

## ROOM_201_WEB_TEST

**ESCENARIO A** (201 disponible): probado con fixture/mock (`npm run
prueba-canario`, seccion 4) -- confirmado que el endpoint devuelve
`requested_available: true` cuando el gateway simulado dice que si.

**ESCENARIO B** (HOLD real sobre 201 en staging, luego reconsultar la
web): **STAGING_EXECUTION_PENDING**. Requiere una sesion real de staging
para crear el HOLD (via `scripts/live-hotel-008a-runner.mjs`, ya existente
y probado) y despues golpear este endpoint apuntando a esa misma base. No
se hizo esta noche por la regla de produccion/staging congelada.

## ALTERNATIVES_TEST

Cubierto por `requestAccommodationAlternatives` (8 tests del turno
anterior, sin cambios) + la seccion 4 de `prueba-canario` que confirma
que el endpoint expone exactamente esas alternativas al navegador, nunca
mas ni menos de lo que el gateway simulado devolvio.

## PREVIEW_STATUS

**NO desplegado.** No se intento desplegar a Vercel Preview: requiere
credenciales/CLI de Vercel que esta sesion no tiene, y un despliegue es
una accion visible/externa que corresponde autorizar a Marlon, no
ejecutarla por cuenta propia. Build local verificado en su lugar (ver
BUILD_RESULT).

## MANUAL_ACTION_REQUIRED

Configurar en Vercel, **entorno Preview unicamente** (nunca Production):

```
NOMBRE DE VARIABLE: HOTEL_GATEWAY_BASE_URL
DONDE CONFIGURARLA: Vercel > Project Settings > Environment Variables
VALOR: NO MOSTRAR (URL del gateway ya desplegado contra staging, o de un
       tunel/despliegue de integrations/odoo-hotel-gateway apuntando a
       ODOO_DATABASE=atheron1-hotel-staging-20260923)
ENTORNO: PREVIEW ONLY

NOMBRE DE VARIABLE: HOTEL_WEB_AGENT_ID
DONDE CONFIGURARLA: Vercel > Project Settings > Environment Variables
VALOR: NO MOSTRAR (identidad tecnica del gateway para el canal web, p.ej.
       "web-hotel-007", registrada en GATEWAY_TECHNICAL_IDENTITIES)
ENTORNO: PREVIEW ONLY

NOMBRE DE VARIABLE: HOTEL_WEB_AGENT_KEY
DONDE CONFIGURARLA: Vercel > Project Settings > Environment Variables
VALOR: NO MOSTRAR (clave opaca correspondiente a HOTEL_WEB_AGENT_ID)
ENTORNO: PREVIEW ONLY
```

Ninguna de las tres debe tener prefijo `PUBLIC_` ni configurarse en
Production. No se piden por chat: Marlon las carga directamente en
Vercel.

## COMMIT

Ver seccion COMMIT/PUSH de `AI/ATH-ODOO-HOTEL-008_NIGHT_RUN_REPORT.md`
(mismo patron: commit local con identidad de un solo uso, sin tocar
`git config`).

## PUSH

**Pendiente de Marlon.** El intento anterior de `git push` en este mismo
turno fue bloqueado por el clasificador de seguridad del entorno
("Out-of-Place Publication"), incluso con autorizacion explicita en
chat -- es una restriccion del propio harness, no algo que se resuelva
reintentando. No se volvio a intentar en este turno (regla: no perseguir
el mismo resultado bloqueado). Falta que Marlon corra:

```bash
git push -u origin night/ath-odoo-hotel-008-level1-20260929
```

## NEXT_ACTION

1. Marlon hace el push de la rama (arriba).
2. Marlon decide si autoriza cargar `HOTEL_GATEWAY_BASE_URL`/
   `HOTEL_WEB_AGENT_ID`/`HOTEL_WEB_AGENT_KEY` en Vercel Preview para
   probar el Escenario B (HOLD real) end-to-end.
3. Con eso, ejecutar Escenario B: crear HOLD de prueba en staging sobre
   201, reconsultar la web, confirmar `NO DISPONIBLE` + Casa Completa
   bloqueada + alternativas correctas, y verificar que el HOLD se libera
   solo (expiracion), sin inventar un endpoint de cancelacion que no
   existe en el contrato actual.
