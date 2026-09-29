# ATH-ODOO-HOTEL-008 — Night Run Report (2026-09-29)

> Turno nocturno, Workstreams A-O del prompt "NIGHT SHIFT — CONTINUACION
> AUTONOMA". Produccion, Booking, Airbnb, WhatsApp real y NOBEDS: NO
> tocados. Todo lo construido esta noche corre en local, sin red, sobre
> fixtures/contratos.

```
START_TIME: no medible con precision (no se registro reloj al inicio del
  turno; el turno nocturno continua directamente del reporte de auditoria
  anterior en la misma sesion, sin corte de tiempo real detectable).
END_TIME: 2026-09-29T07:18:46Z (UTC, verificado con `date` en esta sesion)
BRANCH: night/ath-odoo-hotel-008-level1-20260929 (creada esta noche desde
  feature/ath-odoo-hotel-008a-live, sin perder ningun cambio previo)
START_COMMIT: 38c3bec948b5b318f4949674aa26ea8775b75ee2 (HEAD sin cambios,
  todo lo de esta noche seguia sin commitear al momento de este reporte)
END_COMMIT: ver el commit inmediatamente posterior a este archivo en el
  historial de la rama night/ath-odoo-hotel-008-level1-20260929 (este
  reporte se escribe y se agrega al MISMO commit)
```

## FILES_CREATED (esta noche, Workstreams A-N)

```
integrations/odoo-hotel-ical/package.json
integrations/odoo-hotel-ical/src/inventory-model.mjs
integrations/odoo-hotel-ical/src/ical-export.mjs
integrations/odoo-hotel-ical/src/ical-import.mjs
integrations/odoo-hotel-ical/test/inventory-model.test.mjs
integrations/odoo-hotel-ical/test/ical-export.test.mjs
integrations/odoo-hotel-ical/test/ical-import.test.mjs
integrations/odoo-hotel-ical/test/paola-fixture.test.mjs
integrations/odoo-hotel-gateway/src/alternatives-engine.mjs
integrations/odoo-hotel-gateway/src/financial-model.mjs
integrations/odoo-hotel-gateway/src/sofia-adapter.mjs
integrations/odoo-hotel-gateway/src/reception-booking.mjs
integrations/odoo-hotel-gateway/src/angela-read-model.mjs
integrations/odoo-hotel-gateway/src/web-booking-flow.mjs
integrations/odoo-hotel-gateway/clients/sofia-client.mjs
integrations/odoo-hotel-gateway/clients/web-client.mjs
integrations/odoo-hotel-gateway/fixtures/reservation-fixtures.mjs
integrations/odoo-hotel-gateway/scripts/morning-smoke.mjs
integrations/odoo-hotel-gateway/test/alternatives-engine.test.mjs
integrations/odoo-hotel-gateway/test/financial-model.test.mjs
integrations/odoo-hotel-gateway/test/sofia-adapter.test.mjs
integrations/odoo-hotel-gateway/test/reception-booking.test.mjs
integrations/odoo-hotel-gateway/test/angela-read-model.test.mjs
integrations/odoo-hotel-gateway/test/web-booking-flow.test.mjs
AI/ATH-ODOO-HOTEL-008_NIGHT_RUN_REPORT.md (este archivo)
AI/ATH-ODOO-HOTEL-008_MORNING_TEST.md
```

De sesiones anteriores (esta misma sesion de Claude Code, antes del turno
nocturno), tambien pendientes de commit y comprometidos ahora en el mismo
checkpoint: `AI/ATH-ODOO-HOTEL-008_NOBEDS_MIGRATION.md`,
`AI/ATH-ODOO-HOTEL-008_OTA_MAP.md`, `AGENTS.md`,
`AI/ATH-ODOO-HOTEL-008A_CHECKPOINT_2026-09-28.md`,
`AI/ATH-ODOO-HOTEL-008A_HANDOFF.md`, y el trabajo de HOTEL-008A ya
documentado (`integrations/odoo-hotel-gateway/scripts/live-*`,
`src/config/odoo-staging-guard.mjs`, tests asociados). No se reconstruyo
nada de eso.

## FILES_MODIFIED (esta noche)

```
integrations/odoo-hotel-gateway/package.json  (+script hotel:morning-smoke)
```

## FEATURES_IMPLEMENTED

- **Modelo de inventario Nivel 1 con bloqueo cruzado** (`odoo-hotel-ical/src/inventory-model.mjs`): reimplementa como logica pura y testeada la regla ya aprobada en HOTEL-002 (Casa Completa bloquea las 5 habitaciones y viceversa; habitaciones hermanas no se bloquean entre si).
- **Exportador iCal** (`odoo-hotel-ical/src/ical-export.mjs`): genera VCALENDAR por unidad desde el modelo de inventario. No publica feeds reales.
- **Importador iCal idempotente** (`odoo-hotel-ical/src/ical-import.mjs`): parser + store con dedup por UID+source, actualizacion, tombstone (explicito por STATUS:CANCELLED e implicito por reconciliacion), logs, last_sync, reintentos con estado de error. Separa CALENDAR BLOCK de COMMERCIAL RESERVATION a proposito.
- **Motor de alternativas** (`odoo-hotel-gateway/src/alternatives-engine.mjs`): `requestAccommodationAlternatives`, nunca inventa disponibilidad (recibe `checkAvailability` inyectado), filtra por capacidad, nunca ofrece habitaciones sueltas como sustituto de Casa Completa.
- **Modelo financiero y cierre gerencial** (`odoo-hotel-gateway/src/financial-model.mjs`): separa venta/estancia/facturacion/cobro/payout/conciliacion; nunca reporta payout neto como venta; sin evidencia bancaria real, `unreconciled` queda `PENDIENTE_DE_VERIFICAR` (nunca 0 por defecto).
- **Fixtures financieros reales** (`odoo-hotel-gateway/fixtures/reservation-fixtures.mjs`): Camilo, Paola, Kevin, Jhon, Blanca (x2, con pago mixto), Monica (fecha de venta corregida por el CEO), Daniel (fecha marcada PENDIENTE_DE_VERIFICAR, tal como el CEO la dejo como hipotesis sin confirmar).
- **Adaptador Sofia/WhatsApp** (`odoo-hotel-gateway/src/sofia-adapter.mjs` + `clients/sofia-client.mjs`): separa datos (disponibilidad/alternativas) de presentacion (texto en espanol). No envia WhatsApp real.
- **Reserva manual de recepcion** (`odoo-hotel-gateway/src/reception-booking.mjs`): misma tuberia availability->quote->hold que cualquier otro canal, sin bypass; `source_channel='reception'` explicito.
- **Contrato de datos del tablero de Angela** (`odoo-hotel-gateway/src/angela-read-model.mjs`): read-model con todos los campos pedidos (huesped, canal, referencia, fechas, venta/comision/payout, facturado/cobrado/saldo, conciliacion) y derivacion de estado sin inventar estados optimistas.
- **Flujo web minimo integrable** (`odoo-hotel-gateway/src/web-booking-flow.mjs` + `clients/web-client.mjs`): orquesta availability->alternativas->quote->hold contra el gateway. hotelesatheron.com **todavia no lo consume** (no se toco el sitio Astro).
- **Runner `npm run hotel:morning-smoke`** (`odoo-hotel-gateway/scripts/morning-smoke.mjs`): ejecuta las 8 fases pedidas (baseline, hold 201, cross-blocking, alternatives, release, Camilo, Paola, cierre gerencial) 100% local, imprime PASS/FAIL/SKIPPED/STAGING_EXECUTION_PENDING por fase y un resumen final.

## TESTS_RUN / PASS / FAIL / PENDING

```
odoo-hotel-gateway (npm test):  156 tests -> 156 PASS, 0 FAIL
odoo-hotel-ical    (npm test):   28 tests ->  28 PASS, 0 FAIL
TOTAL:                          184 tests -> 184 PASS, 0 FAIL, 0 PENDING (local)

hotel:morning-smoke (script, no es suite de tests, es el runner de
  demostracion end-to-end): 8/8 fases PASS (todas locales; el equivalente
  contra Odoo STAGING real queda como STAGING_EXECUTION_PENDING, ver
  AI/ATH-ODOO-HOTEL-008_MORNING_TEST.md).
```

## STAGING_EXECUTION

**PENDING.** No hubo sesion de navegador autenticada contra
`atheron1-hotel-staging-20260923` disponible esta noche, y no se intento
abrir una nueva (regla de esta noche: produccion congelada, no navegar
configuracion tecnica de Odoo). Todo lo construido se probo con
fixtures/contratos locales. El runner ya existente y probado para correr
esto mismo contra Odoo STAGING real sigue disponible sin cambios:
`node scripts/live-hotel-008a-runner.mjs all` (ver
`AI/ATH-ODOO-HOTEL-008A_HANDOFF.md`).

## WEB_STATUS

hotelesatheron.com sigue sin consumir el gateway (confirmado de nuevo:
`src/` del sitio Astro no tiene ninguna llamada a `/hotel/*`). Lo nuevo
esta noche es la capacidad reutilizable (`web-booking-flow.mjs` +
`web-client.mjs`, probada con 3 tests) lista para integrarse a un futuro
widget, sin haber tocado la arquitectura Astro existente.

## SOFIA_STATUS

Gateway ya existente y probado (HOTEL-006/007) reutilizado sin
reconstruir. Nuevo esta noche: adaptador de datos + separacion de
presentacion, probado con 3 tests. No se envio ningun WhatsApp real.

## ICAL_EXPORT_STATUS

Implementado y probado (12 tests entre inventory-model e ical-export).
No publica ningun feed real todavia — es la funcion pura, lista para
conectarse a un endpoint cuando se decida publicar.

## ICAL_IMPORT_STATUS

Implementado y probado (9 tests): parser RFC5545 basico (UID, DTSTART,
DTEND, SUMMARY, DESCRIPTION, STATUS), store idempotente, reconciliacion,
reintentos. No conecta a Booking/Airbnb todavia (fetcher inyectable,
probado solo con fixtures).

## ANGELA_DATA_MODEL

Contrato de datos implementado y probado (5 tests). UI de Odoo (Studio)
NO implementada esta noche a proposito — eso requiere sesion de staging
con escritura visual, que la regla de esta noche no permite improvisar
sin ese acceso seguro.

## MANUAL_RESERVATION_STATUS

Contrato implementado y probado (3 tests): sin bypass, misma tuberia que
cualquier canal, rechaza sin crear cotizacion/HOLD si la unidad no esta
disponible.

## FINANCIAL_CLOSE_STATUS

Implementado y probado (14 tests) con los 6 casos reales pedidos (Monica,
Daniel, Kevin, Jhon, Blanca, Camilo). Separa explicitamente venta,
estancia, facturacion, cobro, payout y conciliacion. Nunca declara
`unreconciled: 0` sin evidencia bancaria real.

## CAMILO_FIXTURE_STATUS

Completo: `gross_sale = ota_commission + expected_payout` verificado
(150.000 = 27.667,50 + 122.332,50). Los tres cierres diarios (reserva 27,
estancia 28, payout 29) se probaron como objetivamente distintos.

## PAOLA_FIXTURE_STATUS

Completo: simulacion de Casa Completa bloqueando las 5 habitaciones y test
inverso (habitacion suelta bloqueando Casa Completa), ambos con las fechas
y la referencia reales (6634915879). No se toco la reserva real.

## ROOM_201_STATUS

Gate 201 completo de principio a fin, en local: disponible -> HOLD ->
no disponible -> Casa Completa no disponible -> hermanas intactas ->
alternativas correctas -> liberar HOLD -> inventario restaurado. 8/8
fases PASS via `npm run hotel:morning-smoke`.

## CROSS_BLOCKING_STATUS

Confirmado en el modelo Nivel 1 (no en Odoo real esta noche, eso ya estaba
aprobado desde HOTEL-002): Casa Completa <-> las 5 habitaciones, en ambos
sentidos, con el fixture real de Paola y con el caso real de overbooking
ya documentado (Casa Completa + habitacion 302 en Booking).

## CI_STATUS

No se creo pipeline de CI nuevo esta noche (los workflows existentes en
`.github/workflows/` son del sitio Astro, no del gateway/ical; crear uno
nuevo para Node/tests no estaba pedido explicitamente como bloqueante y se
prioriza no exceder alcance). `npm test` en ambos paquetes corre limpio y
puede conectarse a un workflow despues si se pide.

## KNOWN_RISKS

1. Incidente ya declarado antes de esta noche: navegacion accidental a la
   URL de ejecucion de `ir.actions.server` id 1654 (parte de NOBEDS). No
   se repitio ni se investigo mas esta noche (regla explicita de esta
   noche). Ver `AI/ATH-ODOO-HOTEL-008_NOBEDS_MIGRATION.md`.
2. Todo lo de esta noche es LOCAL: el comportamiento real contra Odoo
   STAGING/produccion (timings, mensajes de error exactos, ids reales)
   puede diferir del fixture. `STAGING_EXECUTION_PENDING` en todas las
   fases equivalentes.
3. Los fixtures de Kevin/Jhon/Blanca/Monica no tienen `ota_commission`
   desglosada (el CEO no la entrego) — el cierre gerencial los trata
   correctamente pero no se puede validar la aritmetica venta=comision+payout
   para ellos como si se hizo con Camilo y Paola.

## PRODUCTION_GATES

Ninguno abierto ni tocado esta noche. `NOBEDS` sigue activo, sin cambios.
`Booking`/`Airbnb`/`Odoo produccion`: sin escrituras.

## ROLLBACK

Nada que revertir: todo el trabajo de esta noche vive en archivos nuevos
o en un `package.json` con una linea de script agregada (reversible con
`git revert` del commit, o simplemente ignorando el script nuevo). No se
toco ningun archivo de produccion ni de Odoo real.

## LEVEL1_PERCENT_COMPLETE

Estimado (ver desglose arriba): **~55%** de la Fase de diseño+contrato+test
local del Nivel 1 completa. Falta: ejecucion real contra staging (0%,
bloqueado por falta de sesion seria de esa base), UI de Angela en Odoo
(0%, requiere Studio+staging), conexion real de feeds iCal a Booking/
Airbnb (0%, a proposito no se conecto nada real esta noche), cableado del
flujo web al sitio Astro (0%, capacidad lista, sitio sin modificar).

## EXACT_0800_STEPS

Ver `AI/ATH-ODOO-HOTEL-008_MORNING_TEST.md` para el runbook exacto.
