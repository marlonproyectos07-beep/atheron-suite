# ATH-OTA-001 — iCal: documentación, diseño e implementación

> Cubre las Fases 5 (documentación oficial), 7 (importador), 8 (exportador) y
> 14 (pruebas) de la orden. Código en
> `integrations/ota-ical-adapter/` (36/36 tests, `npm test`).

## Fase 5 — Qué dicen Airbnb, Booking y Odoo sobre iCal

**Airbnb** (Centro de ayuda, artículo público sobre sincronización de
calendario — no se pudo hacer WebFetch directo por bloqueo de red del
entorno; resumen vía WebSearch):
- Exportar: Listados → elegir anuncio → Disponibilidad → Calendario →
  Configuración de disponibilidad → Sincronización de calendario → "Exportar
  calendario" genera un link `.ics`.
- Importar: se pega en Airbnb un link `.ics` de otro sitio (debe terminar en
  `.ics`).
- La sincronización bidireccional real requiere hacerlo en **ambos**
  sentidos por cada anuncio: exportar el de Airbnb hacia el otro canal, e
  importar el del otro canal hacia Airbnb.
- Frecuencia de sondeo típica: 1-2 horas — ventana de riesgo de doble
  reserva mientras no se sincroniza.

**Booking.com**: no publica un flujo self-service de iCal tan documentado
como Airbnb para todas las propiedades; su vía principal de integración son
las **Connectivity APIs** (formato OTA/XML), pensadas para channel managers
certificados, no para conexión directa de una propiedad pequeña. Cuando
Booking sí ofrece iCal (depende del tipo de cuenta/propiedad), el
comportamiento reportado es de sondeo con demora aún mayor (hasta ~12 h) y
sin sincronización de tarifas ni contenido — solo disponibilidad. Ver
`ATH-OTA-001-ARQUITECTURA.md` Fase 12 para la comparación completa con la
API de conectividad.

**Odoo**: el entorno de Atheron (`atheron1-hotel-staging-20260923`) no usa
un módulo de "Hotel PMS" prefabricado — según `AI/ODOO_HOTEL_STATE.md` está
construido sobre `resource.resource` (unidades) + `planning.slot`
(reservas/bloqueos) + acciones de servidor propias (1967 disponibilidad/
cotización/HOLD, automatizaciones 71/132/135/137/199, cron 155 de expiración
de HOLD). Odoo no tiene un exportador de iCal nativo para este modelo
custom: **hay que construirlo**, que es exactamente la Fase 8 de abajo.

**Importante (recordatorio de la orden, no una limitación técnica de este
código):** iCal sirve solo para disponibilidad/bloqueos. No se usa como
fuente de precio, impuestos, información financiera, CRM, tarifas ni
facturación — ni el importador ni el exportador de este módulo aceptan o
exponen esos campos (ver más abajo).

## Fase 7 — Importador (`OtaCalendarAdapter`)

Implementado en `integrations/ota-ical-adapter/src/adapter.mjs`, sobre:
- `src/ical-parser.mjs` — parser RFC 5545 sin dependencias.
- `src/normalize.mjs` — normaliza a `DomainEvent` con rango `[startDate,
  endDate)`.
- `src/unit-mapping.mjs` — mapeo listing→unidad, solo desde filas
  CONFIRMADO de la matriz.
- `src/inventory-sink.mjs` — puerto hacia el destino real (hoy solo
  implementación en memoria para tests).
- `src/conflict-queue.mjs` — cola de conflictos.

Checklist de requisitos de la Fase 7, y dónde se cumple cada uno:

| Requisito | Dónde |
|---|---|
| Descargar `.ics` | Fuera de este módulo a propósito — quien lo use decide la URL real y no hay ninguna URL de OTA real en este repositorio |
| Parsear eventos | `ical-parser.mjs` |
| Identificar fuente | `sync(icsText, { source, listingId })` — `source` es `'airbnb' \| 'booking'` |
| Identificar mapeo listing/unidad | `unit-mapping.mjs` — `UnmappedListing` va a la cola, nunca se inventa |
| Detectar create/update/cancel | `adapter.mjs#_applyOne` — por UID + comparación de contenido + `STATUS:CANCELLED` |
| `external_event_id` | `${source}:${listingId}:${uid}` — ver `normalize.mjs` |
| Idempotente | test "reprocesar el mismo feed es idempotente" + "duplicate.ics" |
| Detectar colisiones | `adapter.mjs#_detectCollision` — `OTA_EVENT_OVERLAP` |
| Cola de conflicto | `conflict-queue.mjs` |
| No sobreescribir reservas internas válidas | Puerto `internalReservationChecker` — sin conexión real a Odoo todavía (ver pendientes), pero el punto de extensión existe y está probado |
| Auditar cada operación | `adapter.auditLog` — éxito y error |

## Fase 8 — Exportador (`exportUnitCalendar`)

`src/exporter.mjs`. Por unidad, genera únicamente:

```
BEGIN:VEVENT
UID:<externalEventId o unitId-startDate-endDate>
DTSTAMP:<ahora, UTC>
DTSTART;VALUE=DATE:<YYYYMMDD>
DTEND;VALUE=DATE:<YYYYMMDD>
STATUS:<CONFIRMED|CANCELLED|TENTATIVE>
LAST-MODIFIED:<UTC>
SUMMARY:No disponible
END:VEVENT
```

**Nunca** teléfono, email, documento, precio ni ningún dato financiero del
huésped: la función ni siquiera acepta esos campos como parámetro
(`assertBlockShape` lanza `EXPORT_FORBIDDEN_FIELD` si alguien los pasa por
error) — no es una promesa, es una restricción de forma en el código,
verificada por test.

## Fase 14 — Fixtures y pruebas

`integrations/ota-ical-adapter/fixtures/*.ics` (ver tabla en el README del
módulo) y `integrations/ota-ical-adapter/test/*.test.mjs`:

- `ical-parser.test.mjs` — parseo, unfolding de líneas largas, fechas
  DATE y DATE-TIME con Z, VEVENT malformados.
- `normalize`/`timezone.test.mjs` — límites de fecha (fin de mes, fin de
  año), rango inválido, solapamiento `[start, end)` con frontera exacta
  (checkout = checkin no es colisión).
- `unit-mapping.test.mjs` — mapeo, duplicados, `blockGroupFor`.
- `adapter.test.mjs` — create/update/cancel, idempotencia, duplicado,
  CASA COMPLETA ↔ habitaciones hermanas, colisión OTA↔OTA, colisión con
  reserva interna simulada, listing sin mapear, auditoría.
- `exporter.test.mjs` — forma mínima del VEVENT exportado, round-trip con
  el propio parser, rechazo de campos privados, calendario vacío válido.

```bash
cd integrations/ota-ical-adapter
npm test   # 36/36 PASS
```

**Ningún test usa una URL, listing ID o UID real de Airbnb/Booking.** Todos
los identificadores en fixtures y en `test/helpers.mjs` son inventados para
la prueba, y así se documenta.
