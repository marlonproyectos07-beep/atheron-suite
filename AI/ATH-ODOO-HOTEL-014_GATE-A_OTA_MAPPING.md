# ATH-ODOO-HOTEL-014 — Gate 014-A — Matriz canónica OTA ↔ Odoo

Fecha: 2026-10-01
Estado: INVENTARIO INICIAL / SOLO LECTURA
Producción OTA: NO TOCADA

## Regla de diseño

Los IDs internos de Atheron son permanentes y desacoplados de Booking/Airbnb/PMS:

- AHS-201
- AHS-202
- AHS-203
- AHS-301
- AHS-302
- AHS-CASA

La migración futura a PMS/channel manager solo debe cambiar el mapeo externo, nunca estas claves.

## Evidencia reutilizada de HOTEL-008 / HOTEL-007

| Internal ID | Unidad | Odoo STAGING unit_id | Booking property/listing | Booking room | Airbnb listing | Estado actual |
|---|---|---:|---|---|---|---|
| AHS-201 | 201 | 1 | Hotel Atheron Suite: hotel_id 16559325 (propiedad general; room ID pendiente) | PENDIENTE | PENDIENTE | Odoo interno probado; OTA mapping parcial |
| AHS-202 | 202 | PENDIENTE | Hotel Atheron Suite: hotel_id 16559325 | PENDIENTE | listing individual existe, ID pendiente | mapping pendiente |
| AHS-203 | 203 | PENDIENTE | Hotel Atheron Suite: hotel_id 16559325 | PENDIENTE | listing individual existe, ID pendiente | mapping pendiente |
| AHS-301 | 301 | PENDIENTE | Hotel Atheron Suite: hotel_id 16559325 | PENDIENTE | 1057232086445101786 | Airbnb confirmado |
| AHS-302 | 302 | PENDIENTE | Hotel Atheron Suite: hotel_id 16559325 | PENDIENTE | listing individual existe, ID pendiente | mapping parcial |
| AHS-CASA | Casa Completa | PENDIENTE | Atheron Grand House: hotel_id 16569053 | establecimiento separado | PENDIENTE | riesgo real de overbooking confirmado |

## Hallazgo crítico

Booking vende Casa Completa como establecimiento separado de las habitaciones individuales. Los calendarios no están enlazados del lado de Booking.

HOTEL-008 encontró evidencia histórica de solapamiento:
- Casa Completa vendida para 10-17 ago 2026 (reserva luego cancelada)
- habitación 302 vendida dentro de esa misma ventana

Por tanto, el riesgo CASA COMPLETA ↔ habitaciones no es teórico: existe y el Gate 014 debe resolverlo.

## Estado NOBEDS legado

NOBEDS existe en Odoo producción como LEGACY_ACTIVE.

Evidencia:
- menú: Reservación > Reservas OTA (NOBEDS)
- cron activo "ATHERON - Refrescar iCal NOBEDS (salida)"
- frecuencia observada: 5 minutos
- mecanismo documentado: Odoo -> iCal de salida
- puente inverso reservas -> calendario estaba desactivado en la auditoría
- reserva Airbnb Camilo 301 no apareció confirmada como sale.order en Odoo

Conclusión:
NOBEDS no se considera la arquitectura objetivo y NO se toca todavía. El reemplazo debe construirse/probarse en paralelo antes de apagarlo.

## Pendientes para cerrar Gate 014-A

1. Confirmar unit_id de 202/203/301/302/CASA en STAGING.
2. Confirmar resource/planning resource por unidad.
3. Leer Booking Extranet en modo solo lectura:
   - room IDs de 201/202/203/301/302
   - configuración/calendario de Casa Completa
4. Leer Airbnb Host en modo solo lectura:
   - listing IDs de 201/202/203/302/CASA
5. Inventariar feeds iCal actuales por unidad sin exponer URLs sensibles.
6. Confirmar dónde vive la configuración NOBEDS (Studio / módulo / acción server).
7. Definir contrato de sync para el reemplazo:
   - source
   - target
   - unit internal ID
   - external ID
   - direction
   - last_sync
   - idempotency key
   - status/error

## Gate de seguridad

Hasta completar los pendientes:
- NO cambiar disponibilidad en Booking/Airbnb.
- NO apagar NOBEDS.
- NO activar crons desactivados.
- NO crear/cancelar reservas.
- NO tocar Production Odoo.
