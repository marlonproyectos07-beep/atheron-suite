# ATH-ODOO-HOTEL-017 — Operaciones que faltan en el Hotel Gateway

Estado de cierre al 2026-10-02: la rama HOTEL-017 y la acción Odoo STAGING 1967 (`HOTEL v1 — API GATEWAY Sofía (006)`) contienen las cinco operaciones OTA. `status`/`hold` no sirven de sustituto: un VEVENT es un bloqueo de calendario, no un HOLD comercial. El puerto `integrations/odoo-hotel-ical/src/gateway-odoo-port.mjs` desempaqueta la respuesta anidada de 1967 y falla cerrado ante errores internos.

## Contratos Gateway y backend Odoo validados en STAGING

| Ruta | Operación | Entrada | Salida | Efecto en Odoo STAGING |
|---|---|---|---|---|
| `POST /hotel/ota/blocks/list` | `ota_blocks_list` | `property_id` | `blocks[]` con `canonical_unit_id`, `check_in`, `check_out`, `status`, `source`, `idempotency_key` | Solo lectura de `planning.slot` publicados de las 6 unidades, **excluyendo** `x_hotel_block_kind = derived` (el efecto CASA lo calcula `inventory-model.mjs`). `source` = `x_channel` o `odoo`. |
| `POST /hotel/ota/blocks/apply` | `ota_block_apply` | `idempotency_key`, `source`, `canonical_unit_id`, `odoo_unit_id`, `external_uid`, `check_in`, `check_out`, `correlation_id` | `slot_id`, `replay` | Crea o actualiza un `planning.slot` `x_hotel_block_kind = external`. Unicidad transaccional por `idempotency_key`. No crea `sale.order`. |
| `POST /hotel/ota/blocks/release` | `ota_block_release` | `idempotency_key` | `released` | Borra **solo** el slot con esa clave y `kind = external`; `NOT_FOUND` si no existe. La automatización de Odoo retira el derivado de CASA. |
| `POST /hotel/ota/snapshot/list` | `ota_snapshot_list` | `source`, `canonical_unit_id` | `entries[]` | Lee el snapshot durable. |
| `POST /hotel/ota/snapshot/put` | `ota_snapshot_put` | `entry` | — | Upsert por `(source, canonical_unit_id, idempotency_key)`. |

Campos del snapshot (`reconcileSnapshot`): `idempotency_key`, `source`, `external_uid`, `canonical_unit_id`, `check_in`, `check_out`, `state`, `first_seen_at`, `last_seen_at`, `missing_count`, `correlation_id`, `released_at`.

## Límites conocidos aceptados en nivel 1

- No hay un campo propio para `idempotency_key` en `planning.slot` con restricción de unicidad. En nivel 1 la clave queda en el log durable y en la referencia del bloqueo (`[HOTEL-017 ...]`); no se declara una unicidad estructural que STAGING no tiene.
- `x_hotel_ota_feed` (creado en STAGING) sigue siendo configuración por canal/unidad; el snapshot por UID se conserva en `x_hotel_api_log` para no crear un segundo inventario.
- La clave no vive como campo adicional de `planning.slot`; se conserva de forma durable en `x_hotel_api_log` y en la respuesta de APPLY. La guardia de replay compara operación, clave y solicitud saneada y devuelve el resultado almacenado.
- La auditoría usa `x_hotel_api_log`; no se usa `audit.record()` efímero.

## Feed público

`/api/hotel/ical/<unidad>/<canal>.ics` depende de `ota_blocks_list`. Hasta que exista responde `503`. Requiere `HOTEL_ICAL_FEED_TOKEN` (solo servidor); sin la variable queda deshabilitado.

## Decisión de diseño a confirmar

`destination_channel` omite los bloqueos del propio canal **en la misma unidad**. Un bloqueo de Booking en la 201 sí se exporta al feed Booking de CASA, porque CASA es otro anuncio y debe cerrarse.

## Evidencia del cierre AHS-302

- Clave piloto: `H017-STAGING-AHS302-20990110-004`.
- APPLY: slot 40155, derivado CASA 40156, snapshot 381.
- REPLAY: `idempotent_replay=true`, mismo slot y mismos derivados.
- RELEASE: ambos slots eliminados; snapshot `RELEASED` con hora y slot liberado.
- Consulta posterior: ningún bloqueo del rango sintético en `ota_blocks_list`; la consulta de snapshot persistió `RELEASED` después de reabrir.
