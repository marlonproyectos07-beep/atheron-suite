# ATH-ODOO-HOTEL-017 — Mapping canónico para Booking, Airbnb y Odoo

Estado: inventario confirmado parcialmente, solo lectura. `PENDIENTE_VERIFICACION` significa que no hay un ID probado; no equivale a vacío en la OTA. Odoo STAGING es la autoridad de identidad y disponibilidad.

| Unidad canónica | Odoo STAGING unit_id | Booking hotel_id | Booking room/calendario ID | Airbnb listing_id | Feed export Booking | Feed export Airbnb |
|---|---|---|---|---|---|---|
| AHS-201 | 1 (Gate 014-A) | 16559325 | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION |
| AHS-202 | PENDIENTE_VERIFICACION | 16559325 | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION |
| AHS-203 | PENDIENTE_VERIFICACION | 16559325 | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION |
| AHS-301 | PENDIENTE_VERIFICACION | 16559325 | PENDIENTE_VERIFICACION | 1057232086445101786 | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION |
| AHS-302 | PENDIENTE_VERIFICACION | 16559325 | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION |
| AHS-CASA | PENDIENTE_VERIFICACION | 16569053 | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION; existencia del anuncio sin confirmar | PENDIENTE_VERIFICACION | PENDIENTE_VERIFICACION |

`external_property_id` = Booking `hotel_id` cuando la fuente es Booking. `external_listing_id` = Booking room/calendario ID o Airbnb listing ID, según canal. Para Airbnb no hay `external_property_id` confirmado. `external_reservation_id` proviene del UID iCal recibido, nunca del nombre de la habitación. `odoo_unit_id` usa únicamente el ID verificado en STAGING. El valor de CASA usado en tests (`TEST-ODOO-CASA`) y los listing IDs `TEST-*` son fixtures sintéticos, no mapeo real.

## Registro previsto en STAGING

Por cada par `(source, canonical_unit_id)` se necesita un registro de configuración con `odoo_unit_id`, `odoo_resource_id` verificado, `external_property_id`, `external_listing_id`, dirección de import/export, referencia **segura** al feed de entrada, referencia al feed de salida Odoo, `last_sync_at`, `last_sync_status` y `last_error`. El modelo y menú Odoo concretos aún son `PENDIENTE_VERIFICACION`; Claude Chrome debe identificarlos en solo lectura antes de crear configuración. Ninguna URL de feed debe aparecer en Git.

La URL **de exportación** de Booking/Airbnb es la entrada hacia Odoo. La URL **de exportación** de Odoo sería la entrada en Booking/Airbnb después del gate. El feed de salida de Odoo debe derivarse de la disponibilidad Odoo, incluyendo CASA ↔ habitaciones, no de un inventario paralelo. No se modifica NOBEDS.
