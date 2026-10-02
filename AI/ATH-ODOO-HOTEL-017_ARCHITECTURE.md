# ATH-ODOO-HOTEL-017 — Núcleo Booking + Airbnb + Odoo Nivel 1

Estado: núcleo local sintético. No conectado a Odoo STAGING, Booking ni Airbnb. Production y NOBEDS no tocados.

## Autoridad y flujo

```text
Booking/Airbnb iCal (bloqueos de calendario)
  -> adapter por canal -> normalización -> deduplicación/loop guard
  -> conciliación -> puerto Odoo -> inventario y reglas Odoo
  -> exportCalendar() desde Odoo -> feed iCal por unidad y canal
```

Odoo es la fuente de verdad. El módulo `integrations/odoo-hotel-ical/src/ota-adapters.mjs` reutiliza el parser y exportador iCal de HOTEL-008 y la regla CASA ↔ habitaciones de `inventory-model.mjs`. No usa NOBEDS ni crea un segundo inventario. Un `VEVENT` se trata como **bloqueo de calendario**, no como reserva comercial: iCal no acredita importe, huésped, pago, comisión ni confirmación comercial.

## Contratos ejecutables

- `normalizeReservation(event, context)` devuelve exactamente `source`, `external_property_id`, `external_listing_id`, `external_reservation_id`, `canonical_unit_id`, `odoo_unit_id`, `check_in`, `check_out`, `status`, `source_updated_at`, `idempotency_key`, `correlation_id`. IDs sin verificación permanecen `null`.
- `importCalendar({ical, source, canonical_unit_id, mapping, correlation_id, odoo, ledger, audit})` recibe **texto** iCal; no hace fetch. Rechaza una envoltura iCal inválida y no cancela por desaparición de eventos en un feed posiblemente parcial.
- `exportCalendar({canonical_unit_id, from, to, stamp, odoo, ledger})` obtiene bloques del puerto Odoo y devuelve texto iCal. No publica una URL.
- `applyBlock()` y `releaseBlock()` escriben solo mediante el puerto `odoo` inyectado. El puerto requerido ofrece `listBlocks()`, `applyBlock(reservation)` y `releaseBlock(idempotency_key)`. No existe implementación de red o credenciales en este frente.
- `deduplicate()` elimina duplicados exactos del lote; `preventLoop()` descarta UID generado por el exportador Atheron; `reconcile()` procesa bloqueos y cancelaciones explícitas. `createChannelAdapter('booking'|'airbnb', deps)` fija el canal sin duplicar lógica.
- `audit.record()` recibe operación, canal, unidad, claves de correlación e idempotencia y resultado. No recibe URL de feed, token, huésped ni contenido iCal.

`idempotency_key` es SHA-256 estable de canal + unidad canónica + listing externo conocido + UID iCal; un cambio de fechas conserva la identidad. `correlation_id` permite seguir el evento sin exponer el feed. Las fechas son noches `[check_in, check_out)`. El UID de un bloqueo exportado tiene forma `atheron-<unidad>-<inicio>-<fin>@nivel1.local`; su retorno se clasifica como loop y no genera operación Odoo.

## Seguridad del conflicto y límites

Antes de aplicar, el adapter lee el estado Odoo y comprueba la misma unidad y la exclusión CASA ↔ habitaciones. Un solapamiento de otra fuente produce `CONFLICT`, registra auditoría y deja Odoo intacto. La cancelación busca la clave y fuente originales; nunca libera un bloqueo ajeno. Si falta `odoo_unit_id`, produce `PENDING_MAPPING` sin escritura. Una retirada manual en Odoo frente a un replay conocido produce `ODOO_OVERRIDE` sin recrear el bloqueo.

El ledger en memoria es **solo de pruebas**. Antes de conectar STAGING hace falta un puerto Odoo real con unicidad transaccional por `idempotency_key`, persistencia de revisión/correlación, permisos mínimos, auditoría durable y operación atómica lectura-comprobación-escritura. También falta verificar el modelo Odoo exacto para bloques OTA y el ciclo de cancelación: el Gateway actual no expone `cancel`. No se debe conectar el adapter a ese Gateway como si ya lo soportara.

iCal es periódico, no instantáneo. Frecuencia, TTL y margen de riesgo deben decidirse con evidencia de los feeds reales y del cron STAGING; no se presumen. Una ausencia de VEVENT, un error de fetch o un feed vacío requieren revisión antes de liberar disponibilidad. El texto iCal puede transportar solo bloqueos: no se deben crear `sale.order` comerciales automáticamente a partir de él.

## CHROME_HANDOFF — solo lectura

1. **Booking:** en la Extranet de *Hotel Atheron Suite* (`hotel_id 16559325`), localizar el **enlace de exportación iCal** de cada habitación 201, 202, 203, 301 y 302 y leer el room ID asociado. En *Atheron Grand House / Casa Completa* (`hotel_id 16569053`), localizar el enlace de exportación iCal de Casa y su ID de unidad/calendario. Registrar también qué campo de **importación iCal** recibe la URL de exportación futura de Odoo, sin pegarla ni guardarla todavía.
2. **Airbnb:** localizar el **enlace de exportación iCal** y listing ID de cada anuncio 201, 202, 203, 301 y 302; el único ID ya confirmado es 301 `1057232086445101786`. Verificar si existe anuncio de CASA y, solo si existe, obtener su listing ID y export iCal. Identificar el campo donde se importaría el feed futuro de Odoo, sin modificarlo.
3. Tratar las URLs iCal como secretos de acceso: no copiarlas a chat, issue, commit ni documentación. Registrar los valores solo en el almacén aprobado de STAGING cuando se autorice el gate; aquí se documentan únicamente tipos de URL y estado de verificación.
4. **Odoo STAGING:** identificar primero el modelo/menú real que vincula unidad canónica, recurso/unidad Odoo, canal, property/listing/room ID y feed de entrada/salida. Preparar allí un registro por unidad y canal, separado de NOBEDS; no crear registros ni activar cron hasta verificar el modelo y aprobar el gate. La tabla de `ATH-ODOO-HOTEL-017_MAPPING.md` es la especificación, no evidencia de registro en Odoo.
5. Primera prueba segura: leer un único feed exportado, comprobar `VCALENDAR`, UID, rango `[DTSTART, DTEND)`, estado y presencia de datos sensibles; ejecutar `importCalendar()` sobre un puerto falso y comparar el resultado con una lectura de disponibilidad Odoo STAGING. Sin escritura en Odoo ni OTA.
6. Requiere autorización CEO antes de escribir mapping/feed en Odoo STAGING, activar sincronización/cron, publicar o registrar feeds en Booking/Airbnb, crear/cancelar una reserva real, ejecutar una prueba de disponibilidad real o tocar Production. Mantener NOBEDS activo e intacto hasta un plan de sustitución aprobado.

## Verificación local

`node --test integrations/odoo-hotel-ical/test/*.test.mjs` cubre los casos A–F con puertos falsos. Estas pruebas demuestran lógica local; no certifican sincronización real ni eliminan el riesgo de latencia iCal.
