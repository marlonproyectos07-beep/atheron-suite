# Primer caso TRA en tiempo real: pasos para Recepcion

Caso candidato: **COT/2026/03915** (Booking, habitacion 201, 27-29/11/2026). Repositorio publico: el desglose con
importes se entrega a Marlon fuera del repositorio.

## 0. Antes de nada: ¿sigue vigente?
- La conciliacion del 26/11/2026 a las 20:12 UTC marca su reserva de Smoobu como **cancelada**, mientras que en Odoo
  sigue en borrador (`CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO`).
- Marlon lo confirma en Smoobu o en el extranet de Booking:
  - si esta cancelada, deja de ser candidata y Marlon decide que hacer con el borrador en Odoo;
  - en ese caso, los siguientes candidatos vigentes son COT/2026/03916 (202) y COT/2026/03921 (203), ambos de Booking,
    29-30/11, en borrador, con enlace de registro creado y sin abrir.
- Solo si sigue vigente:
  1. **Marlon** confirma el pedido en Odoo. Ni Recepcion ni la sincronizacion lo confirman.
  2. Recepcion envia el enlace de registro al huesped principal (Registro SIRE/TRA > Enlaces de registro). El pedido no
     tiene telefono, asi que se envia por el chat de Booking.

## 1. Datos del huesped (los escribe el huesped; nadie los completa por el)
El huesped principal llena el formulario:
- documento;
- nombres y apellidos;
- ciudad y pais de residencia y de procedencia;
- numero de acompanantes y los datos de cada uno;
- motivo principal del viaje.
El motivo lo elige el huesped. "Trabajo" solo si es lo que declara. Con otra opcion, la estancia queda pendiente de que
el MinCIT confirme su valor exacto.

## 2. Validacion (Recepcion)
- Revisar cada ficha contra el documento fisico y validarla, con la habitacion asignada (201).
- Si el documento del principal es un pasaporte con letras, la ficha queda como excepcion pendiente: no se corrige el
  valor.

## 3. Llegada y salida reales
- **Registrar llegada real** de cada huesped a la hora en que llega.
- **Registrar salida real** de cada huesped a la hora en que sale.
- Nada de esto se registra por adelantado ni se deduce.

## 4. Importe (despues de la salida de todos)
| Concepto | Que es | ¿Es el costo TRA? |
|---|---|---|
| Tarifa base de Booking | precio del alojamiento sin IVA | **Candidato.** Es lo que el huesped paga por el alojamiento sin impuestos (respuesta oficial, punto 7; Grupo 2, 4.12). Valido solo si el huesped lo pago completo |
| IVA de Booking (adicional a la tarifa) | impuesto | No: el costo TRA va sin impuestos. La conciliacion marca "revision tributaria" en estas reservas |
| Total del huesped (tarifa + IVA) | lo que acepto el huesped en Booking | No: incluye impuestos |
| Comision de Booking | lo que cobra Booking al alojamiento | No se resta: la paga el alojamiento, no el huesped |
| Neto recibido (total menos comision) | lo que liquida o deja Booking | **No.** Mezcla IVA y comision; no es el costo del alojamiento |
| "Base imponible" del pedido de Odoo | el total del huesped cargado sin impuesto de Odoo, para no duplicar el IVA | **No.** En estos pedidos incluye el IVA de Booking |

Registro en *Importes pagados (TRA)*:
- importe en COP;
- fecha de corte = dia de salida o posterior;
- evidencia (liquidacion de Booking o comprobante de pago);
- marcar las dos constancias;
- *Confirmar con evidencia*.

Si el huesped no pago completo, hubo descuento, cambio de tarifa o consumos extra, no se confirma: lo decide Marlon.

## 5. Antes del primer envio controlado
1. Comprobacion sin envio con el `order_id` (`ready_data: true`). La lanza Claude o Marlon.
2. Marlon guarda `TRA_TOKEN` y revisa el caso campo por campo.
3. Puertas, por decision de Marlon:
   - `x_tra_config_verified` en el establecimiento, solo si cada campo tiene respaldo;
   - `TRA_ENABLED=yes-real`, `TRA_EMITTER_ENABLED=yes`, `TRA_AUTO_SEND=no`;
   - **una** ejecucion con `send`;
   - despues, portal PMS y volver todo a `no`.
