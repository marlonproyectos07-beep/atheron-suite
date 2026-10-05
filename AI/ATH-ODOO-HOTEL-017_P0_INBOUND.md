# ATH-ODOO-HOTEL-017 — P0 inbound iCal

## Alcance y estado

La fuente de verdad del inventario es Odoo STAGING. `x_hotel_ota_feed` guarda
configuración por canal/unidad; `planning.slot` guarda bloqueos; la acción 1967
del Gateway aplica bloqueos, impone replay y conserva snapshots/auditoría en
`x_hotel_api_log`. No se crean `sale.order` ni huéspedes desde iCal.

El código local P0 está en `integrations/odoo-hotel-ical/src/inbound-importer.mjs`.
`inbound-odoo-feed-store.mjs` lee feeds configurados y escribe únicamente los
campos de última sincronización. `ota-inbound-staging.mjs` es la entrada manual
del piloto Booking/AHS-302, con guardas estrictas de base, host, acción 1967,
unidad canónica AHS-302 y unidad Odoo 5. El Gateway existente es el único
puerto que escribe inventario y snapshots.

## Algoritmo

1. Leer filas de `x_hotel_ota_feed` con `x_inbound_feed_reference` configurado.
2. Validar mapeo y URL HTTPS con host/ruta del canal; no seguir redirecciones,
   tiempo límite de 15 segundos y límite de 2 MB. No registrar la URL ni el
   cuerpo del feed.
3. Parsear VEVENT (UID, DTSTART, DTEND, SUMMARY, DESCRIPTION y STATUS). Un UID
   ausente recibe un hash estable de canal, unidad, fechas y resumen. El hash
   sirve como UID técnico; el contrato `normalizeReservation` de HOTEL-017
   genera la `idempotency_key` usada por la acción 1967.
4. Rechazar un feed corrupto completo. Un mismo UID con ventanas distintas o
   VEVENT superpuestos se ponen en `CONFLICT` sin escribir un bloque. Un
   conflicto con el inventario de Odoo se registra con el snapshot del Gateway.
5. Antes de APPLY guardar `PRE_APPLY`; después, guardar `ACTIVE` o el estado de
   conflicto/revisión. El replay consulta tanto snapshot como bloques de Odoo.
6. `STATUS:CANCELLED` pasa a `CANCELLED_PENDING`; un UID desaparecido pasa a
   `MISSING_PENDING`. Ninguno libera el slot automáticamente en P0.
7. Actualizar `x_last_sync_at`, `x_last_sync_status` y `x_last_error` por feed.
   El procesamiento continúa con los demás feeds si uno falla.

Las operaciones por UID quedan trazadas por `ota_snapshot_put` y
`ota_block_apply` en `x_hotel_api_log`. El resumen del worker contiene conteos
y códigos de error; no contiene URL, UID, nombre de huésped ni texto iCal.

## Ejecución manual y límite de activación

Con variables `ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_ACTION_ID`,
`ODOO_TECHNICAL_USER` y `ODOO_TECHNICAL_SECRET` cargadas **fuera del repo**:

```powershell
npm run hotel:ota-inbound-staging --prefix integrations/odoo-hotel-gateway -- <FEED_ID_BOOKING_302>
```

Antes de ejecutar en vivo se deben confirmar el feed ID, la referencia privada
en la fila Booking 302 y el inventario actual de 302/CASA. Las reservas y
bloqueos manuales existentes pueden hacer que un VEVENT resulte `CONFLICT`;
este caso requiere conciliación humana, nunca sobrescritura automática.

La función `runConfiguredInbound()` está lista para un programador, pero **no
se ha creado ni activado** la acción `ATHERON - Importar iCal OTA` en Odoo.
Odoo Online permite acciones programadas cada 5 minutos y acciones de salida
webhook, pero este proyecto aún no tiene un worker HTTPS autenticado y estable
al que la acción pueda invocar. Crear un cron sin destino funcional produciría
una falsa garantía de sincronización. No se modifica la acción 1967 para
añadir una segunda implementación del importador.

## Pruebas y gates pendientes

Los tests sintéticos cubren parseo, APPLY, replay, UID ausente, conflicto,
solapamiento, cambio de fechas, cancelación/ausencia sin release, URL inválida,
timeout, HTTP error, feed vacío/corrupto, aislamiento por feed y redacción de
secretos. `npm test --prefix integrations/odoo-hotel-ical` y
`npm test --prefix integrations/odoo-hotel-gateway` deben pasar antes de
ejecutar el piloto.

Para cerrar STAGING: (1) cargar la URL Booking 302 en la fila correcta sin
mostrarla en chat/commits; (2) habilitar credenciales técnicas exclusivas de
STAGING para el worker; (3) desplegar un invocador autenticado y verificar que
el cron de Odoo lo llama cada 5 minutos; (4) ejecutar manualmente un primer
ciclo 302, consultar slots/snapshots/logs/estado, repetir y probar ausencia de
doble bloqueo; (5) verificar exclusión CASA y ausencia de cambios comerciales.
No habilitar otras unidades hasta aprobar sus mapeos y feeds.
