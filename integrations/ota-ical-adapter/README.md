# ATH-OTA-001 — OtaCalendarAdapter

Estado: **implementado y probado en local con fixtures / no desplegado / no conectado a ningún feed real de Airbnb o Booking.**

Este módulo es la Fase 7-8 de `docs/ota/ATH-OTA-001-ARQUITECTURA.md`: convierte
los feeds `.ics` que publican Airbnb y Booking en operaciones de
bloqueo/liberación idempotentes sobre las unidades internas de Atheron, y
exporta el calendario de cada unidad de vuelta a formato `.ics`.

```
Airbnb .ics ─┐
             ├─▶ ical-parser.mjs ─▶ normalize.mjs ─▶ OtaCalendarAdapter ─▶ InventorySink
Booking .ics ┘                                              │
                                                    ConflictQueue (choques/listings sin mapear)

InventorySink (bloqueos por unidad) ─▶ exporter.mjs ─▶ .ics por unidad ─▶ Airbnb / Booking
```

## Qué hace

- Parsea `.ics` (RFC 5545, VEVENT) sin dependencias externas.
- Mapea `(fuente, listing)` → unidad interna vía `UnitMappingRegistry`, cargado
  únicamente con filas **CONFIRMADO** de `docs/ota/ATH-OTA-001-MATRIZ.md`.
- Aplica la regla CASA COMPLETA ↔ habitaciones: reservar la unidad
  CASA COMPLETA bloquea sus habitaciones hijas y viceversa; las habitaciones
  hermanas compatibles no se bloquean entre sí (mismo criterio ya validado en
  ATH-ODOO-HOTEL-002/006 — no se reimplementa esa lógica de negocio aquí, se
  reutiliza como configuración de `blockGroup`).
- Es idempotente: reprocesar el mismo evento (mismo UID, mismo contenido) no
  produce efectos nuevos.
- Distingue create/update/cancel por UID + comparación de contenido.
- Detecta colisiones (`OTA_EVENT_OVERLAP`, `INTERNAL_RESERVATION_CONFLICT`,
  `UNMAPPED_LISTING`) y las manda a `ConflictQueue` en vez de aplicarlas.
- Audita cada operación, éxito o error, en `adapter.auditLog`.
- Exporta por unidad solo `UID/DTSTART/DTEND/STATUS/LAST-MODIFIED`: la firma
  de `exportUnitCalendar` no acepta teléfono, correo, documento, precio ni
  ningún dato financiero del huésped, así que no hay manera de filtrarlos por
  error.

## Qué NO hace (a propósito)

- No calcula tarifas, impuestos ni facturación.
- No se conecta a ningún feed real — quien use este módulo en un entorno real
  decide la URL y la ejecuta explícitamente; aquí solo hay fixtures locales.
- No escribe en Odoo. `InventorySink` es un puerto; la única implementación
  de este repo es `InMemoryInventorySink` (memoria, para tests). El sink real
  de producción sería un cliente del gateway
  `integrations/odoo-hotel-gateway` (rama `feature/ath-odoo-hotel-007-gateway`),
  pero ese gateway hoy solo expone `availability/quote/hold/status` para el
  flujo de cotización propio — no un endpoint de "bloqueo externo por rango de
  fechas". Ver `docs/ota/ATH-OTA-001-PENDIENTES-HUMANOS.md`.
- No sobreescribe reservas internas válidas: si se le inyecta un
  `internalReservationChecker` que reporta conflicto, la operación va a la
  cola en vez de aplicarse. Sin ese checker conectado a Odoo (todavía no
  existe), el adapter no tiene forma de saber si hay una reserva interna en
  el rango — limitación documentada, no un supuesto oculto.

## Cómo correr

```bash
cd integrations/ota-ical-adapter
npm test   # 36/36 PASS
```

## Fixtures (`fixtures/*.ics`)

| Archivo | Qué prueba |
|---|---|
| `booking-room.ics` | Bloqueo simple de una habitación desde Booking |
| `airbnb-room.ics` | Bloqueo simple de una habitación desde Airbnb |
| `casa-completa.ics` | Reserva de CASA COMPLETA → bloquea sus 5 habitaciones hijas |
| `cancelled.ics` | `STATUS:CANCELLED` → libera un bloqueo previamente aplicado |
| `duplicate.ics` | Mismo UID y mismas fechas que `booking-room.ics` → idempotencia |
| `conflict.ics` | Fechas solapadas con `booking-room.ics` sobre la misma unidad → cola de conflictos |

Ninguno de estos fixtures usa credenciales, listings ni UID reales de Airbnb
o Booking.
