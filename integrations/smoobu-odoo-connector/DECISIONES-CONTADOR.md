# Decisiones que necesita el contador (ATH-DEV-117)

Este documento NO fija reglas fiscales: recoge hechos leidos en Odoo (solo lectura, 30/10/2026) y las preguntas exactas.
Mientras no haya respuesta, la sincronizacion crea borradores **sin impuesto** y **no confirma** ningun pedido.

## Hechos observados en Odoo (empresa ATHERON S.A.S., pedidos confirmados de hospedaje desde 01/08/2026)

| Canal (`x_booking_source`) | Lineas sin impuesto | Con "19%" (251, se suma) | Con "19% IVA Incluido" (271) |
|---|---|---|---|
| Booking.com | 6 | 12 | 0 |
| Directa | 15 | 0 | 5 |
| Airbnb | 4 | 0 | 0 |
| WhatsApp | 2 | 0 | 0 |
| Sin canal (historico) | 216 | 2 | 5 |

- Impuesto 251 "19%": se suma al precio. Impuesto 271 "19% IVA Incluido": el precio ya lo incluye.
- Productos de habitacion (MAGIA-201..302): sin impuesto por defecto. Producto Casa Completa (CASA-MAGIA): 251 por defecto.
- Diarios de venta de Suite: VEN3 (contado) y VEN4 (credito); electronica: FAC (DIAN).
- Pedidos recientes de referencia: Booking 03818/03839 (precio de Smoobu + 19%), directa 03841 y grupo 03833-36 (IVA incluido),
  directas 03826/03846 y Booking 03845 (sin impuesto, pendiente).

## Preguntas

### 1. Reservas directas
1.1 ¿Llevan IVA del 19%? 
1.2 Si lo llevan: ¿el precio acordado con el huesped (el que queda en Smoobu) ya incluye el IVA (impuesto 271) o se suma (251)?
1.3 ¿Hay excepciones (empresas, convenios, estancias largas)?

### 2. Booking.com
2.1 El total que Smoobu recibe de Booking, ¿incluye o excluye el IVA? (hoy hay pedidos de ambas formas)
2.2 ¿Se factura al huesped el total de Booking o el neto despues de comision?
2.3 La comision de Booking (15% en las reservas recientes): ¿se registra como gasto aparte (factura de Booking al hotel) y no afecta al pedido?

### 3. Airbnb
3.1 ¿El hotel factura al huesped (y con que base: total pagado por el huesped o pago neto de Airbnb)?
3.2 ¿IVA incluido, excluido o no aplica?
3.3 Comision y retenciones de Airbnb: ¿como se registran?

### 4. Huespedes extranjeros no residentes
4.1 ¿Se aplica la exencion de IVA de servicios hoteleros a turistas extranjeros no residentes?
4.2 Si si: ¿que soporte se exige (pasaporte, sello o permiso de ingreso) y quien lo verifica antes de facturar?
4.3 Mientras no haya soporte, ¿se factura con IVA o se deja el pedido sin confirmar?

### 5. Facturacion
5.1 ¿Que diario usa cada canal: interno (VEN3/VEN4) o electronico (FAC)?
5.2 ¿En que momento se factura: al confirmar, al check-in o al check-out?
5.3 Anticipos (pagos en efectivo o transferencia registrados antes de la factura): ¿se concilian contra la factura final?

### 6. Casa Completa
6.1 La venta de Casa Completa es UNA linea con CASA-MAGIA (un solo ingreso); las cinco habitaciones solo se bloquean.
    ¿Correcto contablemente, o debe repartirse el ingreso por habitacion?
6.2 CASA-MAGIA trae el impuesto 251 por defecto, las habitaciones no: ¿cual es el tratamiento correcto?
6.3 Minimo de 10 personas en Odoo (automatizacion 71): ¿sigue vigente? (Si Smoobu trae menos, la sincronizacion bloquea.)

## Que cambia con las respuestas

- Se fija `TAX_POLICY` por canal (hoy todo 'PENDIENTE') y, si aplica, el impuesto permitido en `sync-write-guard.mjs`.
- Solo entonces `CONFIRM_ORDER` deja de quedar bloqueado (y siempre con aprobacion de gerencia en la primera fase).
- Ningun cambio fiscal se hace sin estas respuestas por escrito.
