# GOAL-OTA-SYNC-AUDIT-001 — PHASE A local

Estado: protección preparada y medida **solo en código local**. No se activó un corte real ni se tocó Booking, Airbnb, Odoo, credenciales, disponibilidad o despliegues.

Punto de restauración previo: commit `ed0b7d63cbd119360750912a663624dec2a90953` en `feature/ath-odoo-hotel-017-booking-airbnb-level1`, coincidente con `origin` antes de estos cambios. Los artefactos locales ajenos que ya estaban sin seguimiento no se modificaron.

## Inventario técnico canónico

`src/phase-a-inventory.mjs` es un inventario de evidencia. No contiene feed URLs ni credenciales y **no** habilita un canal. `CONNECTED` exige sincronización continua OTA ↔ Odoo acreditada. `PARTIAL` significa que existe evidencia real de una parte del circuito. `UNCONNECTED` significa que no existe configuración de feed hacia/desde Odoo documentada. `UNKNOWN` se reserva para una unidad cuya cobertura ni siquiera se puede clasificar; un ID de anuncio desconocido se anota aparte y no equivale a un ID inexistente.

| Unidad | Odoo unit_id documentado | Booking esperado/documentado | Airbnb documentado | Cobertura hacia Odoo |
|---|---:|---|---|---|
| 201 | 1 | Hotel Atheron Suite `16559325`; room/calendario pendiente | ID y feed pendientes | UNCONNECTED |
| 202 | pendiente | Hotel Atheron Suite `16559325`; room/calendario pendiente | ID y feed pendientes | UNCONNECTED |
| 203 | pendiente | Hotel Atheron Suite `16559325`; room/calendario pendiente | ID y feed pendientes | UNCONNECTED |
| 301 | pendiente | Hotel Atheron Suite `16559325`; room/calendario pendiente | listing `1057232086445101786`; feed pendiente | UNCONNECTED |
| 302 | 5 | Hotel Atheron Suite `16559325`, calendario `1655932505` | listing `1119517434126866031` | PARTIAL: feeds reales y piloto Airbnb puntual; sin runner ni salida Odoo registrada |
| CASA COMPLETA | 6 | Atheron Grand House `16569053`; calendario pendiente | existencia de anuncio e ID pendientes | UNCONNECTED |

**Contadores:** TOTAL_UNITS=6, CONNECTED=0, PARTIAL=1, UNCONNECTED=5, UNKNOWN=0, AT_RISK=6. Son estados agregados de conexión con Odoo, no afirmaciones de que los anuncios Airbnb pendientes existan. Base: `ATH-ODOO-HOTEL-017_MAPPING.md` y `ATH-ODOO-OTA-REAL-GATE-AUDIT.md` (auditoría fechada 2026-10-02). Esa auditoría registró dos filas `x_hotel_ota_feed`, ambas 302, con referencias inbound/outbound vacías. PHASE A no volvió a consultar sistemas reales.

## Protection cutoff formal

El corte es un instante UTC `cutoff_at` que deberá registrarse **al activar de verdad** la protección; PHASE A no le asigna fecha ni lo activa. `classifyOverbooking()` clasifica:

- `LEGACY_OVERBOOKING`: conflicto cuyos dos o más eventos se originaron antes del corte, con fechas de creación verificables.
- `NEW_OVERBOOKING`: conflicto con al menos un evento creado desde el corte inclusive. Incidente crítico; preservar eventos y escalar. Nunca auto-cancelar una reserva comercial.
- `AT_RISK`: no hay conflicto observado, pero no se ha acreditado sincronización.
- `UNCLASSIFIED_CONFLICT`: conflicto con corte o fecha de creación faltante; no asumir que sea legado.

Se debe fijar una línea base de conflictos/UID y un reloj UTC antes del corte real. La fecha del *stay* no sirve para clasificar el origen de la reserva.

## Protección reutilizada y límites medidos

La regla existente de `inventory-model.mjs` es independiente del origen y cubre BOOKING, AIRBNB, DIRECT, ODOO, HOLD e ICAL: CASA bloqueada cierra las cinco habitaciones; cualquier habitación bloqueada cierra CASA, sin cerrar habitaciones hermanas. Los adapters iCal mantienen clave por canal/unidad/listing/UID, replay, deduplicación por lote y liberación por propietario. Se corrigió localmente la secuencia de dos ausencias: un fallo de lectura o un feed vacío inesperado reinicia `missing_count` antes de cualquier liberación.

**Atomicidad no demostrada:** `applyBlock()` hace `listBlocks()` y luego `applyBlock()` separados. En las carreras A (Booking 201/Airbnb CASA) y B (Airbnb CASA/Booking 301), un puerto local deliberadamente no atómico permitió `APPLIED` para ambos. Esto revela una ventana real del diseño, no una prueba de atomicidad de Odoo; la implementación remota podría tener guardias adicionales que no se verificaron aquí. En C, dos habitaciones distintas se aplicaron sin conflicto y cerraron CASA. En D, una consulta durante una liberación puede ver el estado anterior o posterior. Ninguna carrera local confirma una venta OTA comercial.

**Orden de revisiones:** un UID actualizado mantiene una sola entrada, pero el adaptador no usa una versión causal verificable de Booking/Airbnb. Si llega después una revisión antigua del mismo UID, puede devolver el bloqueo a fechas previas. Requiere fuente de versión/orden o reconciliación del snapshot completo antes de activar polling.

## Runner local

Desde `integrations/odoo-hotel-ical`: `npm run phase-a`. Imprime contadores derivados del inventario y ejecuta todos los tests del paquete con Node. No carga variables de entorno, no abre red ni escribe fuera de memoria. Casos cubiertos: exclusión cruzada, replay/duplicado, actualización, cancelación/liberación, orden de llegada, corte y carreras A–D. El Gateway se verifica por separado con `npm test` desde `integrations/odoo-hotel-gateway`; sus tests son locales.

## Diseño de PHASE B (no implementado)

1. **Fuente de verdad:** Odoo para disponibilidad interna, con identidad de cada bloqueo externo por canal/unidad/listing/UID. Una reserva confirmada por OTA no se puede rechazar comercialmente desde Odoo: un `CONFLICT` es incidente y exige respuesta operativa.
2. **Entrada:** obtener cada feed iCal real por referencia segura, mapearlo a una unidad, sondearlo con runner persistente y bloquear ejecuciones paralelas del mismo par canal/unidad. Medir primero cadencia y límites reales; objetivo operativo inicial de lectura cada 1–5 minutos si los canales lo permiten, sin prometer latencia de entrega. Registrar último éxito, antigüedad, errores, recuentos, UID saneado y alertar tras dos ciclos fallidos o pérdida de frescura.
3. **Salida:** publicar los feeds Odoo existentes por unidad/canal, registrar cada destino en Booking/Airbnb solo tras verificar su comportamiento. Exportar bloqueos propios de otra unidad para cerrar CASA ↔ habitación; evitar eco sobre la misma unidad. Mantener horizon y `503` ante error, nunca un calendario vacío ficticio.
4. **Idempotencia y liberación:** reconciliación durable, unicidad/serialización transaccional en Odoo o Gateway, revisión causal del UID, dos lecturas correctas consecutivas de un feed completo antes de liberar, y verificación de propietario/fechas. Corregir colisión de slots Booking 302 importados manualmente antes de automatizar.
5. **API/webhook:** evaluar capacidades oficiales de cada canal y un gestor de canales para eventos/confirmaciones más rápidos. iCal y polling son eventualmente consistentes; no garantizan cero sobreventas con anuncios simultáneos abiertos. Hasta demostrar cierre confirmado por todos los destinos, mantener cerrada la venta cruzada de unidades en riesgo mediante un cambio operativo autorizado por separado.
6. **Corte:** retirar la conexión directa Booking↔Airbnb 302 solo con plan de migración y comprobación de paridad; no duplicar rutas activas. Probar eventos reales controlados por unidad, replay, cancelación, recuperación de error y acuse de destino antes de declarar READY.

**Límite de PHASE A:** no se puede declarar protección real ni cobertura de canales con pruebas sintéticas. Siguiente paso seguro: revisión del inventario y del plan de cierre operativo, seguida de autorización específica para PHASE B y para cualquier intervención en sistemas reales.
