# ATH-ODOO-HOTEL-017 — Operaciones que faltan en el Hotel Gateway

Estado: el Gateway HOTEL-007 expone solo `availability`, `quote`, `hold` y `status` (acción Odoo vía `ir.actions.server`). Ninguna lista, aplica ni libera bloqueos OTA, y `status`/`hold` no sirven de sustituto: un VEVENT es un bloqueo de calendario, no un HOLD comercial. El puerto `integrations/odoo-hotel-ical/src/gateway-odoo-port.mjs` ya llama a las operaciones de abajo y **falla cerrado** (`GATEWAY_OPERATION_UNSUPPORTED`) mientras no existan. No se simula cancelación.

## Endpoints mínimos que faltan

| Ruta | Operación | Entrada | Salida | Efecto en Odoo STAGING |
|---|---|---|---|---|
| `POST /hotel/ota/blocks/list` | `ota_blocks_list` | `property_id` | `blocks[]` con `canonical_unit_id`, `check_in`, `check_out`, `status`, `source`, `idempotency_key` | Solo lectura de `planning.slot` publicados de las 6 unidades, **excluyendo** `x_hotel_block_kind = derived` (el efecto CASA lo calcula `inventory-model.mjs`). `source` = `x_channel` o `odoo`. |
| `POST /hotel/ota/blocks/apply` | `ota_block_apply` | `idempotency_key`, `source`, `canonical_unit_id`, `odoo_unit_id`, `external_uid`, `check_in`, `check_out`, `correlation_id` | `slot_id`, `replay` | Crea o actualiza un `planning.slot` `x_hotel_block_kind = external`. Unicidad transaccional por `idempotency_key`. No crea `sale.order`. |
| `POST /hotel/ota/blocks/release` | `ota_block_release` | `idempotency_key` | `released` | Borra **solo** el slot con esa clave y `kind = external`; `NOT_FOUND` si no existe. La automatización de Odoo retira el derivado de CASA. |
| `POST /hotel/ota/snapshot/list` | `ota_snapshot_list` | `source`, `canonical_unit_id` | `entries[]` | Lee el snapshot durable. |
| `POST /hotel/ota/snapshot/put` | `ota_snapshot_put` | `entry` | — | Upsert por `(source, canonical_unit_id, idempotency_key)`. |

Campos del snapshot (`reconcileSnapshot`): `idempotency_key`, `source`, `external_uid`, `canonical_unit_id`, `check_in`, `check_out`, `state`, `first_seen_at`, `last_seen_at`, `missing_count`, `correlation_id`, `released_at`.

## Falta también en Odoo STAGING

- Un campo propio para `idempotency_key` en `planning.slot` con restricción de unicidad. En el piloto manual de AHS-302 la clave quedó dentro de `name` (`[H017 <canal> <clave>]`), que no es único ni indexado.
- Un modelo durable para el snapshot. `x_hotel_ota_feed` (creado en STAGING) guarda un registro por canal y unidad, no por UID.
- Una rama nueva en la acción del Gateway (o una acción aparte) para las cinco operaciones, y un rol técnico con permiso sobre ellas.
- Auditoría durable: hoy `audit.record()` no se persiste.

## Feed público

`/api/hotel/ical/<unidad>/<canal>.ics` depende de `ota_blocks_list`. Hasta que exista responde `503`. Requiere `HOTEL_ICAL_FEED_TOKEN` (solo servidor); sin la variable queda deshabilitado.

## Decisión de diseño a confirmar

`destination_channel` omite los bloqueos del propio canal **en la misma unidad**. Un bloqueo de Booking en la 201 sí se exporta al feed Booking de CASA, porque CASA es otro anuncio y debe cerrarse.
