# Checkpoint ATH-ODOO-HOTEL-008 — 2026-09-28

PR #68, rama `feature/ath-odoo-hotel-008a`. Orden: "ATH-ODOO-HOTEL-008 —
PRELAUNCH E2E HARNESS" (comentario de Marlon, 2026-09-28).

No existia `AI/ATH-ODOO-HOTEL-008A_CHECKPOINT_2026-09-28.md` que la orden
pedia leer primero; este documento lo sustituye/crea para dejar el estado
por escrito. Contexto previo relevante (no repetido en detalle aqui):
comentarios anteriores de este mismo PR #68 (2026-09-26), que dejaron sin
resolver la discrepancia PR#57 vs PR#63 como fuente de HOTEL-007 y
confirmaron que esta sesion no tiene acceso de red (`git fetch`, `gh`,
`WebFetch` rechazados).

## Que se hizo en esta tarea

1. Se releyo `AI/ATH-ODOO-HOTEL-008A.md` y el commit `8210ab1`
   (`FakeOdooTransport` + gates 008A-1..4), que siguen intactos.
2. Se busco en todo el arbol de trabajo (`src/`, `scripts/`, `AI/`,
   `.github/workflows/`) cualquier cliente Odoo real, integracion
   Booking/Airbnb, o backend de WhatsApp/Sofia:
   - No hay carpeta `integrations/` en ningun ref local (`git log --all`
     tampoco encuentra commits que la hayan tocado desde este checkout).
   - Las coincidencias de "whatsapp" en `src/` son un boton de contacto
     estatico (`src/data/whatsapp.ts`, `src/components/ContactoWhatsApp.astro`),
     sin backend ni Odoo detras.
   - No hay motor de precio/quote en ningun archivo del repositorio.
   - Conclusion: a la fecha de este commit, en esta rama/checkout no existe
     ningun gateway Odoo productivo ni integracion de canal real que
     "reutilizar" mas alla del fixture creado en 008A. La discrepancia
     PR#57 vs PR#63 sigue sin resolver (sigue siendo trabajo para un humano
     o una sesion con acceso de red aprobado, ver `AI/AUTONOMOUS_QUEUE.md`).
3. Se extendio `scripts/fake-odoo-transport.mjs` (compatible hacia atras,
   los 4 gates 008A siguen pasando su misma logica) con dos capacidades
   necesarias para la matriz E2E, ambas solo en memoria:
   - `canal` en `hold()`: etiqueta de origen (web/booking/airbnb/...) para
     poder probar que el inventario se comparte entre canales.
   - `idempotencyKey` en `hold()`: reintentar la misma peticion no duplica
     el HOLD ni lo rechaza como si fuera una segunda venta.
   - `liberar(unidadId)` ahora tambien acepta Casa Completa (libera las 5
     a la vez), antes solo aceptaba una habitacion suelta.
4. Se creo `scripts/prueba-odoo-hotel-008-e2e.mjs` (12 pruebas, ver
   `AI/ATH-ODOO-HOTEL-008_MATRIZ_E2E.md` para el detalle fila por fila) y
   el script `npm run prueba-odoo-hotel-008-e2e`.
5. Se documento la matriz completa pedida por la orden, incluyendo las
   filas que quedan BLOCKED_NOT_IMPLEMENTED por no existir el sistema
   fuente (gateway Odoo, Booking, Airbnb, WhatsApp/Sofia, precio) — sin
   simular PASS de ninguna de ellas.

## Bloqueo de ejecucion (confirmado de nuevo, tercera vez consecutiva)

Este runner permite `node -v` (responde `v22.23.2`) pero rechaza toda
ejecucion real de codigo: `node scripts/prueba-odoo-hotel-008a.mjs`,
`node scripts/prueba-odoo-hotel-008-e2e.mjs`, e incluso `node --check
<archivo>` (que solo valida sintaxis, no ejecuta) devuelven "This command
requires approval", sin aprobador humano disponible en esta ejecucion
automatica. `npm run <script>` tambien esta bloqueado por la misma causa.
Es la misma restriccion ya documentada en los dos comentarios anteriores
de este PR (2026-09-26): no es especifica de este script, es un bloqueo
del runner sobre cualquier invocacion de node/npm que no sea `-v`.

Por esto: el codigo nuevo (fixture + 12 pruebas) se revisó manualmente
linea por linea contra cada escenario de la matriz y es consistente con lo
esperado, pero **eso no es una ejecucion real** y no se reporta como PASS.

## PRELAUNCH_GATE_STATUS

| Gate | Estado | Motivo |
|---|---|---|
| ODOO | BLOCKED_NOT_IMPLEMENTED | sin gateway Odoo real en el repositorio |
| WEB | OFFLINE_IMPLEMENTED_NOT_EXECUTED | fixture + 12 pruebas listas, bloqueadas por el runner |
| BOOKING | BLOCKED_NOT_IMPLEMENTED (contrato probado) | sin integracion Booking real; el contrato de inventario compartido si tiene prueba (E2E-10) |
| AIRBNB | BLOCKED_NOT_IMPLEMENTED (contrato probado) | igual que Booking |
| WHATSAPP | BLOCKED_NOT_IMPLEMENTED | solo boton de contacto estatico, sin backend |
| SOFIA | BLOCKED_NOT_IMPLEMENTED | no existe backend conversacional en el repositorio |
| CATALOGO | OUT_OF_SCOPE_THIS_HARNESS | cubierto por `npm run comprueba` (no tocado aqui) |
| ANTI_OVERBOOKING | OFFLINE_IMPLEMENTED_NOT_EXECUTED | 008A-1..4 + E2E-1..10 |
| PRICING | BLOCKED_NOT_IMPLEMENTED | no existe motor de precio/quote en el repositorio |
| CANCELLATION | OFFLINE_IMPLEMENTED_NOT_EXECUTED | E2E-5, E2E-6 |
| EXPIRATION | OFFLINE_IMPLEMENTED_NOT_EXECUTED | 008A-3, E2E-7 |
| CONCURRENCY | OFFLINE_IMPLEMENTED_NOT_EXECUTED (parcial) | E2E-12 modela check-and-set de un proceso; no sustituye prueba de carrera contra Odoo LIVE |
| OBSERVABILITY | BLOCKED_NOT_IMPLEMENTED | no hay logging/metrica de HOLD/availability en el repositorio |

Ningun gate queda en PASS: "implementado, no ejecutado" no es lo mismo que
"verificado", y este documento no lo confunde.

## Proxima accion exacta

1. Ejecutar `npm run prueba-odoo-hotel-008a && npm run prueba-odoo-hotel-008-e2e`
   en un entorno con permiso real de node/npm (local de Marlon, o un
   runner/CI con ese paso ya aprobado) y pegar la salida real aqui o en el
   PR.
2. Resolver, con acceso de red aprobado, si PR#57 o PR#63 es la fuente
   real de un gateway Odoo ya probado en LIVE staging; si existe, portarlo
   a esta rama es el unico camino realista hacia los gates ODOO/PRICING/
   GATE-LIVE-1..6 (ya definidos en `AI/ATH-ODOO-HOTEL-008A.md`).
3. Sin (1) y (2), este PR no puede avanzar mas por via autonoma: no hay
   mas investigacion offline pendiente en el alcance de esta orden.
