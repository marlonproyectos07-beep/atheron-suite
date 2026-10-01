# ATH-ODOO-HOTEL-014 — OTA LEVEL 1 / ANTI-OVERBOOKING

Estado: INICIADO
Entorno permitido: Odoo STAGING + conectores/feeds de prueba + Booking/Airbnb solo cuando exista autorización explícita para tocar canal real.
Producción OTA: BLOQUEADA hasta gate de prueba.
Base: HOTEL-011 cerrado (19ad4277)

## Objetivo

Construir el Nivel 1 de distribución hotelera sin PMS/channel manager completo, dejando la arquitectura preparada para insertar un PMS/channel manager en Nivel 2 sin reconstruir Odoo.

Principio:
- Odoo = maestro operativo/empresarial.
- La capa OTA es desacoplada y reemplazable.
- Los identificadores internos de unidad nunca dependen de IDs de Booking/Airbnb.

## Unidades internas canónicas

- AHS-201 -> habitación 201
- AHS-202 -> habitación 202
- AHS-203 -> habitación 203
- AHS-301 -> habitación 301
- AHS-302 -> habitación 302
- AHS-CASA -> Casa Completa

Estas claves internas son permanentes y deben sobrevivir al paso a PMS/channel manager.

## Tabla de mapeo objetivo

Cada unidad debe poder mapearse por canal mediante campos/configuración separada:
- internal_unit_id
- odoo_resource_id
- booking_listing_id / room_id
- airbnb_listing_id
- ical_export_url
- ical_import_url
- future_pms_unit_id
- future_channel_manager_unit_id
- sync_mode
- last_sync_at
- last_sync_status

No usar nombres de habitación como clave técnica.

## Regla anti-overbooking

Una ocupación válida de una unidad individual debe bloquear esa unidad en todos los canales conectados.

CASA COMPLETA y habitaciones individuales deben mantener exclusión bidireccional:
- si AHS-CASA está ocupada/bloqueada -> 201,202,203,301,302 no vendibles;
- si cualquiera de las habitaciones individuales está ocupada/bloqueada -> AHS-CASA no vendible para las mismas fechas.

## Nivel 1

Arquitectura deseada:

Booking / Airbnb
       ↕
Capa ligera de sincronización OTA
       ↕
      Odoo

La capa ligera puede usar iCal/conector existente donde sea suficiente. No debe incrustar lógica comercial en cada OTA.

## Nivel 2 futuro

Arquitectura objetivo:

Booking / Airbnb / Expedia / Despegar / ... (hasta 30 OTAs)
                    ↕
             PMS / Channel Manager
                    ↕
                   Odoo

La migración consiste en remapear la capa de distribución; no recrear inventario interno, huéspedes, reservas, housekeeping, tableros o reglas de negocio.

## Gate 014-A — Inventario y mapeo

1. Confirmar recursos Odoo STAGING de 201,202,203,301,302,CASA COMPLETA.
2. Crear/validar IDs internos AHS-*.
3. Inventariar IDs/listings actuales de Booking y Airbnb.
4. Crear matriz de mapeo sin tocar disponibilidad real.
5. Documentar fuente de verdad y sentido de cada feed/conector.

## Gate 014-B — Sincronización técnica

1. Implementar/adaptar import/export de disponibilidad por canal.
2. Registrar trazabilidad de cada sincronización.
3. Evitar loops de importación.
4. Definir TTL/frecuencia.
5. Mantener idempotencia.

## Gate 014-C — Prueba reina anti-overbooking

Solo con autorización explícita:
1. bloquear una unidad en origen controlado;
2. verificar reflejo en Odoo;
3. verificar reflejo en otro canal;
4. hacer prueba inversa desde Odoo;
5. validar CASA COMPLETA ↔ habitaciones;
6. liberar bloqueo y comprobar recuperación.

## No permitido todavía

- Production OTA sin autorización explícita.
- Cambiar tarifas públicas.
- Crear/cancelar reservas reales de clientes.
- Cambiar políticas comerciales.
- Migrar a PMS/channel manager.
- Conectar otras propiedades antes de cerrar Atheron Suite.
- Mezclar Atheron Security.

## Definition of Done

HOTEL-014 termina cuando Atheron Suite tiene un inventario canónico y mapeado, y una reserva/bloqueo de prueba en un canal vuelve no vendible la misma capacidad en Odoo y el otro canal sin overbooking, con reversión comprobada y trazabilidad.
