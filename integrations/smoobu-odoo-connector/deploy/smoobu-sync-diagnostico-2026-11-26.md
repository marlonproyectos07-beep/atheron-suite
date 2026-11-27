# Sincronizacion programada Smoobu -> Odoo detenida desde el 22/11/2026: diagnostico y correccion

Repositorio publico: referencias enmascaradas como en el informe del workflow (`SM*...NNNN`). Sin nombres ni importes.
No se desbloqueo, no se reproceso nada y no se cambiaron limites.

## 1. Ejecucion y error exacto
- Ultima ejecucion correcta: 45052003916 (22/11/2026 17:53 UTC, commit 36c7f03). Creo el borrador COT/2026/03926 para
  la reserva `SM*...9175` (habitacion 202, 24-25/12, Booking).
- Primera ejecucion fallida: **45084487476** (22/11/2026 23:40 UTC, mismo commit 36c7f03, pruebas 100 % correctas).
  Paso "Sincronizacion (solo borradores)":
  ```
  {"mode":"REAL","halted":"DUPLICADO_DETECTADO","results":[],"writesSentToOdoo":0,...}
  ##[warning]SM*...9175 202 2026-12-24: AMBIGUOUS PEDIDO_COMPARTIDO_POR_VARIAS_RESERVAS
  ##[warning]SM*...9176 201 2026-12-24: AMBIGUOUS PEDIDO_COMPARTIDO_POR_VARIAS_RESERVAS
  ##[error]APAGADO AUTOMATICO: DUPLICADO_DETECTADO
  ```
- Ese mismo job abrio la incidencia **#120** ("BLOQUEO-ESCRITURA-SYNC ejecucion 45084487476").
- Desde entonces, todas las ejecuciones (8 hasta el 26/11 11:05 UTC, tambien sobre e93ea57 y 8934229) terminan igual.
  Corren en sombra (`latched: true`, `BLOQUEO_POR_FALLO_ANTERIOR`) y hacen 0 escrituras.
- La fusion de la PR #124 no interviene: el fallo es anterior y el paso de pruebas sigue en verde.

## 2. Causa
- Una reserva de Booking con **dos habitaciones** (201 y 202, 24-25/12) llega de Smoobu como dos reservas, `...9175` y
  `...9176`, con el **mismo numero de Booking**.
- El conciliador (`src/id-reconcile.mjs`, `matchesFor`) casaba pedidos por ID de Smoobu **o** por ID de Booking. El
  pedido COT/2026/03926 (`Smoobu ...9175 / Booking <mismo numero>`) casaba tambien con `...9176` por el numero de Booking.
- Eso da `PEDIDO_COMPARTIDO_POR_VARIAS_RESERVAS`, que esta en `DUPLICATE_REASONS`: duplicado, apagado automatico y
  bloqueo persistente.
- No hay ningun pedido duplicado en Odoo: es un falso positivo.
- Se confirma por lectura de Odoo: COT/2026/03926 es el unico pedido del 24/12, en borrador, con una sola habitacion
  (202).
- El codigo es la unica via por la que `...9176` podia casar con ese pedido: el pedido no lleva su ID de Smoobu.

## 3. Reservas afectadas
Conciliacion diaria del 26/11/2026 20:12 UTC (ventana 26/11/2026 - 23/02/2027): **21 reservas sin pedido en Odoo**
(16 el 23/11).

| Grupo | Reservas |
|---|---|
| En curso o proximas (sin borrador por el bloqueo) | `...7524` 202 25-27/11; `...9695` 301 26-27/11 (directa); `...1422` 203 27-29/11; `...8789` 202 28-29/11; `...2548` 203 30/11-04/12; `...3363` 202 01-02/12; `...4119` 202 07-08/12 |
| Mas adelante | `...8396` 302 y `...8397` 201 29-30/12 (posible segunda reserva con varias habitaciones); `...4234` 203 30-31/12; `...7809` 202 04-05/01 (Airbnb); `...5989` 201 08-09/01; `...7580` 302 09-10/01; `...6691` 203 23-24/01; `...7475` 301 26/01-02/02; `...2143` 301 04-05/02; `...1028` 202 20-21/02 |
| Ya bloqueadas antes del 22/11 por otras causas | `...6968` 302 (nombre no identificable); `...3186` 201 29/11 (total no fiable); `...9171` 301 04/01 (sobreventa / revision manual); `...6783` 202 06/01 (total no fiable) |
| Ambiguas por la causa | `...9175` 202 y `...9176` 201, 24-25/12 |
| Conflicto nuevo, no causado por el bloqueo | `...2829` 201 27-29/11 = **COT/2026/03915**: cancelada en Smoobu, vigente (borrador) en Odoo. Aparece entre las 11:26 y las 20:12 UTC del 26/11. La sincronizacion programada nunca cancela pedidos: decide gerencia |

Ademas, `...2936` (301, 06/01) sigue con fechas distintas, como antes del 22/11.

## 4. Correccion (rama `fix/smoobu-booking-varias-habitaciones`)
- Si un ID de Booking o Airbnb se repite en varias reservas de la ventana, solo se concilia por el ID de Smoobu. Cada
  habitacion casa con su propio pedido.
- Si un pedido lleva ese ID OTA compartido sin ningun ID de Smoobu, queda en revision humana
  (`ID_OTA_COMPARTIDO_SIN_ID_SMOOBU`). No es un duplicado ni apaga la sincronizacion, y la sincronizacion nunca crea
  otro pedido encima.
- Los duplicados reales (dos pedidos con el mismo ID de Smoobu) siguen deteniendo todo.
- Un ID OTA que no se repite sigue casando como antes.
- Prueba nueva (`test/id-reconcile.test.mjs`) con el caso real y IDs sinteticos:
  - sin la correccion falla;
  - con ella, el pedido de la 202 casa por su ID de Smoobu, la 201 queda sin pedido y no hay duplicado;
  - con un pedido por habitacion, cada una casa con el suyo;
  - un pedido solo con el ID de Booking compartido queda en revision humana;
  - un ID no compartido sigue casando por Booking;
  - un duplicado real sigue detectandose.
- `npm test`: 480/480.

## 5. Para reanudar (decision de gerencia; nada de esto esta hecho)
1. Revisar y fusionar la PR de esta rama.
2. Fijar `SYNC_DESBLOQUEO = DESBLOQUEO-120` en las variables de Actions (requiere la confirmacion de acceso de
   gerencia). Cerrar la incidencia no desbloquea.
3. Con los limites actuales (1 borrador por ejecucion, 3 por dia, hasta 2 noches y 196 350 COP), las reservas
   pendientes se crean poco a poco. Las de los proximos dias no llegaran a tiempo por esa via: gerencia decide si se
   registran a mano o si autoriza otro limite. No se cambia nada sin esa decision.
4. Revisar a mano COT/2026/03915 (cancelada en Smoobu) y la reserva `...1422` (203, 27-29/11).
