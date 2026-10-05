# HOTEL-017 — Cierre formal del milestone en STAGING

Fecha: 2026-10-05 (America/Bogota). Base: `atheron1-hotel-staging-20260923`. Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1`.

**HOTEL-017_STAGING_GATE = PASS** (declarado por CEO, con la evidencia técnica descrita abajo).

No se hizo merge a `main`, no hubo despliegue a Production, no hubo commit ni PR. Este documento no modifica Odoo, Booking ni Airbnb.

---

## 1. Estado por habitación

| Habitación | Odoo unit | Canónico | Rol | Recurso | Booking room | Airbnb listing | Estado |
|---|---|---|---|---|---|---|---|
| 201 | 1 | AHS-201 | 29 | 28 | 1655932502 | no registrado en este documento | FULL_OTA_PASS = YES |
| 202 | 2 | AHS-202 | 19 | 29 | 1655932503 | 1213146414477202934 | FULL_OTA_PASS = YES |
| 203 | 3 | AHS-203 | 30 | 30 | 1655932504 | 1213242080835096435 | FULL_OTA_PASS = YES |
| 301 | 4 | AHS-301 | 37 | 31 | 1655932506 | 1057232086445101786 | FULL_OTA_PASS = YES |
| 302 | 5 | AHS-302 | 18 | 32 | 1655932505 | 1119517434126866031 | FULL_OTA_PASS = YES |

Propiedad Booking común: `16559325`. Casa Completa: unidad 6, recurso 79. Las cinco habitaciones son hijas de Casa Completa en el modelo.

Verificación técnica propia (en STAGING, por lectura y replays): la importación y el replay de 202, 203 y 301 quedan con CREATED = 0 y CONFLICT = 0 en el segundo pase; la exclusión de Casa se comprobó por solapamiento de slots en fechas ocupadas y en una fecha libre de control (2026-11-20/21). El estado de Booking y Airbnb (conexiones, calendarios, OK / DE ACUERDO) proviene de las verificaciones de Claude Chrome reportadas por el CEO; no se volvió a comprobar en Booking desde esta sesión.

## 2. Feeds (x_hotel_ota_feed)

| id | Feed | Estado último |
|---|---|---|
| 1 | AHS-302 / booking | OK |
| 2 | AHS-302 / airbnb | OK (manual, 3 DUPLICATE, 0 conflictos) |
| 3 | AHS-201 / booking | OK |
| 4 | AHS-202 / booking | OK |
| 5 | AHS-203 / booking | OK |
| 6 | AHS-301 / booking | OK |

Las referencias de inbound (enlaces de exportación de Booking) están guardadas en `x_inbound_feed_reference`. No se imprimen en ningún documento. El campo «Recurso Odoo» (`x_odoo_resource_id`) está vacío en los feeds 5 y 6 y **no es requerido** por el importador, que resuelve la unidad por `x_odoo_unit_id` y valida la referencia contra el listing.

## 3. Salida (outbound) — adjuntos, acciones y crons

| Habitación | Adjunto | Acción refresco | Envoltorio | Cron (cada 5 min) | Filtro |
|---|---|---|---|---|---|
| 302 | 26981 | 1979 / 1980 | 1980 | 156 | sin filtro de fecha (ver residuales) |
| 201 | 26982 | 1981 | 1982 | 157 | sin filtro de fecha (ver residuales) |
| 202 | 26984 | 1983 | 1984 | 158 | sin filtro de fecha (ver residuales) |
| 203 | 26986 | 1985 | 1986 | 159 | fin ≥ hoy; Casa solo con pedido |
| 301 | 26985 | 1988 | 1989 | 160 | fin ≥ hoy; Casa solo con pedido; excluye 40159 y 40161 |

Las salidas de 203 y 301 están vacías (0 eventos) porque no hay ocupación futura propia en Odoo. Es el resultado esperado.

La acción **1987** (`ATHERON - Refrescar iCal SOLO 203`, código vacío) es un residuo creado automáticamente por Odoo en un intento fallido. Está huérfana y no la usa ningún cron. Pendiente de retirada con autorización.

El cron global **147** no aparece en la lectura de STAGING; no se tocó.

## 4. Acción 1967 (HOTEL v1 / API Gateway Sofía 006) — estado y parches

- **Versión actual en STAGING:** `c0b1eb15…` (sha256 `c0b1eb1584ca50be0c2b827b6c0f877a2df1a7c6832d7206f9ddedeab83ce87c`), escrita el 2026-10-05 23:11:49 UTC.
- **Base original antes de HOTEL-017 adopción:** sha256 `9b053e02…`.
- **Rollback disponible:** a `4976f432…` (respaldo `hotel017-301-pre-adoption-2026-10-05T23-11-49-245Z`), o a `8f35a981…` (respaldo `…T23-07-02-796Z`), o a `5498b99b…` (respaldo `…T22-33-16-400Z`) y `9b053e02…` (respaldo `action-1967-before-adoption-2026-10-05T04-08-16-194Z.json`). Todos verificados byte a byte al crearse.
- **Restaurar a `5498b99b…` reintroduciría el CONFLICT 12→13 oct** (ver motivo del parche c0b1eb15).

### Parches temporales documentados

1. **`5498b99b…`** — adopción 302 (ya en uso desde el piloto). Base para el resto.
2. **`8f35a981…`** — adopción 301 **limitada a 40159**: ámbito de validación (`source=booking`, `AHS-301`, unidad 4, 2026-10-12 → 10-13), rama de adopción propia para 40159 con guardas (recurso 31, rol 37, sin pedido ni huésped, sin solape, snapshot CONFLICT del mismo UID), y listado por unidad (302 o 301).
3. **`4976f432…`** — el listado incluye 40159 **sin vínculo** (sin canal ni tipo), para que el importador detecte el conflicto localmente en vez de llamar a Odoo y recibir una excepción.
4. **`c0b1eb15…`** (vigente) — el listado devuelve `source = booking` para 40159 **solo si tiene vínculo de adopción**. Diff exacto frente a `4976f432…`: una línea.

Pruebas que respaldan estas versiones: suite sintética de la acción (36 PASS), gateway (341 PASS) e iCal (134 PASS). Ninguna prueba se ejecutó contra Odoo real salvo las ejecuciones de importación y replay documentadas.

### Motivo del parche c0b1eb15

Tras la adopción de 40159, el listado devolvía `source = odoo` (el slot no tiene canal). El importador solo reconoce como propio un bloque con `source = booking`, así que el evento 12→13 seguía en CONFLICT en el replay. El parche c0b1eb15 corrige exactamente ese campo para el slot adoptado. Resultado: replay CREATED 0, DUPLICATE 6, CONFLICT 0, dos veces.

## 5. Vínculos de adopción (ota_block_adopt, `x_hotel_api_log`)

| Fila | Habitación | Slot | Evento | Clave (prefijo) |
|---|---|---|---|---|
| 469 | 302 | 40142 | 2026-10-01 → 10-05 | c709db3b |
| 477 | 302 | 40140 | 2026-10-17 → 10-18 | 1d810546 |
| 694 | 301 | 40159 | 2026-10-12 → 10-13 | 1e323c44 |

Cada evento tiene un único vínculo. No se adoptó ningún otro slot.

## 6. Slots y eventos a tener en cuenta (excepciones conocidas)

- **40159** (301, 12→13 oct 2026): adoptado a la reserva Booking real. Sin canal ni tipo en Odoo. Creado manualmente el 2026-10-03 por la cuenta de Marlon. Fechas, recurso y rol sin cambios.
- **40161** (301, 4→5 oct 2026): bloqueo importado desde Airbnb según el CEO. Sin canal ni tipo en Odoo. Creado el 2026-10-04. **No adoptado, no modificado, no borrado.** Se excluye de la salida de 301 por ID.
- **40018** (203, 1→3 oct 2029): etiquetado `booking/external`, nombre «EXT nobeds QA-NB-006-1», creado el 2026-09-24. Artefacto de prueba NOBEDS; no acreditado como reserva Booking. **No adoptado, no borrado, no tocado.** Está fuera de la salida de 203 porque es externo.
- **Slot del 10→11 oct de 301:** creado por la primera pasada de importación (intento fallido) y ahora reconocido como DUPLICATE. Es un evento legítimo.
- **Casa Completa:** tiene slots derivados de cada habitación con reserva importada. Son bloqueos legítimos de Casa, no reservas.

## 7. Conexiones OTA

- **Booking 302, 201, 202, 203, 301:** conexiones `airbnb.com.co` operativas (una por habitación, bidireccionales), según verificación de Claude Chrome.
- **Booking 203 — conexión huérfana:** `airbnb.com.co`, estado «Import needed / Complete setup», solo exporta. **Permanece visible y sin consumidor activo.** Decisión CEO: no completar, no retirar por ahora, no abrir ticket.
- **Airbnb 203:** calendario «hab 203 booking» (principal) conservado; «hab. 203 booking» (duplicado export-only) retirado.
- **Airbnb 301:** un solo calendario «hab 301 booking», sin duplicados.
- **Booking 301:** estado ODOO STAGING 301 pasó de «ACTIVANDO» a OK / DE ACUERDO, según el reporte de Claude Chrome.

## 8. Bloqueos manuales y residuos pendientes

- **Bloqueo manual de Airbnb de 2027** (que incluye 1→3 oct): **preservado**, sin tocar. Pendiente de auditoría por el CEO.
- **Conexión huérfana Booking 203:** visible, sin efecto operativo. Pendiente de decisión.
- **Acción 1987** (vacía, huérfana): pendiente de retirada con autorización.
- **Slot 40018:** artefacto de prueba, pendiente de decisión de borrado.
- **Slot 40161 / Airbnb 4→5 oct:** aceptado como bloqueo de Airbnb. Pendiente de confirmar su tratamiento si se borra el origen en Airbnb.
- **Eco potencial de Airbnb 302 (`airbnb.com.co`, feed 2):** ya tiene tres eventos DUPLICATE; sin conflictos.

## 9. Residuos técnicos conocidos

- **Salidas 201, 202 y 302 sin filtro de fecha:** incluyen histórico (fin < hoy). 302 tiene 58 eventos, todos pasados; 202 tiene 57, todos pasados; 201 tiene 64, uno futuro. No bloquean disponibilidad futura, pero el feed es más grande de lo necesario. Aplicar el mismo filtro de 203 requiere autorización por habitación.
- **Cambios en el repositorio sin commit:** scripts de diagnóstico, parche de 1967 (generador en `src/ota-adoption-action-code.mjs`), transporte (`src/odoo-transport.mjs`), parser de snapshots (`src/ota-snapshot-entry.mjs`), pruebas y este documento. Ninguno está en Git. Los respaldos de la acción 1967 están en `.local-action-backups/` (ignorado por Git).
- **Permiso no permanente:** la autorización para modificar la acción 1967 se concedió por parche y no es permanente.
- **Verificación OTA externa:** el estado de Booking y Airbnb viene de Claude Chrome y no se volvió a comprobar desde esta sesión.
- **Odoo:** la versión no se consultó en esta sesión.

## 10. Integridad (estado final verificado)

- Slots de planning: 546. Huella de slots tras el último replay: sin cambios.
- Pedidos de venta (`sale.order`): 1499. Pagos (`account.payment`): 2080. Tarifas (`product.pricelist`): huella sin cambios.
- Producción: **no tocada**.
- NOBEDS: **no tocado**, salvo el artefacto 40018 que ya existía y no se modificó.
- PII: no expuesta en documentos ni reportes.

## 11. Gate

**HOTEL-017_STAGING_GATE = PASS.** Criterio: 201, 202, 203, 301 y 302 con FULL_OTA_PASS = YES, exclusión de Casa validada, sin conflictos pendientes, sin duplicados indebidos, sin cambios comerciales, sin tocar Production ni NOBEDS.

**Siguiente recomendado:** no ampliar el alcance. Decidir por separado: retirar la acción 1987, retirar o completar la conexión huérfana de Booking 203, auditar el bloqueo de Airbnb 2027, aplicar el filtro de fecha a 201, 202 y 302, y revisar la rama para commit antes de cualquier merge a `main`.
