# ÁNGELA — TU TURNO EN 5 MINUTOS

> Guía rápida para usar el sistema de reservas en Odoo STAGING. No
> necesitas saber nada técnico: todo se hace con botones.

## 1. Ver qué está pasando hoy

Entra a **Hotel v1 (Piloto) → Reservas hotel**. Arriba a la derecha hay
dos botones: uno de **lista** y uno de **tablero**. Usa el de
**tablero** (el que parece una bandera). Vas a ver columnas como
CONSULTA, HOLD, CONFIRMADA, CHECKIN, CHECKOUT, CANCELADA — cada
reserva es una tarjeta dentro de la columna que le corresponde. Así
ves de un vistazo cuántas reservas hay en cada estado.

## 2. Cómo reservar

1. Click en **Nuevo**.
2. En "Cliente / Facturación" escribe el nombre del huésped. Si es
   nuevo, Odoo te deja crearlo ahí mismo.
3. Baja hasta **Check-in (entrada)** y **Check-out (salida)** y pon las
   fechas.
4. En la pestaña **Líneas de la orden**, click en "Agregar un
   producto" y busca la habitación (por ejemplo "201", "302", "Casa
   Completa"). Odoo calcula el precio solo — nunca lo escribas a mano.
5. Confirma el producto (botón "Confirmar" del popup que aparece).

Eso es todo. El precio, el anticipo (30% por defecto) y el saldo los
calcula Odoo, no tú.

## 3. Avanzar la reserva

Arriba de la reserva vas a ver botones morados como **Hotel: OPCION**,
**Hotel: HOLD 2h**, **Hotel: CONFIRMAR**. Úsalos EN ORDEN:

- **Hotel: OPCION** → el cliente está preguntando, nada bloqueado
  todavía.
- **Hotel: HOLD 2h** → la unidad queda apartada por 2 horas mientras el
  cliente decide. Si nadie confirma, se libera sola.
- **Hotel: CONFIRMAR** → la reserva es real y en firme.

Si te equivocas, el sistema NO te deja saltarte pasos por error — si
intentas algo que no corresponde, te va a avisar con un mensaje en
pantalla, no va a fallar en silencio.

## 4. Quién llega hoy / quién ocupa hoy

Después de **Hotel: CONFIRMAR** aparecen botones nuevos:

- **Hotel: CHECK-IN** (o el botón verde "Check-in (Entrada)") → cuando
  el huésped llega de verdad. La unidad pasa a OCUPADA en el tablero.
- **Hotel: CHECK-OUT** (o el botón naranja "Check-out (Salida)") →
  cuando el huésped se va. La unidad vuelve a estar libre.

## 5. Ver saldo y cobro

Dentro de la reserva, click en la pestaña **Hotel v1**. Ahí está todo
lo de plata, en un solo lugar:

- **VENTA (total)**: lo que vale la reserva completa.
- **ANTICIPO requerido**: lo mínimo que se le debe pedir al cliente
  antes de confirmar.
- **COBRADO (pagos registrados)**: lo que ya se cobró de verdad.
- **SALDO pendiente**: lo que todavía falta cobrar.

**VENTA nunca es lo mismo que COBRO.** Puede haber una reserva
CONFIRMADA con saldo pendiente — eso es normal, no es un error.

## 6. Cancelar una reserva

Botón **Hotel: CANCELAR**. Libera la unidad de inmediato. Úsalo solo
cuando el cliente cancela de verdad — no hay otro atajo.

## 7. Si algo no cuadra

- Si el sistema te muestra un mensaje de **"Operación no válida"**, no
  es un error tuyo: es el sistema protegiéndote de un paso que no
  corresponde (por ejemplo, hacer check-out dos veces). Lee el mensaje
  y avísale a Marlon si no lo entiendes.
- Nunca escribas un precio a mano. Si el precio que muestra Odoo no
  parece correcto, avísale a Marlon antes de continuar — no lo
  corrijas tú misma.
- Si no ves la unidad que buscas en "Agregar un producto", puede que
  ya esté ocupada para esas fechas — el sistema no te la va a dejar
  vender dos veces.
