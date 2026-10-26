# Plan de escrituras Smoobu -> Odoo (para autorizacion posterior)

**Estado: NADA de esto esta activo.** `src/reconcile.mjs` solo emite propuestas (`PENDING_APPROVAL`, `writesEnabled:false`). Este documento describe lo que se pediria autorizar.

## Operaciones propuestas (solo dos)
| Operacion | Efecto en Odoo | Modelo |
|---|---|---|
| `CREATE_SLOT` | un `planning.slot` por noche, `role_id` del mapa, `resource_id` si el rol lo exige, clave externa en el campo de texto | `planning.slot` |
| `RELEASE_SLOT` | liberar el turno (archivar/desasignar, a decidir) en reserva cancelada, acortada o cambiada de unidad | `planning.slot` |
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
3. ~~Campo de la clave~~ `name` confirmado (texto, vacio en todos los turnos). `resource_id` no es obligatorio; falta el mapa rol->recurso y el valor de `company_id` (obligatorio).
4. Punto de restauracion en Odoo/Git y autorizacion expresa de Marlon.
5. Ensayo en la base de staging antes de produccion.
6. Reglas 167/169 leidas a nivel de automatizacion (activas, al crear/editar); falta leer el codigo de sus acciones. Crear un turno de habitacion generara un espejo de Casa.
7. Interruptor de apagado (`writesEnabled`) en variable de entorno, apagado por defecto.

## Piloto 161419736 (301, 26-27 oct 2026)
`npm run simulate` produce exactamente un `CREATE_SLOT`: rol 37, 2026-10-26T20:00Z->2026-10-27T16:00Z, clave `SMOOBU-161419736:301:2026-10-26`, contra turnos reales anonimizados de Odoo. La reserva es sintetica; no es una lectura de Smoobu.
