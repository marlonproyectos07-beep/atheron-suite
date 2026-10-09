# Booking/Airbnb → Odoo STAGING: auditoría del gate real

Fecha: 2026-10-02. Estado: **Airbnb: prueba real controlada PASS; Booking: NO READY; integración OTA continua: NO READY**. El piloto sintético HOTEL-017 no se reconstruyó.

## Hechos verificados de solo lectura

- Odoo consultado: `atheron1-hotel-staging-20260923.odoo.com`, base neutralizada para pruebas. No se llamó a Production.
- `x_hotel_ota_feed` contiene exactamente dos filas: Booking `AHS-302` → unidad Odoo 5/recurso 32, property ID `16559325`, listing/calendar ID `1655932505`; Airbnb `AHS-302` → unidad Odoo 5/recurso 32, listing ID `1119517434126866031`. No hay registros para 201, 202, 203, 301 ni CASA.
- En ambas filas están vacías `x_inbound_feed_reference` y `x_outbound_feed_reference`. `x_last_sync_at` indica 2026-10-02 05:21:06 UTC y estados de importación **manual** desde archivos `.ics` (Booking: dos eventos duplicados; Airbnb: tres eventos duplicados). No demuestra sondeo actual de los canales.
- En Vercel no se encontraron variables de proyecto que incluyan `HOTEL_ICAL` ni `OTA`; por tanto el feed público de salida no se observó habilitado. El código `reconcileSnapshot()` e `importCalendar()` recibe texto iCal inyectado y no hay runner/cron de importación en el árbol inspeccionado.
- Odoo STAGING contiene ocho `planning.slot` de tipo `external`: cinco asociados al recurso 32 de la unidad 302 (dos Booking y tres Airbnb), otro Booking asociado al recurso 30 y dos sin canal asociados al recurso 32. Hay bloques derivados para CASA. Los tres ajenos a las dos filas de configuración OTA se identificaron individualmente mediante lectura de `planning.slot`:
  - ID `40018`: unidad 203/recurso 30, 1–3 oct 2029, `x_channel=booking`; sin `x_bloqueo_ref`, `x_bloqueo_src_id`, huésped ni orden. Atribución: **registro Odoo etiquetado Booking**, sin evidencia de un evento real del canal ni configuración de feed de 203.
  - ID `40048`: unidad 302/recurso 32, 11–13 feb 2030, sin canal ni referencia de origen, huésped u orden. Atribución: **Odoo sin procedencia OTA demostrable**.
  - ID `40067`: unidad 302/recurso 32, 4–6 mar 2030, sin canal ni referencia de origen, huésped u orden. Atribución: **Odoo sin procedencia OTA demostrable**.
  Estos tres registros no constituyen los eventos reales exigidos por el gate y se conservaron; no se liberó ninguno.
- Dos consultas de disponibilidad de solo lectura en STAGING devolvieron `no_disponible` para 302 y CASA en ventanas cubiertas por un bloque Booking (17–18 oct 2026) y otro Airbnb (22–23 dic 2026). Esto confirma efecto de los bloques ya presentes, no recepción en vivo ni cancelación segura.
- En la primera revisión, el navegador integrado mostró formularios de inicio de sesión. Posteriormente se usaron las sesiones autenticadas del titular en Chrome y se completó la auditoría de Booking y Airbnb. La evidencia nueva está documentada abajo.

## Primer experimento seguro, una vez exista acceso al canal

1. Identificar en la extranet de Booking la propiedad y calendario de la unidad 302; leer el enlace de exportación y los destinos de importación, sin imprimir ni versionar la URL. Comprobar que una fecha de prueba remota y desocupada no afecta reservas existentes ni tarifas.
2. Crear **un bloqueo administrativo de calendario**, no una reserva pagada, únicamente si Booking permite bloquear y liberar el día sin cargo. Capturar UID, fechas y presencia en el feed real; importar con el adaptador HOTEL-017 y el Gateway a Odoo STAGING; comprobar 302 y CASA, replay idempotente y auditoría.
3. Liberar el bloqueo en Booking y confirmar desaparición del UID en dos lecturas correctas. Usar `reconcileSnapshot()` con `allow_empty=true` solo tras comprobar que el feed vacío es completo y corresponde al calendario correcto. Verificar liberación del propio bloqueo en STAGING y persistencia de cualquier otro bloqueo.
4. Repetir en Airbnb con su propio calendario y UID. Comprobar además la exclusión CASA ↔ habitaciones en los feeds de salida y la trazabilidad. No publicar URL de salida en canales hasta comprobar su alcance y los calendarios receptores.

Si un canal solo ofrece una reserva que podría cobrar o afectar a un huésped, detenerse antes de crearla y pedir al titular una sola acción concreta. No usar reservas comerciales existentes como material desechable de prueba.

## Bloqueadores técnicos atribuidos

- **Booking / canal:** la propiedad 16559325 exporta en modo global `Solo fechas reservadas`. El panel advierte que cambiarlo afecta a todas las conexiones. Un bloqueo administrativo reversible no aparecería en ese feed con la configuración actual; cambiar el ajuste global puede afectar inventario de anuncios reales enlazados.
- **Odoo / trazabilidad de Booking:** los dos eventos del feed real 302 coinciden en fechas con slots manuales de STAGING, pero esos slots no conservan una referencia UID verificable. Reimportarlos sin resolver esa colisión no demostraría un nuevo efecto controlado ni una liberación segura.
- **Gateway / configuración:** `x_hotel_ota_feed` sigue sin referencias inbound/outbound y no existe un runner/cron persistente comprobado. La prueba real de Airbnb se ejecutó con un receptor local de una sola vez y el Gateway existente; no establece sincronización continua.

## Evidencia posterior: canales reales

- **Booking 302:** la sesión autenticada mostró la conexión existente `airbnb.com.co` en estado OK. El feed de exportación propio devolvió HTTP 200 y dos VEVENT: 1–5 y 17–18 oct 2026, ventanas iguales a los dos slots Booking manuales de STAGING. Se creó durante la auditoría una conexión exportadora temporal llamada `Atheron Odoo STAGING TEST`; quedó `Import needed` sin importar nada a Booking. El panel no ofrece `Remove` para conexiones incompletas. Es un residuo de configuración que requiere retirada segura; no se alteraron reservas, tarifas ni la conexión Airbnb existente.
- **Airbnb 302:** la sesión autenticada mostró importación `hab. 302 booking`, vínculos de CASA con habitaciones y feed propio HTTP 200. El feed inicial tenía tres VEVENT. Uno, 8–11 oct 2026, no coincidía con el slot manual Airbnb de 30 sep–1 oct en STAGING; los otros dos coincidían en ventana.
- **Evento controlado Airbnb:** se bloqueó administrativamente solo la noche 20–21 ene 2027 en la 302, previamente disponible en Airbnb y en Odoo STAGING para 302/CASA. El feed real pasó de tres a cuatro VEVENT y mostró un UID nuevo y una ventana exacta. Un receptor local de una sola vez seleccionó solo ese evento y lo pasó al Gateway existente con credenciales del almacén DPAPI para la base STAGING exacta.
- **Primer fallo y corrección mínima:** el Gateway creó el slot externo 40157, el derivado CASA 40158 y un snapshot `PRE_APPLY`, pero `ota_snapshot_put` devolvió `IDEMPOTENCY_KEY_REUSED` al intentar avanzar el mismo UID a `ACTIVE`. Se identificó en la acción Odoo STAGING 1967 una guardia de replay aplicada indebidamente a un upsert mutable. Se retiró **solo** `ota_snapshot_put` de esa guardia; no se tocó Production. El script `patch-odoo-action-snapshot-staging.mjs rollback` revierte exactamente la línea si fuera necesario.
- **Idempotencia y efecto:** al reanudar el mismo evento, dos lecturas/importaciones devolvieron `DUPLICATE`, quedó un solo bloqueo y el snapshot `ACTIVE`. La disponibilidad de 302 y CASA pasó de `disponible` a `no_disponible` en STAGING. El log Odoo registra la cadena de operaciones OTA.
- **Liberación:** se reabrió la misma noche en Airbnb. Dos lecturas correctas del feed confirmaron la desaparición del UID controlado; `reconcileSnapshot()` marcó `MISSING_PENDING` y luego `RELEASED_BY_DISAPPEARANCE`. El Gateway retiró solo el slot propio y el derivado CASA. Odoo volvió a `disponible` para 302/CASA; el snapshot quedó `RELEASED` y no quedó un bloqueo activo de la prueba.
- **Límites:** esto demuestra el canal real Airbnb → Gateway → Odoo STAGING y su liberación sin duplicación, en modo piloto manual de una sola vez. Booking aún no tiene un evento controlado seguro con la configuración actual. No se automatizó el sondeo continuo ni la publicación de feeds de salida.
- **Confidencialidad de feeds:** las URLs privadas iCal quedaron visibles en respuestas de herramienta durante la auditoría, aunque no se guardaron en archivos ni se repiten aquí. La conexión temporal de Booking debe retirarse/rotarse con seguridad. Rotar el enlace Airbnb sin actualizar el importador activo de Booking rompería la sincronización existente; esa rotación requiere una secuencia coordinada y no se realizó.
