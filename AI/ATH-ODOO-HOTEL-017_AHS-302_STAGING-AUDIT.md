# ATH-ODOO-HOTEL-017 — auditoría controlada AHS-302 en Odoo STAGING

Fecha: 2026-10-02 (America/Bogota). Estado: **NO READY**. Inspección de solo lectura. No se aplicó bloqueo, replay ni release en Odoo.

## Alcance y entorno

- Host verificado en la barra/URL del navegador integrado: `atheron1-hotel-staging-20260923.odoo.com`.
- Banner Odoo: base de datos neutralizada para pruebas.
- Rama local: `feature/ath-odoo-hotel-017-booking-airbnb-level1`; base inspeccionada `6c0be1f`.
- No se abrió Production, Booking, Airbnb ni NOBEDS. No se tocaron tarifas o reservas comerciales.

## Evidencia de identidad y relación

1. `https://atheron1-hotel-staging-20260923.odoo.com/odoo/action-1911/5`: ficha `302`, modelo `x_hotel_unit`, ID `5`, propiedad `HOTEL ATHERON SUITE`, recurso `302 La magia - Baño privado`, relación `Unidades compuestas que la contienen: CASA COMPLETA`.
2. `https://atheron1-hotel-staging-20260923.odoo.com/odoo/action-1911/5/m-x_hotel_unit/6`: ficha `CASA COMPLETA`, modelo `x_hotel_unit`, ID `6`, `Unidades hijas: 201, 202, 203, 301, 302`.
3. Hotel v1 ofrece Reservas hotel, Propiedades y Unidades. Reservación ofrece planificación y disponibilidad; también muestra NOBEDS, que no se abrió.
4. En Ajustes > Técnico > Modelos, `x_hotel_ota_feed` (`/odoo/action-20/2532?debug=1`) existe como objeto personalizado HOTEL-017. Tiene campos `x_canonical_unit_id`, `x_odoo_unit_id`, `x_odoo_resource_id`, `x_source`, IDs externos, referencias de feeds y `x_last_sync_*`. Es configuración; la ficha del modelo no demuestra un flujo APPLY/RELEASE ni snapshot de bloqueos.
5. `x_hotel_api_log` (`/odoo/action-20/2528?debug=1`) tiene `x_idempotency_key`, `x_correlation_id`, `x_operation`, `x_result`, `x_source_channel`, `x_unit_id` y timestamp. Su existencia no prueba que HOTEL-017 escriba allí. `x_hotel_api_lock` solo muestra nombre, último bloqueo y usuario API; no se verificó una clave OTA única.
6. En Ajustes > Técnico > Acciones del servidor, la búsqueda por nombre `HOTEL-017` no devolvió registros. En el esquema inspeccionado de `planning.slot` (`/odoo/action-20/657?debug=1`) figuran `x_hotel_block_kind` y campos legados; no se observó `x_idempotency_key` o UID OTA en los campos mostrados. Estos resultados delimitan lo verificado, sin afirmar ausencia en toda la base.

## Cinco operaciones OTA

| Operación | Código local | Odoo STAGING | Evidencia pendiente |
|---|---|---|---|
| `importCalendar()` | Implementada, pruebas sintéticas | Modelo de configuración identificado; flujo no verificado | Ruta de ingreso segura, mapping y persistencia |
| `exportCalendar()` | Implementada, pruebas sintéticas | Modelo de configuración identificado; feed no verificado | Feed derivado de Odoo, sin publicación OTA real |
| `applyBlock()` | Implementada sobre puerto inyectado | No verificada | Bloqueo técnico único por `idempotency_key`, sin `sale.order` comercial |
| `releaseBlock()` | Implementada sobre puerto inyectado | No verificada | Release exclusivo del bloqueo propio |
| `reconcile()` | Implementada, pruebas sintéticas | Log genérico identificado; uso OTA no verificado | Conflictos auditables y Odoo como autoridad |

`normalizeReservation()`, `deduplicate()` y `preventLoop()` son guardas del contrato local. El ledger de `createSyncLedger()` está en memoria. Por ello, un refresco del navegador no prueba durabilidad; se necesita un modelo Odoo/transacción verificable.

## Gate de escritura no superado

Se identificó `x_hotel_ota_feed` como esquema de configuración, pero no se identificaron de forma verificable la acción Odoo de bloqueo OTA, la ubicación del snapshot durable, la unicidad transaccional de `idempotency_key`, ni el mecanismo de release que preserve otros bloqueos. Crear una entrada de planificación genérica no demostraría esas garantías y podría alterar disponibilidad. Conforme a la regla del usuario de detener escrituras ante duda del entorno, no se inició el piloto AHS-302 ni se creó dato comercial.

Para reanudar: verificar los registros de `x_hotel_ota_feed` sin exponer URLs, localizar o implementar la acción/puerto HOTEL-017 y comprobar permisos, unicidad, auditoría durable y relación con inventario. Si no existe un mecanismo durable, implementarlo con pruebas y respaldo antes del piloto. Entonces elegir una ventana AHS-302 libre contra el inventario Odoo, registrar estado anterior, aplicar, comprobar exclusión CASA, repetir idéntica clave, liberar y verificar el estado posterior y la persistencia tras recarga. Antes de **cada** escritura verificar de nuevo el hostname exacto.
