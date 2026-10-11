# ATH-BEDS24-GO-LIVE-QA-001 — Auditoría comercial y anti-sobreventa del go-live

Rol: auditor. Solo lectura de repositorio. Sin escrituras en Beds24, sin OTA, sin Odoo, sin reservas reales.
Alcance del gate: **201, 202, 203, 301, 302**. Casa Completa queda **fuera del gate** y se maneja a mano.

## 0. Estado existente (HECHO / VERIFICADO desde documentos y código)

Fuentes leídas: `AI/ATH-BEDS24-003-LOCAL-DURABILITY.md` (incluye el checkpoint ATH-BEDS24-031), `integrations/odoo-hotel-gateway/src/beds24/*`, `AI/ATH-ODOO-HOTEL-017_*`. No existe un archivo propio «ATH-BEDS24-030»: lo documentado empieza en 002/003 y 031.

| Dato | Valor | Fuente |
|---|---|---|
| Propiedad Beds24 | 359051 «Suite Atheron», COP | 031 |
| Room IDs | 201=740215, 202=740217, 203=740218, 301=740219, 302=740220, Casa=740221 (maxPeople 22) | 031 |
| Permisos API | read:bookings, read:inventory, read:properties, write:inventory (**no** write:bookings) | 031 |
| Enlaces de canales activos | **0** | 031 |
| Escritura inventario 5 hab. + rollback | PASS | 031 |
| Casa Completa | disponibilidad calculada BLOQUEADA; `numAvail=1` no se aplica; soporte Beds24 pendiente | 031 |
| Gateway Beds24 | adapter, event store y puerto Odoo **sintéticos**; ID reales no cableados | 003 |
| Odoo STAGING | Booking/302 ya importa bloques iCal como `planning.slot`; UID aún no adoptado | 017 |

**Consecuencia clave:** con 0 enlaces de canal, Beds24 hoy **no recibe ni publica** nada de Booking/Airbnb. El go-live depende de conectar los canales (acción humana de Marlon/Beds24, fuera de esta misión).

## 1. Reglas de oro (anti-sobreventa)

1. **Un solo calendario:** Beds24, propiedad 359051. Nada vale si no está allí.
2. **Nada de fechas «de memoria»:** antes de prometer, mirar Beds24.
3. **Estado ≠ borrado:** una reserva cancelada se marca cancelada, no se borra; un bloqueo se retira explícitamente.
4. **Habitación siempre asignada:** ninguna reserva sin habitación (201/202/203/301/302).
5. **Casa Completa (manual):** cada reserva de Casa se registra como **bloqueo en las 5 habitaciones** para las mismas fechas, con nota «CASA». Y antes de vender una habitación se mira que no haya bloqueo CASA. Hasta la respuesta de Beds24 Support no se confía en el cálculo automático.
6. **Check-out no bloquea la noche:** salida y entrada el mismo día es válido; solapar noches no.

## 2. Checklist de reconciliación (T2)

Frecuencia: **diaria** (5 min, antes de las 10:00) sobre los próximos 90 días; **semanal** (30 min, lunes) sobre 12 meses; **inmediata** tras cualquier cambio de canal. Fuente por canal: panel Booking, panel Airbnb, hoja/WhatsApp de directas, Beds24.

Para cada habitación 201/202/203/301/302, recorrer las reservas futuras y marcar:

| # | Detección | Cómo se ve | Acción |
|---|---|---|---|
| R1 | **Doble reserva** | dos reservas activas de la misma habitación con noches comunes (`ini_A < fin_B` y `ini_B < fin_A`) | Congelar venta de esa habitación; conservar la más antigua por fecha de creación; reubicar o cancelar la otra con el huésped |
| R2 | **Misma reserva duplicada** | mismas fechas + misma habitación + mismo huésped/ID de canal aparecen 2 veces (p. ej. WhatsApp y canal) | Dejar una, la que tenga ID de canal; borrar el duplicado como «duplicada» |
| R3 | **Fechas cruzadas** | el panel del canal dice fechas distintas a Beds24 (modificación no reflejada) | Prevalece el **canal** si la reserva es de canal; corregir Beds24 |
| R4 | **Reserva sin habitación** | reserva en Beds24 sin room o con room no 201–302 | Asignar habitación hoy o liberar |
| R5 | **Bloqueo administrativo** | bloqueo sin motivo/responsable/fecha de fin | Cada bloqueo lleva nota: motivo, quién, hasta cuándo; sin nota → investigar |
| R6 | **Cancelada aún bloqueando** | cancelada en canal/WhatsApp pero activa en Beds24 | Cancelar en Beds24 y comprobar que el calendario se libera |
| R7 | **WhatsApp no registrada** | conversación con «confirmado» sin reserva en Beds24 | Registrar ya; si ya está ocupada → R1 |
| R8 | **Huella de Casa** | reserva CASA sin los 5 bloqueos, o bloqueos CASA sin reserva | Completar/retirar los 5 bloqueos |
| R9 | **Reserva sin canal de origen** | sin etiqueta Booking/Airbnb/Directa/Web | Etiquetar |

Registro: una línea por hallazgo (fecha de revisión, habitación, tipo R1–R9, resolución, quién). Meta del gate: **0 hallazgos abiertos** al cierre del día.

**Cruce externo (lectura):** exportar de Booking y Airbnb las reservas futuras y contarlas por habitación; el recuento debe coincidir con Beds24 (por canal). Diferencia ≠ 0 ⇒ hallazgo.

## 3. Procedimiento temporal para Ángela (T3)

> **Regla única: si no está en Beds24, no existe.** Mirar Beds24 antes de decir «sí hay».

Flujo común (todas las ventas): 1) mirar Beds24 las fechas; 2) elegir habitación libre; 3) crear/confirmar en Beds24; 4) solo entonces confirmar al huésped; 5) ponerlo en la bitácora.

| Caso | Pasos |
|---|---|
| **Llamada** | Mirar Beds24 → crear reserva (origen «Directa-llamada») → confirmar al huésped → bitácora |
| **WhatsApp** | Igual, origen «Directa-WhatsApp». Prohibido decir «reservado» antes de que exista en Beds24 |
| **Web** | Hasta que la web escriba en Beds24, las solicitudes de la web son **solicitudes**, no reservas: Ángela las verifica y crea en Beds24 en < 1 h hábil; si ya no hay cupo, avisa y ofrece alternativa |
| **Booking** | Llega por canal (cuando el enlace esté activo). Si el canal aún no está enlazado: al recibir correo de Booking, crear **bloqueo** manual con ID de Booking en la nota ese mismo día; revisión diaria R3/R6 |
| **Airbnb** | Igual que Booking |
| **Modificación** | Buscar la reserva → cambiar fechas/habitación **primero comprobando el calendario** → si es de canal, cambiarla también en el canal → bitácora. Nunca editar sin comprobar solape |
| **Cancelación** | Cambiar estado a **cancelada** (no borrar) → si es de canal, cancelar en el canal → comprobar que quedó libre |
| **HOLD temporal** | En Beds24, crear reserva «HOLD» con nota «HOLD hasta AAAA-MM-DD HH:MM, nombre». Máximo **2 h** (alineado con el HOLD 2 h de Odoo); a la hora vencida: o se confirma o se cancela. Revisión de HOLD vencidos a las 10:00, 14:00 y 18:00 |
| **Casa Completa** | Registrar bloqueo en 201, 202, 203, 301 y 302 con nota «CASA + nombre» |

Bitácora mínima de Ángela (una línea): hora · habitación · fechas · origen · acción (nueva/mod/cancel/HOLD) · hecho en Beds24 ✔ / en canal ✔.

Prohibiciones: dos calendarios paralelos, WhatsApp como «calendario», confirmar de palabra sin Beds24, borrar reservas, editar Odoo para disponibilidad durante este periodo.

## 4. Criterios PASS/FAIL del go-live (T4)

Evidencia: captura o registro por prueba. Todo ítem es PASS/FAIL; **un FAIL en las secciones G1–G3 bloquea el go-live.** Las pruebas de escritura de reservas se hacen con datos de prueba rotulados «QA», en fechas elegidas por Marlon, y se retiran al terminar. **No ejecutadas en esta misión.**

| ID | Criterio | PASS si | FAIL si |
|---|---|---|---|
| G1-1 | Cinco habitaciones | 201/202/203/301/302 existen con los IDs 740215/17/18/19/20 y reservables | falta alguna o ID distinto |
| G1-2 | Disponibilidad | la disponibilidad de cada habitación en Beds24 coincide con la realidad (cruce de 90 días con recuento de reservas existentes = 0 diferencias) | cualquier diferencia |
| G1-3 | Reservas existentes | todas las reservas futuras de Booking/Airbnb/directas están cargadas **antes** de abrir a la venta | alguna falta (R7) |
| G2-1 | Directa | reserva QA en una habitación se crea, aparece en calendario y queda sin disponibilidad esas noches | no bloquea |
| G2-2 | Booking | con el canal enlazado, reserva de prueba/real entra con habitación correcta y fechas exactas; el bloqueo se refleja en Airbnb/otros en < 15 min | no entra, habitación errada o no se propaga |
| G2-3 | Airbnb | ídem Booking | ídem |
| G2-4 | Modificación | cambiar fechas de una reserva en cada origen cambia el calendario (libera noches viejas y ocupa nuevas) | noches viejas siguen bloqueadas o solape permitido |
| G2-5 | Cancelación | cancelada libera 100 % de noches en Beds24 y en los otros canales | sigue bloqueando |
| G3-1 | **Anti-sobreventa** | intentar reservar noches ya ocupadas, desde cada canal, es rechazado o queda como conflicto alertado; ninguna doble reserva existe tras 7 días de operación | cualquier R1 sin detectar el mismo día |
| G3-2 | Cruce de canales | una reserva en Booking cierra esa habitación en Airbnb y viceversa | queda abierta |
| G3-3 | HOLD | un HOLD bloquea y vence/cancela a las 2 h; ninguno queda > 2 h | HOLD vencido bloqueando |
| G3-4 | Casa manual | una reserva CASA de prueba bloquea las 5 habitaciones y al retirarla las libera | queda alguna bloqueada/libre |
| G4-1 | Operación de Ángela | Ángela ejecuta sola (sin ayuda) llamada, WhatsApp, modificación, cancelación y HOLD en ≤ 5 min cada uno, con bitácora | requiere ayuda o omite Beds24 |
| G4-2 | Reconciliación diaria | 7 días seguidos con checklist R1–R9 hecho y 0 hallazgos abiertos | día omitido o hallazgo abierto |
| G4-3 | Rollback | existe exportación previa de calendario/reservas y procedimiento para cerrar venta (bloqueo masivo) | no existe |

**Fuera del gate:** Casa Completa automática, Odoo como cerebro, pagos, tarifas dinámicas.

**Pruebas que ya no se repiten (pasaron en 031):** autenticación, escritura/rollback de inventario en las 5 habitaciones.
**Brecha de verificación:** la API tiene `write:inventory` pero **no `write:bookings`**; las reservas se crearán por el panel o por canal, no por API. Hay que decidir si se pide ese permiso (no se hizo).

## 5. Riesgo: Beds24 maestro temporal vs. Odoo definitivo (T5)

### 5.1 Riesgos

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| C1 | **Dos verdades:** Odoo STAGING ya importa bloques iCal de Booking/302 y tiene HOLD propio; Beds24 sería otra | Alta | Odoo no se usa para disponibilidad en el periodo; se congela la importación iCal a Odoo para estas unidades |
| C2 | **Canales sin enlazar (0)**: Beds24 no ve Booking/Airbnb; la sobreventa ya es posible hoy | Crítica | Enlazar canales antes de vender o cargar manualmente; checklist diario R3/R6 |
| C3 | **Casa Completa manual**: error humano deja las 5 habitaciones abiertas | Alta | Regla 5; chequeo R8; bloqueo CASA con nota |
| C4 | **Mapeo duplicado:** Booking de Casa es otra propiedad (hotel 16569053) y puede vender las mismas noches | Alta | Cerrar Casa en Booking/Airbnb manualmente o por bloqueo de calendario mientras haya reservas en habitaciones; revisar semanal |
| C5 | **Sin API de reservas** (no write:bookings), dependencia del trabajo manual de Ángela | Media | Bitácora, doble revisión, decidir el permiso |
| C6 | **Gateway sintético:** el store local no es transaccional con Odoo | Media | No usarlo en producción hasta el gate de Fase C; Beds24 no escribe a Odoo en este periodo |
| C7 | **Historial perdido** en la transición (UIDs, IDs de reserva) | Alta | Exportar y conservar `bookingId` de Beds24 + ID de canal (ver 5.2) |
| C8 | **Dependencia de una sola persona** (Ángela) | Media | Segunda persona entrenada, guía de 1 página |

### 5.2 Transición Beds24 temporal → Odoo/Gateway como autoridad

Principio: **nunca hay dos escritores a la vez; el corte se hace con una ventana de congelación y conciliación al 100 %.**

1. **Preparación (Beds24 sigue maestro):** mapeo real cableado (account/property 359051, rooms 740215–740220) en el Gateway; adopción de UID Booking/302 (propuesta 017) resuelta; Odoo con cada reserva de Beds24 importada en **sombra** (solo lectura/comparación, sin publicar a canales).
2. **Sombra (≥ 14 días):** el Gateway compara cada día Beds24 vs. Odoo: reservas, fechas, habitación, estado. Meta: 0 diferencias 14 días seguidos, incluido el flujo de HOLD y cancelación. La clave de identidad es `sha256(BEDS24|account|bookingId)` (ya implementada); las reservas de canal conservan su ID de origen para evitar el duplicado.
3. **Ventana de corte (baja ocupación, p. ej. 1 mañana):** (a) congelar altas/cambios, (b) exportar Beds24 (reservas + bloqueos), (c) conciliar contra Odoo = 0 diferencias, (d) Marlon autoriza por escrito.
4. **Cambio de autoridad:** Odoo/Gateway pasa a escribir disponibilidad; los canales se reapuntan (iCal/API) **uno a la vez** (Booking → comprobar → Airbnb → comprobar); Beds24 pasa a **solo lectura** (sin altas manuales).
5. **Retorno:** Beds24 se conserva 30 días como respaldo y se compara a diario; si hay desvío > 0 durante la ventana inicial, se vuelve a Beds24 (punto de restauración listo antes del corte).
6. **Cierre:** tras 30 días sin hallazgos, se desenlazan canales de Beds24 y se archiva su exportación. Casa Completa se incorpora cuando Odoo calcule la regla CASA ↔ habitaciones.

Condiciones de entrada al corte: puerto Odoo transaccional con unicidad por comando, permisos aprobados, reconciliación total, y orden expresa de Marlon.

## 6. Riesgos críticos y siguiente acción

**Críticos:** (1) 0 canales enlazados ⇒ Beds24 no es todavía calendario maestro real; (2) reservas existentes sin cargar ⇒ sobreventa inmediata; (3) Casa Completa manual sin cobertura automática; (4) Odoo STAGING y Beds24 como dos verdades.

**Siguiente acción (decisión de Marlon):** autorizar (a) carga y cruce de reservas futuras actuales en Beds24, (b) enlace de Booking/Airbnb a Beds24 por Marlon, (c) ejecutar G1–G4 con datos QA en fechas acordadas, (d) decidir si se solicita `write:bookings`.
