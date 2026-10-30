# Sincronizacion Smoobu -> Odoo por ID unico (ATH-DEV-115)

Estado: **solo plan y simulacion**. `WRITES_ENABLED=false` y `RELEASE_UNLOCKED=false`. No existe en esta fase ningun codigo que escriba.

## Piezas

| Archivo | Que hace |
|---|---|
| `src/sync-intent.mjs` | Planificador puro: a partir de la conciliacion por IDs decide una operacion por reserva. |
| `src/sync-dryrun-run.mjs` | Lecturas reales (las del conciliador diario + una tanda extra de `search_read`) y plan. |
| `scripts/sync-dryrun.mjs` | Imprime el plan publico (enmascarado). Modo `sync-dryrun` del workflow de diagnostico. |

## Identidad y referencias

- Clave unica: `SMOOBU-<id>` en `x_pms_reference`. Formato igual que los pedidos hechos a mano:
  `SMOOBU-<id> / Booking <n>` o `/ Airbnb <codigo>`; `client_order_ref` = `Smoobu <id> ...`.
- Nunca se identifica por nombre, habitacion o fechas: eso solo produce AMBIGUA (bloqueo).

## Operaciones

| Operacion | Cuando | Estado maximo |
|---|---|---|
| CREATE_ORDER | Reserva vigente sin pedido ni ocupacion en Odoo | LISTO (crea BORRADOR) |
| UPDATE_ORDER (relleno) | Pedido conciliado al que le falta referencia, canal, fechas de alquiler o precio manual | LISTO |
| UPDATE_ORDER (fechas) | Mismo ID con fechas distintas, mismas tarifa y habitacion | REQUIERE_APROBACION |
| CONFIRM_ORDER | Borrador completo | REQUIERE_APROBACION |
| CANCEL_ORDER | Cancelada en Smoobu y vigente en Odoo | REQUIERE_APROBACION |
| NOOP / BLOCKED | Resto | — |

Pedido nuevo: producto de la habitacion, cantidad 1, `price_unit` = total de Smoobu, `x_precio_manual` = el mismo valor,
sin impuestos mientras `TAX_POLICY` este PENDIENTE, entrega 15:00 y salida 11:00 de Bogota, estado borrador.

## Bloqueos

SOBREVENTA, REVISION_MANUAL, AMBIGUA, PRECIO_FALTANTE, PRODUCTO_NO_MAPEADO (Casa Completa), CANAL_DESCONOCIDO,
TARIFA_DISTINTA (nunca se corrige un precio), CAMBIO_DE_HABITACION, PEDIDO_FACTURADO, PAGOS_EXISTENTES,
ESTANCIA_INICIADA (una cancelacion el dia de llegada no prueba que el huesped no se alojo), NOCHES_OCUPADAS,
CANCELADA_EN_ODOO_VIGENTE_EN_SMOOBU, ID_DISTINTO, SIN_TURNO, USO_DIURNO, PEDIDO_SIN_RESERVA_EN_SMOOBU.
IMPUESTO_PENDIENTE es un aviso: no bloquea crear el borrador, pero obliga a aprobar la confirmacion.

## Requisitos para una futura activacion (NO incluida en este PR)

1. Decision del contador sobre IVA por canal (directa, Booking, Airbnb, huesped extranjero) y cambiar `TAX_POLICY`.
2. Producto de venta de Casa Completa definido (hoy PRODUCTO_NO_MAPEADO).
3. Cliente de escritura NUEVO con lista blanca: solo `res.partner.create`, `sale.order.create/write`, `sale.order.line.write`
   sobre los campos del plan; nunca `unlink`, pagos ni facturas. Revalidar las `preconditions` de cada operacion
   (releer Smoobu y Odoo, `write_date` sin cambios) justo antes de escribir.
4. Usuario tecnico de Odoo con permisos minimos y su propia clave (hoy la clave es de un administrador).
5. Primer ciclo: solo CREATE_ORDER en borrador, de una en una, con aprobacion, y conciliacion de verificacion despues.
6. Interruptores: `WRITES_ENABLED` y `RELEASE_UNLOCKED` solo cambian con orden expresa de gerencia, en un PR aparte.
