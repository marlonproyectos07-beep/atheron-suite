# ATH-ODOO-HOTEL-012 — Reporte final y handoff

> Base: Odoo **STAGING** `atheron1-hotel-staging-20260923`. **Production no tocada.**
> HOTEL-011 no tocado. Sin merge a `main`.
>
> **Fuente de verdad:** handoff entregado por Marlon (sesión con acceso a Odoo).
> Esta sesión cloud **no tuvo acceso a Odoo** (egress 403, sin credenciales) y
> solo documenta lo recibido: **no verificó nada contra Odoo**. Todo lo de abajo
> es **HECHO según el handoff**, no verificado por esta sesión.

## 1. Estado final

| Elemento | Estado |
|---|---|
| Automatización 1 (Crear Tarea al Confirmar Reserva Atheron Suite) | **DESACTIVADA** |
| Acción 1048 | conservada |
| Vista Orders de Ángela | acción **1508** |
| Lista principal nueva | vista **6834** |
| Acción 1901 (CHECKIN) | intacta |
| Acción 1902 (CHECKOUT) | **ajustada** (ver §4) |
| Schedule, House Keeping Board, Steering | intactos |
| Automatizaciones 17 y 18 | intactas |
| Production | no tocada |

## 2. Tablero de Ángela (vista Orders)

12 columnas: Reserva, Huésped, Unidad, Adultos, Niños, Check-in, Check-out,
Estado reserva, Total, Cobrado, Saldo, Canal.

Filtros:

- **A.** LLEGADAS HOY
- **B.** SALIDAS HOY
- **C.** EN CASA
- **D.** OPERACIÓN DEL DÍA

## 3. Flujos

**CHECKIN** (acción 1901, intacta): `x_reservation_status = checked_in`,
`x_occupancy = occupied`.

**CHECKOUT** (acción 1902, ajustada):

- `checked_out`, `x_occupancy = vacant`
- `x_estado_limpieza = sucia` (nuevo)
- la tarea de House Keeping se **reutiliza por `x_resource_id`**
- etapa **POR LIMPIAR**
- el nombre de la tarea se actualiza a la reserva actual
- sin duplicados

**Housekeeping:** una sola tarea abierta por recurso. Las tareas `1_done` y
`1_canceled` ya no se reutilizan. Flujo aprobado: POR LIMPIAR → EN LIMPIEZA →
LISTA PARA REVISAR → LISTA, con INCIDENCIA como rama lateral; una incidencia
abierta nunca libera sola la unidad (decisión CEO).

## 4. Cambios en la acción 1902 (ORIGINAL → ACTUAL)

1. Añadido: `leaves.mapped('x_role_id').sudo().write({'x_estado_limpieza': 'sucia'})`
2. En `Task.search` se añadió `('state', 'not in', ['1_done', '1_canceled'])`.
3. En `task.write` se añadieron `name` (reserva actual) y `description`
   (`Reserva %s - Unidad %s`).

Snapshots completos: `AI/hotel-012-snapshots/ACTION_1902_ORIGINAL.py` y
`ACTION_1902_CURRENT.py`. Rollback: `AI/ATH-ODOO-HOTEL-012_ROLLBACK_1902.md`.

## 5. QA realizado

- Reserva **COT/2026/03598**, huésped *QA-7C Huésped Uno* (**FICTICIO**), unidad 201, recurso 28.
- Tarea **2296**: cancelada, **no borrada**.
- Tarea **2294**: **reutilizada correctamente**.
- Resultado: una sola tarea abierta de House Keeping para el recurso 28.

## 6. Residuos y riesgos conocidos

- **Residuo QA en STAGING:** tarea 2296 cancelada; COT/2026/03598 en `checked_out`; rol 29 en `sucia`; tarea 2294 en POR LIMPIAR. Son datos de prueba ficticios, sin cliente ni pago real.
- **El rollback de 1902 no deshace los efectos ya producidos:** el rol 29 seguirá `sucia` y la tarea 2294 conservará el nombre actualizado hasta corregirlos a mano.
- El **ajuste de 1902 es una modificación de código de una acción de servidor**: antes de cualquier promoción a Production hay que repetir el QA allí con autorización expresa de Marlon.
- Pendiente de verificar contra Odoo (esta sesión no pudo): que el código vivo de 1902 coincide con el snapshot ACTUAL (`write_date` 2026-10-01 05:20:38).
- Fuera de alcance v1 (decisión CEO): Algarra y Neusa; housekeeping solo Atheron Suite.

## 7. Restricciones respetadas por esta sesión

Sin escrituras en Odoo, sin Production, sin HOTEL-011, sin merge, sin secretos.
