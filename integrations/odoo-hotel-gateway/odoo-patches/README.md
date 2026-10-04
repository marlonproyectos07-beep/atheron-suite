# P0 HOTEL v1: orden hotelera que no entra en Alquileres

Estado: parche **local, no instalado**. Destino exclusivo futuro: `atheron1-hotel-staging-20260923`. No modifica `COT/2026/03827` ni datos reales.

## Evidencia y causa

El respaldo de Odoo del 30/09/2026 muestra que el menú `Hotel v1 → Reservas hotel` (`ir.actions.act_window` 1909) abre `sale.order` con `context={}`. La acción nativa `Create Rental Orders` (985) usa `in_rental_app=1`. El botón `Hotel: CONFIRMAR` llama a la acción de servidor 1899; su código respaldado cambia `x_reservation_status` y llama `action_confirm()`, pero no establece `is_rental_order`, período de alquiler ni `is_rental` en la línea. La automatización de calendario 151 estaba activa en ese respaldo, pero eso no convierte una venta normal en alquiler.

La comparación de `COT/2026/03826` y `COT/2026/03827` fue aportada por el usuario. El valor **actual** de `is_rental_order` de 03827 aún no se leyó; por ello esta es una causa sustentada en el flujo del código, pendiente de confirmación directa en STAGING. El origen `Hotel v1 → Nuevo` es la acción 1909 y el `create` estándar de `sale.order`, no una función del Gateway. El camino de cotización `ir.actions.server/1935` es distinto y queda sin cambios.

## Parche preparado

1. [hotel-v1-reservas-action.json](hotel-v1-reservas-action.json): proponer contexto de alquiler para **nuevas** reservas creadas desde el menú 1909. Mantiene el dominio y vistas existentes.
2. [hotel-v1-confirm-rental.py](hotel-v1-confirm-rental.py): reemplazo propuesto de la acción 1899. Antes de confirmar, exige unidad, fechas, producto rentable, recurso, rol y exactamente una línea del producto de la unidad. Fija `is_rental_order`, `is_rental` y el período con las horas/tz de la propiedad. Reutiliza `action_confirm()` y las automatizaciones existentes; verifica estado interno `rental_status='pickup'` (etiqueta UI **Reservado**) y exactamente un slot publicado ligado a la línea/recurso. Si el slot único conserva el horario legado 12:00–12:00, lo ajusta a 15:00–11:00. Conserva cantidad, precio y descuento pactados; no cambia canal, huésped ni referencia. Cualquier precondición o verificación fallida lanza `UserError` para revertir la transacción.
3. No llama `action_open_pickup` ni `action_open_return`. Recolección es check-in, no la reserva inicial. No crea slots alternativos para ocultar una falla de Alquileres; si no se genera uno, aborta.

## Validación local y límite

`../test/hotel-v1-rental-action.test.py` ejecuta el código Python propuesto con dobles de Odoo; `../test/hotel-v1-rental-patch.test.mjs` comprueba el destino y la exclusión CASA↔habitaciones usando el modelo Nivel 1. Estos tests **no prueban el comportamiento del módulo Enterprise vivo**, el orden de automatizaciones 151/167/169, ni la respuesta actual de 1899. La garantía transaccional y la visibilidad en Planning deben validarse en STAGING.

## Gate de instalación futura en STAGING

Antes de cualquier escritura: terminar C0 con snapshot actual de acciones 1909/1899, automatizaciones 151/167/169, productos/roles/recursos, vistas y configuración de Alquileres; comparar hashes con el respaldo del 30/09. Si 1899 cambió después, fusionar la diferencia con revisión, nunca sobrescribir a ciegas. Guardar copia restaurable de ambos registros. Aplicar solo esas dos acciones en STAGING y probar **una reserva sintética nueva** en una ventana segura: 301 y después CASA, sin tocar 03827. Verificar campos reales `is_rental_order`, `rental_start_date`, `rental_return_date`, línea `is_rental`, `rental_status`, slot único, bloqueo CASA↔habitaciones, precio/canal/huésped/referencia y que Recolección no se usó. Repetir creación/replay para detectar duplicados; revertir las dos acciones si falla. No autorizar Production ni OTA writes por este parche.

`C0_STATUS=PARTIAL`; el parche y los tests no constituyen snapshot vivo ni cierran C0.
