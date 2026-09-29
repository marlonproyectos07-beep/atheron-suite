# ATH-ODOO-HOTEL-009 -- Frente B: flujo de reserva manual (2026-09-29)

> UX/contrato del flujo que usa Angela desde recepcion. La logica de
> negocio (`createManualReservation`, `integrations/odoo-hotel-gateway/
> src/reception-booking.mjs`) YA EXISTE y ya esta probada (HOTEL-008
> nocturno): este documento es el mapeo UX de esos 9 pasos, mas el
> arnes de prueba anti-overbooking (Frente E) que lo verifica en ciclo
> completo.

## Los 9 pasos, mapeados a codigo real

| # | Paso (UX) | Codigo que ya lo resuelve |
|---|---|---|
| 1 | Fechas | `input.checkin/checkout` de `createManualReservation` |
| 2 | Personas | `input.guests` |
| 3 | Alojamientos validos para esas personas/fechas | `alternatives-engine.mjs` (`requestAccommodationAlternatives`) -- nunca ofrece una unidad sin capacidad ni habitaciones sueltas si se pidio Casa Completa |
| 4 | Seleccion | Angela elige una de las opciones ya filtradas, nunca un ID libre |
| 5 | Datos del huesped | `input.guest`, `input.phone` |
| 6 | Tarifa de Odoo | `createQuote()` -- la tarifa SIEMPRE viene de Odoo via el Gateway, nunca se calcula en el flujo web/recepcion (mismo bloqueo de contrato que HOTEL-010) |
| 7 | Anticipo/saldo | Pendiente de que Odoo confirme el campo real (ver bloqueo de Fase 1 profunda en el handoff); el read-model (`operational-read-model.mjs`) ya calcula `balance` en cuanto la fuente lo traiga |
| 8 | Confirmar | Angela confirma en pantalla, sin ver JSON ni IDs tecnicos |
| 9 | Bloqueo | `createHold()` -- el mismo HOLD que usa cualquier otro canal, no hay atajo de recepcion que se salte disponibilidad |

**Regla ya implementada (no hay que repetirla en la UI):** si el paso 3
determina que la unidad no esta disponible, el flujo se detiene ahi
(`REJECTED_UNIT_NOT_AVAILABLE`) -- nunca se llega a generar cotizacion ni
HOLD. Esto es, literalmente, lo que evita que recepcion cause overbooking.

## Pantallas (wireframe minimo)

```
[1] Fechas          -> selector de 2 fechas, valida checkout > checkin
[2] Personas         -> selector numerico
[3] Alojamientos     -> tarjetas de las unidades validas (reutiliza el
                        mismo componente visual que las cards del Frente A)
[4-5] Datos huesped   -> nombre + telefono (ambos requeridos por
                        createManualReservation)
[6] Tarifa            -> monto tal cual lo devuelve Odoo, sin editar
[7] Anticipo/saldo     -> PENDIENTE (bloqueado por Fase 1 profunda)
[8] Confirmar          -> boton unico "Confirmar reserva"
[9] Bloqueado          -> pantalla de exito, con el mismo hold_id que
                        Angela vera despues en el tablero (Frente A)
```

Ningun paso le pide a Angela un ID tecnico, JSON, ni una calculadora
aparte -- todo lo hace el Gateway detras de cada boton.

## Frente E -- arnes de prueba anti-overbooking ("prueba reina")

`integrations/odoo-hotel-gateway/src/anti-overbooking-harness.mjs`
(`runQueenTest`), 6 tests en
`integrations/odoo-hotel-gateway/test/anti-overbooking-harness.test.mjs`,
todos PASS. Repite el ciclo pedido por el CEO:

```
201 disponible -> reserva manual TEST -> 201 bloqueada -> cancelacion -> 201 disponible de nuevo
```

Corre sobre el mismo modelo de inventario (`odoo-hotel-ical`, bloqueo
cruzado ya probado en HOTEL-002), SIMULADO -- nunca contra Odoo real.
Es repetible e idempotente (copia el inventario que recibe, nunca lo
muta) y limpia su propia reserva de prueba en cada corrida.

**Hallazgo real, no hipotesis:** el contrato del Gateway
(`src/contract.mjs`) hoy define `availability/quote/hold/status`, pero
**no existe una operacion de cancelacion**. `cancel` esta bloqueado a
proposito en `COMMON_FORBIDDEN` (defensa en profundidad), pero nunca se
implemento como operacion real. El arnes simula ese paso para poder
probar el ciclo completo de logica de negocio HOY; el paso de
cancelacion contra el Gateway/Odoo real queda `NOT_IMPLEMENTED` hasta
que exista esa operacion (requiere diseno de contrato + decision de
Marlon).

## Estado

DISEÑADO (pasos 1-9 mapeados a codigo existente) + PROBADO EN
SIMULACION (arnes anti-overbooking, 6/6 PASS). CERO UI construida
(mismo bloqueo de acceso a Odoo STAGING que el Frente A). Construir la
pantalla real depende de la misma decision pendiente: UI dentro de
Odoo vs. capa web propia sobre el Gateway.
