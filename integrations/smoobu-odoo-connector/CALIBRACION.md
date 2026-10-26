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

## Discrepancias y decisiones pendientes (de ATH-DEV-011; resueltas abajo)
1. **Un turno por noche vs historico:** la directriz dice un turno por noche; los datos muestran estancias largas como un unico turno (63 de 409 duran mas de 20 h). No se puede saber con esta lectura si los de 20 h son noches sueltas o estancias de una noche. Decidir: mantener una por noche (actual) o un turno por estancia.
2. **`resource_id`:** no obligatorio pero siempre presente. Falta el mapa rol -> recurso (la proxima lectura de calibracion ya lo emite en `roleResources`; no se volvio a ejecutar).
3. **Liberar turnos:** no existe `active`; definir si "liberar" borra, desasigna o cambia `state` (valores de `state` pendientes de leer).
4. **Ver codigo de las acciones ligadas a las reglas 167/169** antes de crear el primer turno: crear un turno de 301 dispara la regla 169 y generara un espejo en Casa.


---
# Segunda calibracion (ATH-DEV-012)
Fuente: [run 40396965541](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40396965541), lectura de solo lectura (`fields_get`, `search_read`). Sin escrituras, sin Smoobu.

## Mapa tecnico verificado rol -> recurso (6 unidades)
| Unidad | Rol | Recurso | Nombre del recurso (tipo material) | Turnos que lo usan |
|---|---|---|---|---|
| 201 | 29 | 28 | 201 La magia - Bano compartido | 69 |
| 202 | 19 | 29 | 202 La magia - Bano compartido | 58 |
| 203 | 30 | 30 | 203 La magia - Bano privado | 64 |
| 301 | 37 | 31 | 301 La magia - Habitacion Suite | 63 |
| 302 | 18 | 32 | 302 La magia - Bano privado | 65 |
| Casa | 69 | 79 | Casa Completa - La Magia de Zipaquira | 90 |
`planning.role.resource_ids` coincide con el recurso de los turnos de cada rol. `company_id` de todos los turnos: **5 (ATHERON S.A.S)**. Codificado en `src/odoo-facts.mjs`.

## Mecanismos de estado en `planning.slot` (no usados)
Sin `active`. `state` = draft|published (los 409 estan `published`). Campo propio `x_checkin_state` = pending|confirmed|checked_in|checked_out|cancelled. `sale_order_state` (solo lectura) indica enlace con pedido de venta. Cualquier "liberar" queda como propuesta `autoApply:false`, mecanismo por decidir.

## Reglas 167/169: codigo real de las acciones enlazadas (ir.actions.server 1853 y 1855)
- Disparo: al crear/editar `planning.slot` con dominio `x_bloqueo_ref = False` y `state = 'published'`. **Un turno en borrador no genera espejos.**
- 1855 (habitacion -> Casa): si el rol es de habitacion publicada, crea un turno en Casa con el MISMO inicio/fin y `x_bloqueo_ref = id origen`, **salvo que Casa tenga cualquier turno solapado** (`start < fin y end > inicio`).
- 1853 (Casa -> habitaciones): crea un turno por cada una de las otras habitaciones, mismo intervalo, **salvo que esa habitacion ya tenga cualquier turno solapado**.
- Los espejos llevan `x_bloqueo_ref`; las reservas reales no. El motor usa esa marca (`mirror`) cuando se lee.

## Evidencia sobre un turno por estancia
Datos: de 52 turnos de habitacion de 2+ noches, **solo 27 tienen un turno de Casa que los cubra entero** (25 exactos); en los de 1 noche cubren 262 de 267. 90 de 90 turnos de Casa estan cubiertos por una habitacion.
Mecanismo: como la regla omite el espejo ante CUALQUIER solape, una estancia de varias noches que solape un espejo parcial ya existente deja noches de Casa Completa libres (riesgo de sobreventa de la casa). Por noche, cada turno de una noche libre genera su espejo exacto.
Reproduccion con datos reales (prueba `INCOMPATIBILIDAD con la regla 169`): 301 del 26 al 29 oct solapa el espejo 39648 (26->27) -> noches 27 y 28 de Casa quedarian sin bloquear.

## Decision tecnica (regla del punto 8)
- **Se conserva el funcionamiento actual: un turno por noche (predeterminado).**
- El modo por estancia (`granularity: 'stay'`) esta implementado y probado, **no es el predeterminado**: solo propone cuando ningun turno de Casa solapa la estancia o cuando Casa ya la cubre entera; si no, devuelve el conflicto `AUTOMATION_169_MIRROR_GAP`. Cambiarlo como norma exigiria modificar la regla 169 (cubrir en lugar de omitir ante solape), lo cual no esta autorizado.
- Las estancias historicas largas (44-332 h) existen como un solo turno; la ausencia de espejo completo en la mitad de ellas es el sintoma de esta misma brecha.

## Parametros que debe llevar un turno propuesto
`role_id`, `resource_id` del mapa, `company_id: 5`, `state: 'published'` (imprescindible para que las reglas actuen), `start/end` 15:00 -> 11:00 Bogota (20:00Z -> 16:00Z), `name` = clave externa, sin `x_bloqueo_ref`.


---
# Blindaje (ATH-DEV-014): mirada de seguridad del motor

## Deteccion de bloqueo incompleto (modo por noche, predeterminado)
- Habitacion -> Casa (regla 169): la regla omite el espejo si Casa tiene CUALQUIER turno solapado. El motor calcula los tramos de la noche que Casa no cubre (`casaMirrorGap`) y **rechaza la noche** con `MIRROR_GAP_CASA`.
- Casa -> habitaciones (regla 167): igual con una habitacion con solape diminuto: `MIRROR_GAP_ROOM`.
- Una noche rechazada no genera propuesta; las demas noches de la misma reserva si.
- El modo por estancia esta **bloqueado** (`STAY_MODE_DISABLED`) salvo `allowStayMode:true`, solo para estudio.

## Alternativa segura sin modificar la regla (`coverGaps`, apagada por defecto)
Turno propio de Casa (rol 69, recurso 79, compania 5, publicado) que cubre exactamente el tramo omitido, con `x_bloqueo_ref` no vacio para que las reglas no lo procesen. Clave `SMOOBU-<reserva>:COVER<n>:<noche>`. Sale como `COVER_CASA_GAP` con estado `BLOCKED_UNTIL_STAGING_PROOF`: hace falta demostrar en staging que `x_bloqueo_ref` es escribible, que 167/169 no se disparan y que el motor 1914 lo cuenta como ocupado. Con un simulador fiel del codigo de las acciones 1853/1855 la prueba demuestra que, con la cobertura, no queda ninguna noche sin bloquear.

## Politica propuesta de cancelacion
1. Solo se propone liberar turnos **propios** (clave `SMOOBU-`). Los ajenos, los espejos de otros y los turnos con clave duplicada **nunca**.
2. Jamas con `checked_in` o `checked_out`.
3. Si el turno tiene espejos dependientes (`x_bloqueo_ref` = su id) se listan, se avisa si estan **compartidos** con otra habitacion, y **no se liberan automaticamente**: revision manual.
4. Mecanismo de liberacion sin decidir (`state=draft` y `x_checkin_state=cancelled` evaluados: NO demostrados, ver `RELEASE_MECHANISM_ANALYSIS`). Mientras `RELEASE_UNLOCKED=false`, toda liberacion es `BLOCKED_UNTIL_STAGING_PROOF` y `autoApply:false`.
5. Cancelacion de reserva con turnos de cobertura propios: se proponen liberar tambien (bloqueadas igual).

## Riesgo residual
- Smoobu en 401: el motor no ha procesado reservas reales.
- `x_hotel_block_kind`/`x_channel`: sin leer; si el motor 1914 solo cuenta ciertos tipos de bloque, un turno sin ellos no cerraria la oferta (prueba 3 de staging).
- Los espejos de la regla 169 sobreviven a la liberacion del turno origen y pueden quedar compartidos.
- El simulador de reglas de las pruebas replica el codigo leido, no el comportamiento real de Odoo.
- Horario 15:00-11:00 verificado en 409 turnos pero no impuesto por Odoo.
