# Conciliacion Smoobu -> Odoo por identificadores (ATH-DEV-041)

**Estado: codigo y pruebas listos; NO ejecutado contra produccion** (la clave Odoo del conector no existe desde el 27/10; ver ATH-DEV-039/040).
Solo lectura. No crea, modifica ni borra nada en Odoo ni en Smoobu. `RELEASE_UNLOCKED=false` y `writesEnabled=false` no cambian.

## Que hace
1. **Smoobu**: `GET /api/reservations` paginado (100 por pagina, maximo 10 paginas). Si faltan o cambian `page_count`/`total_items`, se repite un ID, no termina, o el total no cuadra, se detiene: no hay informe parcial.
2. **Odoo** (solo `fields_get` y `search_read`, por `OdooJson2Client`, que rechaza cualquier otro metodo antes de la red):
   `planning.slot` de las seis unidades en la ventana; `sale.order` con `x_pms_reference` escrita o con fechas en la ventana;
   `sale.order.line` y `product.template` de esos pedidos (para saber la habitacion). Tope de resultados = parada.
3. Cruza **solo por identificadores con etiqueta** en `x_pms_reference` (`Smoobu <id>`, `Booking <id>`, `Airbnb <codigo>`) contra el id de Smoobu y su `reference-id`.

## Ventana
`RECONCILE_FROM` / `RECONCILE_TO` (YYYY-MM-DD, noches inclusive, maximo 120). Sin ninguna de las dos: ventana historica 26..27 oct
con exactamente los rangos de Odoo de ATH-DEV-029/033 (prueba de regresion en `test/window.test.mjs`). Con solo una: error.
Smoobu se pide con un dia de margen a cada lado (los extremos de `from`/`to` no estan demostrados) y se filtra por noches en memoria.

## Veredictos
| Veredicto | Significado |
|---|---|
| MATCH | un unico pedido lleva el ID; habitacion y fechas coinciden |
| MISSING_IN_ODOO | ningun pedido lleva el ID y Odoo no tiene ocupacion esas noches |
| CONFLICT | el ID existe pero difieren habitacion, fechas, el otro ID, o el estado (cancelada en un lado) |
| CANCELLED | cancelada en Smoobu y sin pedido vigente en Odoo |
| AMBIGUOUS | varios pedidos con el ID, numero sin etiqueta, ocupacion en Odoo sin ID, pedido compartido o varias habitaciones |

Habitacion, fechas o nombre **nunca** dan un MATCH. Ademas el informe trae: `availabilityRisk` (noches vendidas en Smoobu que Odoo
muestra libres), `smoobuOverbooking` (estancias vigentes que se pisan, incluida Casa Completa contra una habitacion),
`ordersNotReturnedBySmoobu`, y `controlCases` (160965781, 161787956, 160829171). La 160829171 lleva siempre
`manualReview = ALERTA_SOBREVENTA_NO_RESOLVER_AUTOMATICAMENTE`. Carrera 19 se excluye.

## Privacidad
El texto de `x_pms_reference` puede llevar nombres, cedulas o comprobantes: nunca se imprime. Los numeros largos sin etiqueta
solo se comparan en memoria y, si coinciden, el veredicto es AMBIGUOUS. Tampoco se solicitan ni imprimen los nombres libres de
`sale.order`; `x_reservation_status` se usa internamente, pero no se imprime. La salida lleva ids, fechas, codigos y conteos.

## Evidencia local y supuestos no verificados
El respaldo de campos de `sale.order` en `AI/staging-backup` registra `x_pms_reference` como `char`, `x_checkin`/`x_checkout`
como `date`, y `x_booking_source`/`x_reservation_status` como `selection`. `CALIBRACION.md` confirma los roles de las seis
unidades, las fechas UTC y `state` de `planning.slot`; `AUDITORIA-AUTOMATIZACIONES.md` confirma que el Booking Engine cuenta
turnos incluso en `draft`. El lector comprueba con `fields_get` que existan los campos indispensables antes de producir el informe.
Estas evidencias no reemplazan una verificacion nueva de los tipos y relaciones en produccion.

El campo `reference-id` de Smoobu (numero de reserva de la OTA) no se conservo en los fixtures saneados de ATH-DEV-028;
si no viene, el cruce funciona solo con el id de Smoobu. Se presupone que `page_count` y `total_items` estan presentes y son
estables durante la lectura; una respuesta distinta detiene el informe. La correspondencia de `sale.order.line.product_template_id`
con `product.template.planning_role_id` o `default_code` debe confirmarse en produccion; si no se resuelve, la habitacion queda
desconocida y no se declara MATCH. La ocupacion se infiere de los turnos por rol a las 22:00 de Bogota, no de una lectura directa
de `x_availability`; por tanto `availabilityRisk` es una alerta para revisar, no una prueba definitiva de inventario libre.
Se presupone que un `reference-id` de OTA no colisiona entre canales; una correspondencia cruzada por canal requiere revision
humana antes de actuar. La interpretacion de `modification of booking` como estancia vigente sigue siendo una hipotesis
documentada en `src/classify.mjs`.

## Ejecucion (cuando exista la credencial y haya autorizacion)
Actions -> `smoobu-odoo-diagnose` -> Run workflow -> rama de este cambio -> `mode = reconcile-ids`, `from = 2026-10-28`, `to = 2027-01-05`.
Antes, una vez `mode = odoo-auth-readonly` para confirmar HTTP 200 con la clave nueva.
