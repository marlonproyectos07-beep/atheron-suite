# ATH-ODOO-HOTEL-009 — Handoff (2026-09-29)

> Tablero operativo + reserva manual + control gerencial, sobre
> `atheron1-hotel-staging-20260923` exclusivamente. Continua HOTEL-008
> (APROBADO, ver `AI/ATH-ODOO-HOTEL-008_FINAL_APPROVED.md`). Nada de
> produccion, Booking, Airbnb, NOBEDS, WhatsApp real, Meta, DIAN se toca
> en este gate.

## Fase 0 — hecho

- HOTEL-008 documentado como PASS: `AI/ATH-ODOO-HOTEL-008_FINAL_APPROVED.md`
  (commit final 765ac45, arquitectura E2E, 3 bugs corregidos,
  restricciones de produccion respetadas).
- Este archivo es el handoff/estado vivo de HOTEL-009.

## Fase 1 — auditoria operativa de STAGING (parcial, ver bloqueo abajo)

### Lo que YA se confirma con evidencia real (sin inventar nada)

Del propio Gateway (`/hotel/availability`, probado en vivo contra Odoo
STAGING en HOTEL-008), la respuesta real trae por unidad:

```
property_id, property_name, unit_id, nombre, estado
(disponible/no_disponible), capacidad_comercial,
requires_manual_confirmation
```

Inventario piloto confirmado (ver tambien
`AI/ODOO_HOTEL_PROMOTION_MANIFEST.md`, fila 7, y el mapeo ya usado en
codigo `UNIT_ID_MAP`):

| Unidad | unit_id | property | capacidad_comercial (visto en vivo) |
|---|---|---|---|
| 201 | 1 | HOTEL ATHERON SUITE | 2 |
| 202 | 2 | HOTEL ATHERON SUITE | 4 |
| 203 | 3 | HOTEL ATHERON SUITE | 4 |
| 301 | 4 | HOTEL ATHERON SUITE | 7 |
| 302 | 5 | HOTEL ATHERON SUITE | 3 |
| CASA COMPLETA | 6 | HOTEL ATHERON SUITE | 22 |

(Nota: la misma consulta tambien devuelve `CASA COMPLETA` de otras dos
propiedades -- `CASA ALGARRA` unit_id 7 y `CASA NEUSA` unit_id 8 -- que
no son parte del piloto de este gate, documentado por si acaso.)

Del gate4/inverse-gate ya probados (HOTEL-002, HOTEL-008A): el bloqueo
cruzado Casa Completa <-> habitaciones **ya existe y funciona dentro de
Odoo** (accion 1967) -- no hay que reconstruirlo, solo consumirlo desde
la UI nueva.

### Lo que NO se pudo auditar todavia (bloqueo real, ver abajo)

El contrato del Gateway (`availability/quote/hold/status`) es
deliberadamente de minimo privilegio y NO expone:

- modelos/campos internos de Odoo (nombres de tabla, vistas existentes);
- si existe ya un modelo de huesped/contacto (`res.partner` u otro)
  enlazado a la reserva;
- si existe ya un campo de origen/canal, anticipo/saldo, o si hay que
  crearlo;
- grupos/permisos mas alla de los ya documentados (148 Aprobador
  comercial, 149 Hotel v1 / API Sofia);
- acciones automatizadas mas alla de las ya inventariadas en
  `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md`.

`AI/ODOO_HOTEL_PROMOTION_MANIFEST.md` ya deja escrito (seccion 4, "NO
CONFIRMADO") que ni esta sesion ni el usuario tecnico Sofia STAGING
tienen acceso a **Ajustes > Tecnico > Personalizaciones de Studio** --
eso sigue siendo cierto hoy, nada cambio en HOTEL-008.

## BLOQUEO REAL PARA FASE 1 (profunda) / FASE 2-4 / FASE 7

Construir el tablero de Angela, la reserva manual y el tablero gerencial
**dentro de Odoo** (vistas, calendario, lista operativa) requiere
interactuar con la interfaz web de Odoo directamente (tipo Studio o
vistas nativas), lo cual necesita:

1. Una sesion de navegador autenticada contra
   **`atheron1-hotel-staging-20260923`** (staging, NO produccion
   "atheron1") -- hoy no hay ninguna pestana abierta (`tabs_context_mcp`
   confirma: sin grupo de pestanas activo).
2. Un usuario con permisos suficientes para crear/editar vistas
   (idealmente admin en esa base especifica, o Studio habilitado) --
   el unico usuario tecnico documentado (Sofia API STAGING, grupo 149)
   es deliberadamente de minimo privilegio y NO tiene esto.

Esto encaja exactamente con la regla de autonomia del propio CEO:
"Detente unicamente ante: ... credencial que solo Marlon pueda
proporcionar." No es un bloqueo tecnico que pueda resolver programando
mas: es acceso que no existe en este entorno todavia.

**Lo que SI se avanzo sin ese acceso** (Fase 5 parcial y Fase 6
completa) esta abajo.

## Fase 5 (parcial) — modelo de datos gerencial, listo para conectar

Reutilizando integramente `integrations/odoo-hotel-gateway/src/
financial-model.mjs` y `angela-read-model.mjs` (ya construidos y
probados en HOTEL-008 nocturno): el CONTRATO de datos que responde a
las preguntas gerenciales (venta hoy, cobrado hoy, ocupacion, quien
llega/sale, canal) ya existe y esta probado (14+5 tests). Lo que falta
es la FUENTE real: hoy corre sobre fixtures; conectarlo a `sale.order`
real de Odoo es directo una vez haya sesion STAGING para confirmar el
modelo real (Fase 1 profunda).

## Fase 6 — contrato WhatsApp/IA (HOTEL-010), completo

Ver `AI/ATH-ODOO-HOTEL-010_WHATSAPP_CONTRACT.md`. Documentado, NO
activado. Reutiliza integramente el Gateway de HOTEL-007/008 (mismo
contrato `availability/quote/hold/status`, mismo `alternatives-engine`,
mismo `sofia-adapter`), sin inventar nada nuevo.

## Actualizacion 2026-09-29 -- turno autonomo (PROMPT MAESTRO)

Mientras la Fase 1 profunda seguia bloqueada por falta de sesion Odoo
STAGING, se avanzo todo lo que no requiere esa sesion (regla de
bloqueo del propio CEO: un frente bloqueado no detiene el turno):

- **Frente A (diseno UX "modo Angela")**: completo, ver
  `AI/ATH-ODOO-HOTEL-009_ANGELA_UX.md` -- colores/estados (reutilizando
  `ANGELA_STATUSES`, ninguno inventado), layout HOME, cards por unidad,
  evaluacion Kanban/Calendario/Lista/Cards/Dashboard.
- **Frente C (read-model operativo)**: completo y probado,
  `integrations/odoo-hotel-gateway/src/operational-read-model.mjs` (14
  tests) -- TODAY/ARRIVALS/DEPARTURES/IN_HOUSE/HOLDS/PAYMENT_PENDING/
  UPCOMING/AVAILABLE.
- **Frente D (tablero gerencial)**: completo y probado,
  `salesByChannel`/`salesByUnit`/`adr`/`managerDashboard` en
  `financial-model.mjs` (9 tests nuevos).
- **Frente B + E (reserva manual + prueba reina)**: diseno completo,
  ver `AI/ATH-ODOO-HOTEL-009_RESERVA_MANUAL.md`; arnes anti-overbooking
  SIMULADO y probado (`anti-overbooking-harness.mjs`, 6 tests) --
  encontro que el Gateway real NO tiene operacion de cancelacion (ver
  ese documento).
- **Frente F (Casa Completa <-> habitaciones)**: cubierto por los
  tests ya existentes de `odoo-hotel-ical` (28) mas el caso explicito
  de Casa Completa dentro del arnes anti-overbooking.
- **Frentes G-L (WhatsApp/IA de laboratorio)**: completos y probados,
  ver la actualizacion 2026-09-29 en
  `AI/ATH-ODOO-HOTEL-010_WHATSAPP_CONTRACT.md` -- motor conversacional,
  adaptadores de herramientas, handoff humano, eventos de
  observabilidad, simulador (10/10 casos PASS).
- **Frente M (tests adicionales)**: cubiertos por los tests de los
  puntos anteriores mas los ya existentes del Gateway (idempotencia,
  rate limit, contrato, forma de respuesta desconocida/malformada,
  reintentos) -- no se repite lo que ya estaba probado en HOTEL-007/008.

Suite completa del Gateway: **227/227 tests PASS** (167 antes de este
turno + 60 nuevos).

## Frente O -- bloqueo real para Marlon (una sola accion)

Todo lo de arriba se pudo avanzar SIN tocar Odoo. Lo que sigue
bloqueado (Fase 1 profunda, Fase 2-4/7: construir la UI real, conectar
el read-model a datos reales) necesita **una sola cosa** de Marlon:

> **Abrir, en una pestana de Chrome, una sesion iniciada contra Odoo
> STAGING (`atheron1-hotel-staging-20260923`, NO produccion "atheron1"),
> con un usuario que tenga acceso a Studio/vistas.**

Con esa sesion se completa la Fase 1 profunda y se puede empezar a
construir la UI real (Frente A/B) directamente sobre lo ya diseñado y
probado en este documento y en `AI/ATH-ODOO-HOTEL-009_ANGELA_UX.md` /
`AI/ATH-ODOO-HOTEL-009_RESERVA_MANUAL.md`.
