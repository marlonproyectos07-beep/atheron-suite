# ATH-ODOO-HOTEL-008 — Matriz E2E prelaunch (Odoo <-> canales)

Estado: harness offline implementado, ejecucion bloqueada en este runner
(ver checkpoint `AI/ATH-ODOO-HOTEL-008_CHECKPOINT_2026-09-28.md`).

Unidades piloto: 201, 202, 203, 301, 302, Casa Completa.
Fixture: `scripts/fake-odoo-transport.mjs`. Pruebas: `scripts/prueba-odoo-hotel-008-e2e.mjs`
(`npm run prueba-odoo-hotel-008-e2e`) mas las 4 originales de 008A en
`scripts/prueba-odoo-hotel-008a.mjs` (`npm run prueba-odoo-hotel-008a`).

Regla de esta matriz: si un escenario depende de un sistema que NO existe
en este repositorio (gateway Odoo real, Booking, Airbnb, WhatsApp/Sofia,
motor de precio), se marca **BLOCKED_NOT_IMPLEMENTED** y no se simula un
PASS. Lo que si se puede probar offline es el *contrato de inventario
compartido* que esos sistemas deberan respetar cuando existan: un HOLD de
cualquier origen bloquea las mismas unidades para cualquier otro origen.

## Leyenda de estado

- `OFFLINE_IMPLEMENTED` — hay codigo y prueba en este PR; falta solo
  ejecutarla (ver bloqueo de runner en el checkpoint).
- `BLOCKED_NOT_IMPLEMENTED` — no existe el sistema fuente en el repositorio;
  no se puede probar sin inventar ese sistema.
- `OUT_OF_SCOPE_THIS_HARNESS` — ya cubierto por otra prueba existente del
  repo, no se duplica aqui.

## Matriz

| # | Escenario | Ruta | PRECONDITION | ACTION | EXPECTED_RESULT | EVIDENCE_REQUIRED | PASS_CRITERIA | ROLLBACK | Estado / prueba |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Reservar 201 | WEB->ODOO | 201 libre | `hold('201', {canal:'web'})` | HOLD creado, 201 ocupada | salida de `npm run prueba-odoo-hotel-008-e2e` (E2E-1) | `disponible('201') === false` tras el HOLD | fixture en memoria; el proceso termina y no deja rastro | OFFLINE_IMPLEMENTED — E2E-1 |
| 2 | Doble reserva 201 | WEB->ODOO | 201 ya tiene HOLD vigente | segundo `hold('201', ...)` mismo canal, sin idempotencyKey | lanza error, no crea un segundo HOLD | E2E-2 | la segunda llamada lanza y el primer HOLD sigue intacto | idem | OFFLINE_IMPLEMENTED — E2E-2 |
| 3 | Casa bloqueada al reservar 201 | WEB->ODOO | 201 libre | `hold('201', ...)` | Casa Completa pasa a no disponible | E2E-3 | `disponible(CASA_COMPLETA) === false` | idem | OFFLINE_IMPLEMENTED — E2E-3 (= 008A-1) |
| 4 | Otras habitaciones siguen disponibles | WEB->ODOO | 201 con HOLD | consultar 202/203/301/302 | las 4 siguen disponibles | E2E-3 | todas `true` salvo 201 | idem | OFFLINE_IMPLEMENTED — E2E-3 (= 008A-4) |
| 5 | Casa completa bloquea las 5 | WEB->ODOO | todo libre | `hold(CASA_COMPLETA, ...)` | las 5 habitaciones quedan ocupadas | E2E-4 | las 5 `disponible() === false` | idem | OFFLINE_IMPLEMENTED — E2E-4 (= 008A-2) |
| 6 | Cancelacion (habitacion) | WEB->ODOO | 201 y 202 con HOLD | `liberar('201')` | 201 libre, 202 sigue ocupada | E2E-5 | `disponible('201')===true`, `disponible('202')===false` | idem | OFFLINE_IMPLEMENTED — E2E-5 |
| 7 | Cancelacion (Casa Completa) | WEB->ODOO | Casa Completa con HOLD | `liberar(CASA_COMPLETA)` | las 5 quedan libres | E2E-6 | las 5 `true` | idem | OFFLINE_IMPLEMENTED — E2E-6 |
| 8 | Expiracion de HOLD | WEB->ODOO | 201 (5 min) y 202 (30 min) con HOLD | avanzar reloj inyectado 5min+1ms | 201 libre, 202 sigue ocupada (no reabre inventario ajeno) | E2E-7 | igual que arriba | reloj es funcion inyectada, no `Date.now` real | OFFLINE_IMPLEMENTED — E2E-7 (extiende 008A-3) |
| 9 | Idempotencia | WEB->ODOO | 201 con HOLD, `idempotencyKey=web-req-abc` | repetir mismo `hold` con la misma clave | devuelve el mismo `holdId`, no duplica | E2E-8 | `reintento.holdId === primero.holdId` | idem | OFFLINE_IMPLEMENTED — E2E-8 |
| 10 | Idempotencia no es puerta trasera | WEB->ODOO | 201 con HOLD, clave A | `hold('201', {idempotencyKey: B})` | lanza error igual que sin clave | E2E-9 | lanza | idem | OFFLINE_IMPLEMENTED — E2E-9 |
| 11 | Concurrencia (modelada, un proceso) | WEB->ODOO | 201 libre | 2 intentos de `hold('201', ...)` en el mismo tick sincrono | solo uno gana | E2E-12 | `exitosos.length === 1` | idem | OFFLINE_IMPLEMENTED (parcial) — E2E-12. **No** sustituye una prueba de carrera real contra una base de datos compartida; eso exige Odoo LIVE staging (ver GATE-LIVE en `AI/ATH-ODOO-HOTEL-008A.md`, aun bloqueado por falta de gateway/credenciales, ver checkpoint) |
| 12 | Origen Booking bloquea inventario | BOOKING->INVENTARIO | 201 libre | `hold('201', {canal:'booking'})` | 201 y Casa Completa quedan ocupadas para cualquier canal | E2E-10 | igual que E2E-1/E2E-3, con `canal:'booking'` | idem | OFFLINE_IMPLEMENTED (contrato) — E2E-10. No hay integracion Booking real en el repo; esto prueba solo que el inventario compartido no distingue canal |
| 13 | Origen Airbnb bloquea inventario | AIRBNB->INVENTARIO | igual que 12, canal `airbnb` | igual | igual | E2E-10 | igual | idem | OFFLINE_IMPLEMENTED (contrato) — E2E-10. Mismo caveat que 12 |
| 14 | Segunda venta desde otro canal | ODOO->CANALES | 201 con HOLD del canal Booking | canal Airbnb intenta `hold('201', ...)` | Airbnb falla; el HOLD de Booking se mantiene | E2E-10 | lanza error y `estadoHabitacion('201').canal === 'booking'` | idem | OFFLINE_IMPLEMENTED (contrato) — E2E-10 |
| 15 | Consulta WhatsApp/Sofia | WHATSAPP/SOFIA->ODOO | Casa Completa con HOLD desde web | "otro canal" consulta `disponible()` sobre las 5 unidades | ve exactamente el mismo estado que dejo web | E2E-11 | listas identicas | idem | OFFLINE_IMPLEMENTED (contrato de fuente unica de verdad) — E2E-11. No existe integracion real de WhatsApp/Sofia con Odoo en este repositorio (`src/data/whatsapp.ts` es solo un boton de contacto estatico, sin backend); no se simula esa integracion |
| 16 | Cotizacion (availability -> quote -> HOLD -> status) | WEB->ODOO / WHATSAPP->ODOO | — | pedir precio para una unidad/fecha | precio determinista de Odoo/regla, no de IA | — | — | — | BLOCKED_NOT_IMPLEMENTED — no existe motor de precio ni `quote()` en ningun punto de este repositorio (confirmado por busqueda en `src/`, `scripts/`, `AI/`); inventar una regla de precio aqui violaria la regla de "no inventar datos" del proyecto |
| 17 | Gateway Odoo real (JSON-RPC/XML-RPC) | ODOO | — | — | — | — | — | — | BLOCKED_NOT_IMPLEMENTED — sin cliente Odoo real en el repositorio a la fecha de este commit (ver checkpoint, incluye la busqueda de PR#57/PR#63 aun sin resolver) |
| 18 | Canal Booking real (API) | BOOKING | — | — | — | — | — | — | BLOCKED_NOT_IMPLEMENTED — sin integracion Booking en el repositorio |
| 19 | Canal Airbnb real (API) | AIRBNB | — | — | — | — | — | — | BLOCKED_NOT_IMPLEMENTED — sin integracion Airbnb en el repositorio |
| 20 | Canal WhatsApp/Sofia real (envio/recepcion) | WHATSAPP/SOFIA | — | — | — | — | — | — | BLOCKED_NOT_IMPLEMENTED — sin backend conversacional en el repositorio; ademas fuera de guardrails de esta tarea ("no WhatsApp/Meta sends") |
| 21 | Catalogo (fichas de hospedaje) | — | — | — | — | — | — | — | OUT_OF_SCOPE_THIS_HARNESS — ya cubierto por `npm run comprueba` (`scripts/comprueba-contenido.mjs`, `scripts/comprueba-jornadas.mjs`), no se duplica aqui |
| 22 | Observabilidad (logs/metricas de HOLD) | — | — | — | — | — | — | — | BLOCKED_NOT_IMPLEMENTED — no hay logging/metrica alguna asociada a HOLD/availability en el repositorio; nada que probar todavia |

## Nota sobre "concurrencia" offline

Node ejecuta este harness en un solo proceso y un solo hilo: `hold()` es
sincrono, asi que dos llamadas "simultaneas" en el mismo test en realidad
se ejecutan una tras otra sin que el sistema operativo las intercale. La
prueba E2E-12 demuestra que el *check-and-set* del fixture es atomico (no
hay ventana entre comprobar disponibilidad y marcar el HOLD donde un
segundo intento pueda colarse), pero no prueba una condicion de carrera
real de una base de datos compartida entre procesos/servidores distintos.
Esa prueba solo es posible contra Odoo LIVE staging, que sigue bloqueada
(ver checkpoint).
