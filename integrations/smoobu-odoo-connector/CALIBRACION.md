# Calibracion con datos reales de Odoo (ATH-DEV-011)

Fuente: lectura de solo lectura del 2026-10-26 ([ejecucion 40395212812](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40395212812)), JSON-2 autenticado, `fields_get` + `search_read`. Salida anonimizada. Cero escrituras. Smoobu no se consulto.

## Campos de `planning.slot` confirmados
| Campo | Tipo | Obligatorio | Observacion |
|---|---|---|---|
| `name` | text | no | **vacio en los 409 turnos**: apto para la clave `SMOOBU-...` |
| `role_id` | many2one planning.role | no | |
| `resource_id` | many2one resource.resource | **no** | pero los 409 turnos lo tienen asignado |
| `start_datetime` / `end_datetime` | datetime (UTC) | no | |
| `company_id` | many2one | **si** | unico obligatorio sin valor por defecto evidente |
| `x_nobeds_id` | char | no | campo de NOBEDS; el motor no lo toca |
| `active` | — | **no existe** | no hay archivado: "liberar" requiere decision |
Obligatorios segun `fields_get`: `company_id`, `repeat_unit`, `access_token` (los dos ultimos con valor por defecto en Odoo).

## Convencion horaria real
- 409 turnos de los seis roles desde 2026-07-01: **todos** empiezan 20:00 UTC (15:00 Bogota) y terminan 16:00 UTC (11:00 Bogota). Los 26 recursos tienen `America/Bogota`.
- Duraciones: 20 h (346), 44 h (44), 68 h (11), 92 h (1), 236 h (6), 332 h (1).
- Codigo corregido: ventana de noche 15:00 -> 11:00 del dia siguiente (antes suponia 00:00-24:00).

## Turnos observados 25-28 oct 2026 (ventana del piloto)
Rol 37 (301): **ninguno**. Rol 29 (201): 24->25, 25->26, 26->27. Rol 18 (302): 23->25, 26->27. Rol 19 (202): 23->25. Rol 30 (203): turno largo 18 oct -> 1 nov. Casa (69): 24->25, 25->26, 26->27. Fixture anonimizada: `fixtures/real-calibration-2026-10-26.json`.

## Reglas 167/169 (solo lectura, no editadas)
`base.automation` 167 "ATHERON - Casa Completa bloquea Habitaciones" y 169 "ATHERON - Habitacion bloquea Casa Completa": activas, disparo al crear o editar `planning.slot`, con dominio. Los turnos de Casa en 24->25, 25->26 y 26->27 coinciden exactamente con turnos de 201: son **espejos** de la regla 169.
Efecto en el motor: un turno de Casa con la habitacion destino libre ya no es conflicto (advertencia `CASA_SLOT_TREATED_AS_MIRROR`); si las otras cuatro fisicas tambien estan ocupadas se trata como reserva real de Casa y SI es conflicto.
**Limitacion:** el codigo de las acciones del servidor enlazadas no se leyo (la consulta por id 167/169 en `ir.actions.server` devolvio una accion ajena, "Delete Selection", sin relacion). Falta leer `base.automation.action_server_ids`.

## Resultado del piloto con datos reales
Reserva 161419736 (301, 26->27 oct): **exactamente un** `CREATE_SLOT` en rol 37, 2026-10-26T20:00Z -> 2026-10-27T16:00Z, clave `SMOOBU-161419736:301:2026-10-26`, `resourceIdPending: true`, sin conflictos. Idempotente tras aplicar (probado). El turno de Casa 39648 de esa noche se interpreta como espejo de 201/302.

## Discrepancias y decisiones pendientes
1. **Un turno por noche vs historico:** la directriz dice un turno por noche; los datos muestran estancias largas como un unico turno (63 de 409 duran mas de 20 h). No se puede saber con esta lectura si los de 20 h son noches sueltas o estancias de una noche. Decidir: mantener una por noche (actual) o un turno por estancia.
2. **`resource_id`:** no obligatorio pero siempre presente. Falta el mapa rol -> recurso (la proxima lectura de calibracion ya lo emite en `roleResources`; no se volvio a ejecutar).
3. **Liberar turnos:** no existe `active`; definir si "liberar" borra, desasigna o cambia `state` (valores de `state` pendientes de leer).
4. **Ver codigo de las acciones ligadas a las reglas 167/169** antes de crear el primer turno: crear un turno de 301 dispara la regla 169 y generara un espejo en Casa.
