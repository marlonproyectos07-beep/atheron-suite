# ATH-ODOO-HOTEL-009 -- Frente A: diseno UX "modo Angela" (2026-09-29)

> Esto es DISENO/ARQUITECTURA, no la UI construida dentro de Odoo. Construir
> la UI real (Studio o vistas nativas) sigue BLOQUEADO por falta de sesion
> STAGING con permisos suficientes -- ver `AI/ATH-ODOO-HOTEL-009_HANDOFF.md`.
> Este documento deja el contrato visual listo para que, en cuanto haya
> acceso, se construya sin decisiones de diseno pendientes.
>
> Fuente de datos: `integrations/odoo-hotel-gateway/src/
> operational-read-model.mjs` (Frente C, ya probado, 14 tests) y
> `angela-read-model.mjs` (ya existente). Ningun estado ni color de este
> documento es nuevo: todos vienen de `ANGELA_STATUSES`, ya en codigo.

## Principio

Angela nunca ve IDs tecnicos, JSON, ni menus de configuracion. Todo lo que
ve tiene que responder, en espanol llano, una de estas preguntas: "quien
llega hoy", "quien sale hoy", "que esta ocupado", "que esta libre", "quien
me debe plata".

## Estados reales del sistema (no se inventan paralelos)

`ANGELA_STATUSES` (`angela-read-model.mjs`) ya define 7 estados. De esos,
`deriveStatus()` hoy solo puede CALCULAR 4 a partir de fechas reales; los
otros 3 requieren un campo que la fuente (Odoo) todavia no expone via el
Gateway -- se muestran igual en el diseno, marcados como pendientes de
fuente, para que la UI no tenga que rediseñarse cuando ese campo llegue.

| Estado | Como se determina | Fuente |
|---|---|---|
| DISPONIBLE | `checkout <= referenceDate`, sin reserva futura que la cubra | CALCULADO (ya probado) |
| RESERVADA | `referenceDate < checkin` | CALCULADO (ya probado) |
| OCUPADA | `checkin <= referenceDate < checkout` | CALCULADO (ya probado) |
| CHECK-OUT | `referenceDate === checkout` | CALCULADO (ya probado) |
| HOLD | reserva sin confirmar, con bloqueo temporal | REQUIERE `explicit_status` de Odoo (el read-model ya sabe leerlo si llega, ver `holds()` en Frente C; hoy ningun fixture real lo trae) |
| LIMPIEZA | habitacion en preparacion entre salida y proxima entrada | REQUIERE campo de Odoo que aun no esta confirmado que exista (ver Fase 1 profunda, bloqueada) |
| BLOQUEADA | fechas no verificadas, o bloqueo manual | CALCULADO cuando faltan fechas; bloqueo manual explicito REQUIERE fuente |

**Regla de diseno:** un estado que "REQUIERE FUENTE" nunca se muestra
inventado. Mientras no llegue el campo real de Odoo, esas tarjetas
simplemente no ofrecen ese estado -- no se aproxima con OCUPADA/DISPONIBLE.

## Colores (mapeo fijo, no arbitrario por pantalla)

| Estado | Color | Motivo |
|---|---|---|
| DISPONIBLE | verde | accion positiva, se puede vender ahora |
| RESERVADA | azul | confirmado, futuro, sin accion urgente |
| HOLD | amarillo/ambar | temporal, requiere seguimiento antes de expirar |
| OCUPADA | gris oscuro | no vendible hoy, sin accion |
| CHECK-OUT (sale hoy) | naranja | accion de hoy: preparar salida |
| LLEGA HOY | azul fuerte (variante de RESERVADA + checkin=hoy) | accion de hoy: preparar entrada |
| PENDIENTE DE PAGO | rojo (badge superpuesto, no reemplaza el color de estado) | dinero pendiente, visible aunque la unidad este OCUPADA |
| LIMPIEZA | morado | transicion, aun no vendible |
| BLOQUEADA | negro/rayado | requiere revision humana, nunca se vende sin revisar |

`PENDIENTE DE PAGO` es un badge, no un estado de ocupacion: una unidad
puede estar OCUPADA y con pago pendiente al mismo tiempo (caso real:
Camilo, Airbnb, `collected: 0`). Superponer badges de dinero sobre el
color de ocupacion evita inventar un octavo estado que mezcle dos cosas
distintas.

## Formato: Kanban vs Calendario vs Lista vs Cards vs Dashboard

Evaluados los cinco, ninguno cubre solo, las cuatro preguntas de Angela
sin friccion:

- **Kanban** (columnas por estado): bueno para "cuantas hay en cada
  estado", malo para "que pasa HOY con la unidad 301" (hay que buscar en
  la columna correcta).
- **Calendario** (grilla de fechas x unidad): el mejor para ver
  ocupacion futura y detectar huecos, pero denso para una vista rapida
  de "que hago ahora mismo".
- **Lista**: la mejor para tareas accionables (pendientes de pago,
  proximas entradas) porque se puede ordenar/filtrar, pero pierde la
  vision de conjunto de las 6 unidades.
- **Cards** (una tarjeta por unidad): la mejor para "que esta pasando
  con cada alojamiento ahora mismo" de un vistazo, mala para planificar
  el futuro.
- **Dashboard** (numeros resumen arriba): necesario como punto de
  entrada, pero no reemplaza el detalle.

**Decision:** combinacion fija, no una sola pantalla:

```
HOME = Dashboard (resumen numerico) + Cards (6 unidades, hoy)
     + Lista (pendientes de pago / proximas entradas, accionable)
Calendario = vista SEPARADA, para cuando Angela necesita planificar
             fechas futuras o resolver un hueco, no la vista por defecto.
Kanban = no se usa como pantalla propia; su idea (agrupar por estado) ya
         vive en los colores de las cards, sin necesidad de otra pantalla.
```

## HOME -- "Centro de Operaciones" (wireframe)

```
+--------------------------------------------------------------------+
| ATHERON SUITE -- HOY, lunes 28 de septiembre de 2026               |
+--------------------------------------------------------------------+
| [ Entradas hoy: 2 ]  [ Salidas hoy: 1 ]  [ Ocupadas: 3/6 ]          |
| [ Disponibles: 2/6 ]  [ Pendientes de pago: 2 ]                     |
+--------------------------------------------------------------------+
|  201          202          203          301          302     CASA  |
| DISPONIBLE  RESERVADA    OCUPADA      OCUPADA     DISPONIBLE  RES. |
| (verde)     (azul)      $ pendiente  LLEGA HOY   (verde)    (azul)|
|                          (rojo badge) (naranja)                    |
+--------------------------------------------------------------------+
| PENDIENTES DE PAGO                                                 |
|  - Camilo, 301, Airbnb, $150.000, PENDIENTE                        |
|  - Monica, 203, sin canal, $120.000, PENDIENTE                     |
+--------------------------------------------------------------------+
| PROXIMAS ENTRADAS (14 dias)                                        |
|  - (lista ordenada por fecha, misma fuente que UPCOMING)           |
+--------------------------------------------------------------------+
| [ + NUEVA RESERVA MANUAL ]        [ Ver calendario ]                |
+--------------------------------------------------------------------+
```

Los numeros del resumen y las listas vienen 1:1 de
`buildOperationalDashboard()` (Frente C): `ARRIVALS.length`,
`DEPARTURES.length`, `IN_HOUSE.length`, `AVAILABLE.length`,
`PAYMENT_PENDING`, `UPCOMING`. No hay ningun numero en este wireframe que
no tenga ya una funcion probada que lo calcule.

## Tarjetas por unidad (201 / 202 / 203 / 301 / 302 / CASA COMPLETA)

Cada card es un `toOperationalItem()` renderizado. Ejemplo con datos
FICTICIOS (marcados como EJEMPLO, nunca datos reales de un huesped sin
autorizacion) para ilustrar los 4 estados que hoy se pueden calcular mas
el badge de pago:

```
+----------------------+   +----------------------+
| 301  [OCUPADA]        |   | 201  [DISPONIBLE]     |
| Huesped: (EJEMPLO)    |   | Sin reserva activa     |
| Sale: hoy             |   | Libre desde: 27/09     |
| [$ PENDIENTE DE PAGO] |   | [ Reservar ]           |
+----------------------+   +----------------------+

+----------------------+   +----------------------+
| 202  [RESERVADA]      |   | CASA COMPLETA         |
| Llega: 02/10          |   | [BLOQUEADA]            |
| Huesped: (EJEMPLO)    |   | Fechas sin verificar    |
| [ Ver detalle ]        |   | -- requiere revision    |
+----------------------+   +----------------------+
```

Cada card tiene, como minimo, un boton de accion coherente con su
estado: DISPONIBLE -> "Reservar" (abre el flujo del Frente B); OCUPADA/
RESERVADA -> "Ver detalle"; BLOQUEADA -> "Revisar" (nunca un boton de
venta directa).

## Que falta para construir esto de verdad

1. Sesion Odoo STAGING con permisos de vista/Studio (mismo bloqueo ya
   documentado en el handoff) -- para construir la UI real dentro de
   Odoo o decidir si se construye como capa web aparte (como el canario
   de HOTEL-008) consultando el mismo Gateway.
2. Confirmar en Odoo si existe ya un campo de estado explicito (para
   HOLD/LIMPIEZA) o si hay que crearlo -- Fase 1 profunda, bloqueada.
3. Decision de Marlon (no tecnica): construir esta UI DENTRO de Odoo
   (vistas nativas/Studio) vs como capa web propia que consulta el
   Gateway (como ya se hizo con el canario web de disponibilidad). Las
   dos opciones son compatibles con este diseno visual sin cambios.

## Estado

DISEÑADO Y CONTRATADO (colores, estados, layout, fuente de cada dato).
CERO UI CONSTRUIDA (bloqueado por acceso, no por diseno). Ningun estado
inventado: los 7 ya existian en `ANGELA_STATUSES`; este documento solo
les da color, jerarquia visual y disposicion de pantalla.
