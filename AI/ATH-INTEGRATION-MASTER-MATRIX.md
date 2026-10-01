# ATH-ODOO-HOTEL-014 — Matriz maestra de integración y fuente de verdad

Fecha: 2026-10-01
Estado: Gate de coordinación
Alcance: Odoo + WhatsApp + Web + Booking + Airbnb + Google Hotels + futuro PMS/Channel Manager
Producción: NO TOCADA

## Principio rector

Un solo sistema, múltiples canales.

- Odoo conserva la identidad canónica de propiedades/unidades y el núcleo empresarial.
- WhatsApp, Web, Booking, Airbnb y Google Hotels son canales.
- En Nivel 1, Booking/Airbnb se integran mediante una capa ligera desacoplada.
- En Nivel 2, el PMS/Channel Manager se inserta como capa de distribución OTA sin reemplazar Odoo.

## Matriz de autoridad por dato

| Dato | Fuente maestra Nivel 1 | Fuente maestra Nivel 2 | Consumidores | Regla |
|---|---|---|---|---|
| Identidad de propiedad | Odoo | Odoo | Gateway, Web, WhatsApp, PMS/CM, OTAs | ID interno permanente Atheron |
| Identidad de unidad | Odoo | Odoo | todos | AHS-201, AHS-202, AHS-203, AHS-301, AHS-302, AHS-CASA |
| Capacidad | Odoo | Odoo | Web, WhatsApp, PMS/CM, OTAs | no duplicar reglas por canal |
| Regla CASA COMPLETA ↔ habitaciones | Odoo | Odoo | capa OTA / PMS/CM | regla obligatoria de anti-overbooking |
| Huésped / cliente | Odoo | Odoo | operación, CRM, contabilidad | OTAs originan datos; Odoo consolida |
| Reserva interna | Odoo | Odoo | operación, dashboard | toda reserva OTA debe aterrizar en Odoo |
| Disponibilidad operativa | Odoo | Odoo + PMS/CM como distribuidor | Web, WhatsApp, OTAs | Odoo conserva regla de negocio; PMS distribuye en Nivel 2 |
| HOLD | Odoo | Odoo | Gateway/Web/WhatsApp | no se delega a OTA |
| Cotización directa | Odoo | Odoo | Web/WhatsApp | Gateway consume Odoo |
| Tarifas directas | Odoo | Odoo | Web/WhatsApp/Google direct | aprobadas y gobernadas en Odoo |
| Tarifas OTA | capa OTA controlada desde Odoo | PMS/Channel Manager | Booking/Airbnb/etc. | PMS/CM distribuye, no redefine arbitrariamente |
| Estado de housekeeping | Odoo | Odoo | operación | fuera de PMS/CM |
| Pagos directos | Odoo/pasarela aprobada | Odoo/pasarela aprobada | contabilidad/CRM | fuera del gate actual |
| Pagos OTA | OTA origina / Odoo registra | OTA/PMS origina / Odoo registra | contabilidad | conciliación posterior |
| Google Business Profile | Google | Google | clientes | canal de presencia, no motor de inventario |
| Google Hotels disponibilidad/tarifa directa | capa hotelera derivada de Odoo | PMS/Booking Engine/CM | Google Hotels | no crear inventario paralelo |
| WhatsApp | Gateway Atheron + Odoo | Gateway Atheron + Odoo | cliente | un único webhook/integración |
| Web directa | Gateway Atheron + Odoo | Gateway Atheron + Odoo | cliente | misma disponibilidad central |
| Booking | OTA externa | OTA vía PMS/CM | Odoo / distribución | ID externo, nunca identidad maestra |
| Airbnb | OTA externa | OTA vía PMS/CM | Odoo / distribución | ID externo, nunca identidad maestra |

## Contrato de mapeo por unidad

Cada unidad debe conservar esta estructura lógica:

- internal_unit_id
- odoo_unit_id
- odoo_resource_id
- booking_property_id
- booking_room_id
- airbnb_listing_id
- google_hotel_mapping_id (si aplica)
- current_ical_import
- current_ical_export
- future_pms_unit_id
- future_channel_manager_unit_id
- sync_direction
- sync_mode
- last_sync_at
- last_sync_status
- last_error
- idempotency_key

Los IDs externos pueden cambiar. internal_unit_id NO.

## Límites de cada frente

### HOTEL-013
Responsabilidad:
- conversación natural WhatsApp
- consulta availability-only contra Odoo STAGING
- seguridad Meta/Vercel/Gateway

NO:
- OTAs
- Google Hotels
- PMS/CM
- pagos
- Production

### HOTEL-014
Responsabilidad:
- Nivel 1 Booking + Airbnb + Odoo
- mapeo canónico
- iCal/conector ligero
- anti-overbooking
- trazabilidad de sync

NO:
- PMS/CM Nivel 2
- Google Hotels directo
- cambios de tarifas públicas sin autorización

### ATH-020
Responsabilidad:
- Google Hotels / canal directo Atheron
- requisitos de conectividad
- Booking Engine / Free Booking Link / integración futura
- evaluar encaje con PMS/CM de Nivel 2

NO:
- crear otro WhatsApp
- crear otro Gateway
- crear otro inventario
- reemplazar Odoo
- duplicar Booking/Airbnb del Nivel 1

## Orden coordinado

1. Cerrar HOTEL-013.
2. Cerrar Gate 014-A de mapeo.
3. Probar anti-overbooking Nivel 1.
4. Habilitar reservas OTA → Odoo.
5. Integrar Web directa sobre la misma disponibilidad.
6. ATH-020 prepara Google Hotels sin tocar el núcleo.
7. Cuando Nivel 1 sea estable, seleccionar PMS/Channel Manager.
8. Insertar PMS/CM como capa de distribución.
9. Escalar a más OTAs.

## Definition of Done de este Gate

Este gate queda cerrado cuando:
- todos los equipos/chats usan esta matriz como contrato;
- no existe ningún segundo inventario maestro;
- WhatsApp/Web/OTAs/Google están definidos como canales;
- Odoo mantiene la identidad y reglas de negocio;
- PMS/CM queda reservado para Nivel 2;
- ningún frente duplica Gateway, webhook, inventario o lógica anti-overbooking.
