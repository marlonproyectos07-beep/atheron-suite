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
6. En Ajustes > Técnico > Acciones del servidor, la búsqueda por nombre `HOTEL-017` no devolvió registros. La acción existente `HOTEL v1 — API GATEWAY Sofía (006)` (`/odoo/server-actions/1967?debug=1`), que llama `odoo-adapter.mjs`, **no contiene** ninguna de las cinco ramas `ota_*` requeridas. En el esquema inspeccionado de `planning.slot` (`/odoo/action-20/657?debug=1`) figuran `x_hotel_block_kind` y campos legados; no se observó `x_idempotency_key` o UID OTA en los campos mostrados.
7. Mientras se inspeccionaba STAGING, la rama remota avanzó con rutas, cliente y puerto Gateway para las cinco operaciones. Esas piezas de código no cambian por sí mismas la acción Odoo 1967 ni demuestran despliegue operativo.

## Cinco operaciones OTA

| Operación Gateway | Código de la rama | Odoo STAGING | Evidencia pendiente |
|---|---|---|---|
| `ota_blocks_list` | Ruta, contrato, cliente y puerto presentes | Rama ausente en acción 1967 | Lectura de bloqueos Odoo sin derivados |
| `ota_block_apply` | Ruta, contrato, cliente y puerto presentes | Rama ausente en acción 1967 | Bloqueo técnico único por `idempotency_key`, sin `sale.order` comercial |
| `ota_block_release` | Ruta, contrato, cliente y puerto presentes | Rama ausente en acción 1967 | Release exclusivo del bloqueo propio |
| `ota_snapshot_list` | Ruta, contrato, cliente y puerto presentes | Rama ausente en acción 1967 | Lectura de snapshot durable por canal/unidad |
| `ota_snapshot_put` | Ruta, contrato, cliente y puerto presentes | Rama ausente en acción 1967 | Upsert de snapshot durable con clave única |

`importCalendar()`, `exportCalendar()`, `applyBlock()`, `releaseBlock()` y `reconcile()` existen en el módulo iCal. `normalizeReservation()`, `deduplicate()` y `preventLoop()` son guardas del contrato local. El ledger de `createSyncLedger()` está en memoria. Por ello, un refresco del navegador no prueba durabilidad; se necesita un modelo Odoo/transacción verificable.

## Gate de escritura no superado

Se identificó `x_hotel_ota_feed` como esquema de configuración, pero la acción Gateway 1967 no implementa las cinco operaciones OTA. Tampoco se verificaron un modelo de snapshot durable, unicidad transaccional de `idempotency_key`, ni un release que preserve otros bloqueos. Crear una entrada de planificación genérica no demostraría esas garantías y podría alterar disponibilidad. Conforme a la regla del usuario de detener escrituras ante duda del entorno, no se inició el piloto AHS-302 ni se creó dato comercial.

Para reanudar: respaldar la acción 1967 y verificar los registros de `x_hotel_ota_feed` sin exponer URLs. Implementar en STAGING las cinco ramas Odoo con un modelo de snapshot y restricción única de clave, probar permisos, auditoría durable y relación con inventario. Entonces elegir una ventana AHS-302 libre contra el inventario Odoo, registrar estado anterior, aplicar, comprobar exclusión CASA, repetir idéntica clave, liberar y verificar el estado posterior y la persistencia tras recarga. Antes de **cada** escritura verificar de nuevo el hostname exacto.
