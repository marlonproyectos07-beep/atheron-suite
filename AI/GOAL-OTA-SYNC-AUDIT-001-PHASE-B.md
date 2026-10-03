# GOAL-OTA-SYNC-AUDIT-001 — PHASE B local

Estado: arquitectura continua **demostrada únicamente con fixtures y puertos inyectados**. No hay conexión, credencial, scheduler remoto, feed registrado, despliegue ni cambio real en Booking, Airbnb, Odoo STAGING o Production. Restauración previa: commit PHASE A `fda6b65` en `feature/ath-odoo-hotel-017-booking-airbnb-level1`.

## Fuente de verdad y contratos

Odoo/Gateway sigue siendo la fuente operativa de disponibilidad. `continuous-sync-runner.mjs` usa el puerto `listBlocks/applyBlock/releaseBlock` HOTEL-017 y `snapshot-reconcile.mjs`; la salida se deriva en cada ciclo de `exportCalendar()` desde Odoo. El journal local contiene solo lotes técnicos iCal saneados y versiones observadas, **no** un segundo inventario. `createMemoryJournal()` y los adapters fixture son exclusivamente de prueba; activación real exige almacenamiento durable y seguro.

`canonical-event.mjs` define un único evento con `SOURCE`, `PROPERTY`, `UNIT`, `EXTERNAL_REF`, `START`, `END`, `STATUS`, `EVENT_TYPE`, `BOOKED_AT`, `UPDATED_AT`, `RECEIVED_AT`, `IDEMPOTENCY_KEY`. Fuentes admitidas en el contrato: BOOKING, AIRBNB, DIRECT, ODOO e ICAL. Un VEVENT Booking/Airbnb produce `EVENT_TYPE=CALENDAR_BLOCK` y `BOOKED_AT=null`; iCal no acredita reserva comercial, fecha de venta ni pago. `LAST-MODIFIED` se usa solo si viene como fecha UTC válida. Las otras fuentes tienen contrato canónico, pero ningún conector real en PHASE B.

`BookingAdapter`, `AirbnbAdapter`, `OdooAdapter` e `IcalAdapter` declaran `fetchAvailability`, `fetchReservations`, `block`, `release`, `health` y `reconcile`; sin implementación inyectada devuelven `UNSUPPORTED_OPERATION`. No se afirma que una OTA ofrezca todas estas operaciones. El runner fixture usa `fetchReservations` para entrada y `reconcile/fetchAvailability` para modelar y verificar salida. En iCal real, la salida consistiría en publicar un feed e introducir su URL en cada canal; la llamada local `reconcile()` **no** demuestra que el canal lo haya importado.

## Ciclo local, recuperación y observabilidad

Cada tick serializa los trabajos de una instancia, lee el feed fixture, descarta `SUMMARY`/`DESCRIPTION`, encola el lote técnico, normaliza y aplica mediante `reconcileSnapshot()`, y reconoce el lote tras éxito. Conserva el UID técnico para idempotencia; un UID puede ser sensible y deberá protegerse en cualquier almacén durable. Si Odoo falla, el lote queda pendiente; si el proceso reinicia con el mismo journal/snapshot, el replay consulta Odoo y no crea otro bloqueo. Si falla la salida después de aplicar, el tick siguiente reconstruye el feed deseado desde Odoo y reintenta la proyección. El journal en memoria demuestra la secuencia; **no** sobrevive a un reinicio del proceso real ni sustituye una cola durable. Un iCal corrupto o una lectura fallida no libera. Un feed completo sin UID requiere dos lecturas correctas para liberar solo el bloqueo propio. La completitud del feed debe acreditarse antes de activar `allow_empty` con proveedores reales.

Se mantienen `last_successful_sync`, `last_event_received`, `sync_lag_seconds`, `conflict_count`, `new_overbooking_count`, `at_risk_units`, `adapter_health` y `stale_event_count`. `last_successful_sync` mide reconciliación local, **no** acuse de importación OTA. Alertas locales: P0/CRITICAL para `NEW_OVERBOOKING` o conflicto no clasificable; P1 para `SYNC_STALE`, `ADAPTER_DOWN`, `SYNC_BACKEND_DOWN`, `AT_RISK_INVENTORY` y `STALE_EVENT`. Un fallo Odoo se atribuye al backend, no al adaptador Booking/Airbnb. Un conflicto iCal sin `BOOKED_AT` queda `UNCLASSIFIED_CONFLICT` con severidad CRITICAL; no se marca silenciosamente como legado. Las versiones `LAST-MODIFIED` anteriores a la aceptada se ponen en cuarentena; si el feed no trae versión causal, no se puede garantizar el orden de cambios.

`reconciliation.mjs` compara observaciones completas y recientes con Odoo y clasifica `MATCH`, `MISSING_IN_ODOO`, `MISSING_IN_OTA`, `CONFLICT`, `STALE` y `UNKNOWN`. Es pura y repetible. Un estado `MISSING_IN_OTA` de salida se basa en disponibilidad observada del fixture; para un canal real sería `UNKNOWN` hasta obtener lectura/acuse fiable.

## Atomicidad y ventana de riesgo

El Gateway actual no expone versión de inventario, compare-and-set ni transacción conjunta con Booking/Airbnb. El test local muestra que un puerto con lock y nueva comprobación atómica impide dos bloqueos incompatibles; el test PHASE A muestra que `listBlocks()` seguido de `applyBlock()` separados permite la carrera. El fake atómico **no acredita** que la acción Odoo 1967 posea esa garantía. PHASE C requiere clave de idempotencia única estructural, serialización por unidad/CASA, CAS/versionado en el mismo commit Odoo, reintentos acotados, cuarentena de eventos stale y escalamiento de conflictos. Un lock solo en la instancia del runner no protege varias instancias.

La cota conceptual de `risk-window.mjs` es:

`MAX_OVERBOOKING_WINDOW ≤ publicación origen + espera de polling + aplicación Gateway + publicación salida + importación destino + reintentos`.

Solo es una cota **condicional** cuando todos los retrasos tienen máximo comprobado y no hay caída prolongada. Para la configuración real actual, publicación/importación OTA y recuperación ante caídas no tienen cotas verificadas; por tanto `MAX_OVERBOOKING_WINDOW = UNKNOWN_OR_UNBOUNDED`, nunca cero. Ni iCal ni un webhook eventual vuelven atómicas dos ventas ya confirmadas por OTAs distintas.

| Fuente/mecanismo | Propuesta para piloto futuro | Límite aún sin verificar |
|---|---|---|
| Booking entrada iCal | medir cadencia; comenzar con sondeo objetivo de 5 min si sus condiciones lo permiten | publicación del feed y modo «solo fechas reservadas» |
| Airbnb entrada iCal | medir cadencia; objetivo inicial de 5 min si el canal lo permite | publicación y completitud del feed |
| iCal salida a OTA | recalcular tras cada cambio Odoo y mantener endpoint disponible | frecuencia con que cada OTA importa el feed |
| Odoo/Gateway | aplicar y auditar en el mismo ciclo; reconciliar/alertar por antigüedad | atomicidad de 1967 y durabilidad del journal |

Los intervalos anteriores son **propuestas de medición**, no configuración activa ni límites oficiales del proveedor. El CLI local usa 100 ms por defecto solo para fixtures. La protección práctica mientras exista latencia no acotada requiere un cierre operativo autorizado de la venta cruzada en inventario `AT_RISK`.

## Cobertura de unidades

Se conserva el inventario PHASE A: TOTAL_UNITS=6; CONNECTED=0; PARTIAL=1 (302); UNCONNECTED=5 (201, 202, 203, 301, CASA); AT_RISK=6. `UNKNOWN=0` describe que las seis unidades están clasificadas por **conexión a Odoo**; IDs/listings pendientes siguen explícitos en `GOAL-OTA-SYNC-AUDIT-001-PHASE-A.md`. Ninguna prueba local cambia estos contadores.

## Ejecución reproducible

- `npm run phase-b` desde `integrations/odoo-hotel-ical`: tres ciclos finitos con fixtures, intervalo local configurable con `PHASE_B_LOCAL_INTERVAL_MS` y ciclos con `PHASE_B_LOCAL_CYCLES`. No carga URLs, credenciales ni puertos reales.
- `npm run phase-a`: regresiones anteriores de PHASE A.
- `npm test` en `integrations/odoo-hotel-ical` y en `integrations/odoo-hotel-gateway`: todas las regresiones locales.

Se inyectaron fallos de Booking, Airbnb, iCal corrupto, UID duplicado con fechas contradictorias, orden inverso, cancelación tardía, release duplicado, reinicio con stores compartidos, salida fallida tras aplicar y Odoo temporalmente caído. Un lote con VEVENT sin cierre o UID contradictorio se rechaza antes de escribir. La recuperación local evita doble bloqueo; la persistencia real y la semántica de cada canal siguen pendientes.

## Gates separados para PHASE C — no ejecutados

1. **Odoo STAGING:** autorizar lectura/configuración de cada unidad, unique key/versión y transacción atómica en Gateway/acción 1967, journal durable, auditoría y prueba real controlada. Resolver primero slots Booking 302 sin UID.
2. **Booking:** autorizar inventario de room/calendar IDs y feeds por unidad y CASA, revisar modo de exportación, alta de feeds Odoo y retiro coordinado de enlaces directos solo tras paridad. Ninguna reserva pagada como prueba.
3. **Airbnb:** autorizar confirmación de listings, feeds y calendarios importadores por unidad/CASA, alta de salida Odoo y prueba controlada reversible sin huéspedes reales.
4. **Schedulers:** autorizar runner persistente con exclusión distribuida, límites de frecuencia medidos, reintentos, dead-letter y alertas. No reutilizar el cron NOBEDS de Production.
5. **Credenciales/secretos:** autorizar referencias a feeds privados y claves exclusivamente en gestor seguro; nunca en Git, logs ni informes. Verificar rotación sin romper conexiones existentes.
6. **Deploy:** autorizar Preview aislado y observación de entrada/salida. Production, tarifas, reservas comerciales y merge a main requieren un gate posterior distinto.

Semáforo: **PHASE B local completa cuando pasan tests; OTA real permanece NO READY**. La atomicidad entre canales y la cobertura de seis unidades no se acreditan con fixtures.
