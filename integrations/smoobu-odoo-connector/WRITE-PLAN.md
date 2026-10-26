# Plan de escrituras Smoobu -> Odoo (para autorizacion posterior)

**Estado: NADA de esto esta activo.** `src/reconcile.mjs` solo emite propuestas (`PENDING_APPROVAL`, `writesEnabled:false`). Este documento describe lo que se pediria autorizar.

## Operaciones propuestas (solo dos)
| Operacion | Efecto en Odoo | Modelo |
|---|---|---|
| `CREATE_SLOT` | un `planning.slot` por noche, `role_id` del mapa, `resource_id` si el rol lo exige, clave externa en el campo de texto | `planning.slot` |
| `RELEASE_SLOT` | solo PROPUESTA (`autoApply:false`, mecanismo por decidir: sin `active`; existen `state` y `x_checkin_state`) en reserva cancelada, acortada o cambiada de unidad | `planning.slot` |
| `UPDATE_SLOT` | solo modo por estancia: propuesta de nuevas fechas para un turno con clave (`autoApply:false`) | `planning.slot` |
Nunca: borrado fisico, edicion de turnos sin clave `SMOOBU-`, escritura en `sale.order`, NOBEDS, tarifas, inventario ni automatizaciones 167/169.

## Clave externa e idempotencia
`SMOOBU-<reserva>:<unidad>:<noche>` en `planning.slot.name` (campo a confirmar con `fields_get`; configurable con `keyField`). Conciliar dos veces seguidas da cero propuestas (probado). Turnos duplicados con la misma clave se reportan y no se tocan.

## Reglas de seguridad ya codificadas
- Turno ajeno (sin clave) en el mismo rol y noche, o en roles cruzados con Casa Completa -> **conflicto, no se crea**.
- Dos reservas de Smoobu en la misma unidad/noche, o fisica + Casa -> conflicto interno, no se crea.
- Casa Completa = un turno en rol 69; no se generan turnos en las fisicas (las reglas existentes de Odoo se respetan; sus turnos espejo no cuentan como conflicto de la propia Casa).
- Carrera 19 (3567496) y apartamentos fuera del mapa se ignoran con motivo.
- Turnos con clave de reservas fuera de la ventana consultada -> advertencia, no se liberan.

## Antes de la primera escritura (puertas)
1. Smoobu API autenticada (hoy 401): sin lectura real no hay reservas reales que conciliar.
2. ~~Calibrar horario~~ HECHO (15:00->11:00 Bogota, ver `CALIBRACION.md`). Pendiente: decidir turno por noche vs por estancia.
3. ~~Campo de la clave, recurso y compania~~ HECHO: `name`; recursos 28/29/30/31/32/79; `company_id` 5 (ver `CALIBRACION.md`).
4. Punto de restauracion en Odoo/Git y autorizacion expresa de Marlon.
5. Ensayo en la base de staging antes de produccion.
6. ~~Reglas 167/169~~ LEIDAS (acciones 1853/1855): exigen `state='published'`, omiten el espejo ante cualquier solape. Crear un turno de habitacion publicado genera un espejo de Casa del mismo intervalo.
6b. Granularidad: se mantiene un turno por noche; el modo por estancia queda disponible pero bloqueado ante `AUTOMATION_169_MIRROR_GAP`.
7. Interruptor de apagado (`writesEnabled`) en variable de entorno, apagado por defecto.

## Piloto 161419736 (301, 26-27 oct 2026)
`npm run simulate` produce exactamente un `CREATE_SLOT`: rol 37, 2026-10-26T20:00Z->2026-10-27T16:00Z, clave `SMOOBU-161419736:301:2026-10-26`, contra turnos reales anonimizados de Odoo. La reserva es sintetica; no es una lectura de Smoobu.


## Actualizacion ATH-DEV-014
- Operaciones adicionales **solo propuestas**: `COVER_CASA_GAP` (bloqueada hasta staging). `RELEASE_SLOT` y `UPDATE_SLOT` llevan `autoApply:false`; las liberaciones salen `BLOCKED_UNTIL_STAGING_PROOF`.
- Lista minima de pruebas previas a produccion: `STAGING-TESTS.md`.
- Ninguna escritura esta activa; no hay credencial de escritura configurada.


## Actualizacion ATH-DEV-015
- Staging inexistente (HTTP 404) y sin credenciales separadas: **ninguna prueba con escrituras se ejecuto**. La guardia `assertStagingWriteTarget` exige base y host de staging autorizados, credencial distinta de la de produccion e interruptor explicito.
- Esquema de produccion verificado (`PRODUCTION_SCHEMA`): sin `x_hotel_block_kind`; `x_channel` sin valor smoobu; `x_bloqueo_ref` char escribible. El motor no envia canal ni tipo de bloque.
- Nueva puerta: leer el codigo de las automatizaciones que se disparan al crear un turno (12, 22, 55, 157, 158, 164, 168, 170, 171) antes de cualquier escritura.


## Actualizacion ATH-DEV-016
- Auditoria completa de automatizaciones y crons: `AUDITORIA-AUTOMATIZACIONES.md`. **Draft y cancelled no liberan** (Booking Engine y iCal los ignoran); borrar es la unica via nativa y arrastra espejos. La liberacion automatica sigue prohibida y bloqueada.
- `UPDATE_SLOT` (solo modo por estancia, ya desactivado) queda `BLOCKED_STALE_MIRROR_RISK`: 167/169 no actualizan espejos.
- Puertas nuevas antes de cualquier escritura de produccion: decision sobre la clave visible en el .ics publico, decision anti-eco (el turno llega a las OTAs en <= 5 min por el cron 147) y staging aislado segun `STAGING-PLAN.md`.
