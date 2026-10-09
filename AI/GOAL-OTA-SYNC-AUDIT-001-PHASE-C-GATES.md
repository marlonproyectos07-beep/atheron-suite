# GOAL-OTA-SYNC-AUDIT-001 — PHASE C, gates de activación

Estado: **DISEÑO; ningún gate ejecutado**. Base documental: `GOAL-OTA-SYNC-AUDIT-001-PHASE-A.md`, `GOAL-OTA-SYNC-AUDIT-001-PHASE-B.md` y auditoría OTA del 2026-10-02. Los datos de canales pueden haber cambiado; C0–C4 deben volver a medirlos antes de escribir. Alcance: 201, 202, 203, 301, 302 y CASA COMPLETA, únicamente piloto controlado y Odoo STAGING. Ningún gate autoriza Production, cobros, reservas comerciales de prueba, cambios de tarifas ni NOBEDS. Cada gate requiere una decisión de avance propia; un PASS local no concede la autorización del siguiente.

## Situación y regla de clasificación

Hay 6/6 unidades `AT_RISK`: ninguna tiene cobertura continua bidireccional demostrada; 302 tiene cobertura parcial puntual. Los IDs de Odoo documentados son 201=1, 302=5 y CASA=6; los de 202/203/301 deben confirmarse. Booking tiene propiedad de habitaciones `16559325`, calendario 302 `1655932505`, y propiedad Casa `16569053`; el calendario Casa está pendiente. Airbnb tiene listings documentados para 301 y 302; existencia/ID de Casa y cobertura del resto siguen pendientes. Solo se observaron dos filas de feed 302 con referencias de entrada/salida vacías. La conexión directa Booking↔Airbnb 302 y una conexión temporal de exportación a Odoo STAGING requieren inventario antes de cualquier modificación.

El instante de activación `T0` se fija **solo al activar realmente** el nuevo control, con fuente horaria y evidencia. Un conflicto anterior a T0 y con fecha de creación acreditada se clasifica `LEGACY_OVERBOOKING`; uno creado desde T0 es `NEW_OVERBOOKING` crítico. Si no se conoce la fecha de creación, queda `UNCLASSIFIED_CONFLICT` crítico, nunca se presume legado. `AT_RISK` significa cobertura no demostrada, aunque no haya conflicto visible. Ningún release puede borrar un bloqueo de otro origen, UID, unidad o ventana.

## Orden, autorizaciones y reglas transversales

**Orden exacto:** C0 → C2 → C3 → C4 → C1 → C5 → C6 → C7 → C8. Se agotan las verificaciones de solo lectura antes de modificar STAGING o canales. C1 conserva su identificador aunque se ejecute después de C4. **FIRST_GATE_TO_AUTHORIZE: C0**; establece línea base y ruta de restauración antes de cualquier acción con efectos.

En todos los gates: evidencia fechada, IDs saneados, responsable, checklist PASS/FAIL, y parada ante discrepancia; secretos y URLs de feeds privadas solo en gestor seguro, nunca en el informe o logs. `CEO_APPROVAL_REQUIRED: SÍ` indica autorización separada del gate; la aprobación de diseño presente no activa ninguno. Las pruebas con escritura solo pueden usar bloqueos administrativos gratuitos y reversibles, en ventanas verificadas sin huéspedes, reservas o holds ajenos; si una OTA no permite hacerlo sin afectar ventas/huéspedes, el gate falla y se escala. La reversión de una prueba nunca libera reservas reales ni borra la protección de otra unidad. Antes de activar escritura real se debe demostrar guarda transaccional interna en Odoo y preparar cierre operativo autorizado de las rutas de venta cruzada que sigan sin confirmación externa.

## C0 — BASELINE / BACKUP

- **GATE_ID:** C0.
- **GOAL:** fijar inventario, configuración, conflictos previos y punto de restauración verificable.
- **SYSTEMS_TOUCHED:** lectura de Booking, Airbnb, Odoo STAGING, Gateway/Preview, repositorio y gestores de jobs/secretos; almacenamiento seguro de snapshots.
- **READ_ONLY_OR_WRITE:** solo lectura operativa; escritura exclusivamente de evidencias/snapshots en almacenamiento seguro, sin restaurar ni modificar sistemas.
- **REAL_RESERVATIONS_AT_RISK:** ninguna por el gate; se inventarían y preservarían las existentes.
- **SECRETS_REQUIRED:** acceso existente de lectura, sin revelar ni copiar valores.
- **CEO_APPROVAL_REQUIRED:** SÍ, autorización específica C0 de consulta y respaldo.
- **PRECONDITIONS:** cuentas de solo lectura o equivalentes, alcance de seis unidades, lugar seguro para snapshots, hora de referencia.
- **EXACT_ACTIONS:** inventariar listings, room/calendar IDs, feeds de entrada/salida, modos de exportación/importación, conexiones directas, jobs y estado, slots/holds actuales, conflictos y huéspedes; capturar configuración, versión de código/despliegue, hash de snapshots y procedimiento de restauración; verificar que se puede leer el respaldo sin aplicarlo.
- **EXPECTED_RESULT:** mapa completo de lo conocido y de lo desconocido, con rollback practicable para cada futura escritura.
- **PASS_CRITERIA:** seis unidades y todos los caminos de venta identificados o marcados explícitamente `UNKNOWN`; snapshots fechados y accesibles; dueño y paso de reversión de cada configuración; ningún secreto en evidencia.
- **FAIL_CRITERIA:** canal/listing no identificable, respaldo ilegible, estado previo no reconstruible o acceso con impacto inesperado.
- **ROLLBACK:** no hay cambio operativo; revocar acceso temporal si se creó y conservar evidencia según política.
- **EVIDENCE_TO_CAPTURE:** manifiesto con hashes y hora, matriz unidad×canal, feeds/jobs saneados, inventario y conflictos, versión y plan de restauración.
- **ESTIMATED_RISK:** bajo, exposición de información sensible si se documenta mal.
- **DEPENDENCIES:** ninguna; es el primer gate.

## C1 — ODOO STAGING

- **GATE_ID:** C1.
- **GOAL:** dejar preparado un backend STAGING que aplique y libere bloqueos propios de forma transaccional y observable, sin OTAs vivas.
- **SYSTEMS_TOUCHED:** Odoo STAGING, Gateway/Preview de prueba, almacenamiento durable y scheduler de prueba; no Booking/Airbnb.
- **READ_ONLY_OR_WRITE:** escritura técnica en STAGING/Preview; entradas sintéticas o aisladas, jobs reales de OTA deshabilitados.
- **REAL_RESERVATIONS_AT_RISK:** cero previstas; STAGING puede contener datos históricos que deben preservarse.
- **SECRETS_REQUIRED:** credenciales STAGING existentes en gestor seguro; ninguna credencial OTA.
- **CEO_APPROVAL_REQUIRED:** SÍ, autorización específica de escritura STAGING/Preview.
- **PRECONDITIONS:** C0 PASS, respaldo y rollback, IDs de Odoo confirmados, aislamiento de producción, criterio de no liberar bloqueos ajenos.
- **EXACT_ACTIONS:** configurar journal durable y credenciales seguras; implementar/verificar unicidad estructural por canal/listing/UID, versión o serialización por unidad/Casa en la misma transacción Odoo, y comprobación de exclusión; arrancar runner con fixtures, health, métricas, alertas y job deshabilitado para feeds vivos; probar concurrencia, crash/replay, feed fallido/vacío y release propietario.
- **EXPECTED_RESULT:** un solo bloqueo por evento y rechazo consistente de carreras incompatibles, sin venta OTA tocada.
- **PASS_CRITERIA:** prueba real sobre STAGING de dos escrituras concurrentes incompatibles deja exactamente una aceptada; replay/crash no duplica; release no toca otro UID; logs/health y apagado comprobados.
- **FAIL_CRITERIA:** ambas escrituras incompatibles aplican, journal pierde evento, release ajeno, salida vacía ante error o falta de observabilidad.
- **ROLLBACK:** desactivar runner; restaurar configuración/código STAGING desde C0; reconciliar solo datos de prueba por clave propia, sin liberar históricos.
- **EVIDENCE_TO_CAPTURE:** IDs de pruebas saneados, transacciones/resultados de concurrencia, journal antes/después, health, alertas y restauración.
- **ESTIMATED_RISK:** medio por escritura STAGING y posible carrera.
- **DEPENDENCIES:** C0, C2, C3 y C4 PASS para conocer semántica real antes de configurar el backend definitivo.

## C2 — BOOKING COVERAGE

- **GATE_ID:** C2.
- **GOAL:** demostrar qué propiedades, calendarios, feeds y controles de disponibilidad existen realmente en Booking para las seis unidades.
- **SYSTEMS_TOUCHED:** Booking, solo consulta; evidencia local segura.
- **READ_ONLY_OR_WRITE:** solo lectura; ninguna alta/baja de conexión, cambio de exportación, bloqueo o tarifa.
- **REAL_RESERVATIONS_AT_RISK:** ninguna por lectura.
- **SECRETS_REQUIRED:** sesión/autorización de lectura existente; feeds privados no se publican.
- **CEO_APPROVAL_REQUIRED:** SÍ, autorización específica de auditoría Booking.
- **PRECONDITIONS:** C0 PASS, propiedad 16559325 y Casa 16569053 por verificar, usuario con acceso legítimo.
- **EXACT_ACTIONS:** mapear 201/202/203/301/302/Casa a room/calendar IDs; inventariar feeds y direcciones, conexiones directas, importadores, modo de exportación `Solo fechas reservadas`, cadencia visible, límites y estado; comprobar documentalmente si un bloqueo administrativo gratuito se exporta y si una importación puede cerrar inventario, sin ejecutarlo.
- **EXPECTED_RESULT:** matriz Booking por unidad con `SUPPORTED`, `UNSUPPORTED` o `UNKNOWN` para entrada, salida, block y release; huecos concretos.
- **PASS_CRITERIA:** cada unidad y cada propiedad vendible tiene mapeo probado o declaración explícita de ausencia; capacidad de cierre/exportación y efecto del modo global quedan respaldados por evidencia; no se modifica nada.
- **FAIL_CRITERIA:** calendario/listing ambiguo, control global que podría afectar huéspedes sin alternativa o imposibilidad de establecer ruta segura de prueba.
- **ROLLBACK:** ninguno operativo; cerrar sesión de auditoría si procede.
- **EVIDENCE_TO_CAPTURE:** capturas saneadas de IDs, conexiones, dirección, modo, estado y hora; sin URLs privadas completas.
- **ESTIMATED_RISK:** bajo por lectura; alto como hallazgo posible si Booking no permite el bloqueo necesario.
- **DEPENDENCIES:** C0.

## C3 — AIRBNB COVERAGE

- **GATE_ID:** C3.
- **GOAL:** confirmar listings y sincronización Airbnb por unidad, especialmente CASA COMPLETA.
- **SYSTEMS_TOUCHED:** Airbnb, solo consulta; evidencia local segura.
- **READ_ONLY_OR_WRITE:** solo lectura; sin bloquear fechas, publicar/importar feeds ni cambiar anuncios.
- **REAL_RESERVATIONS_AT_RISK:** ninguna por lectura.
- **SECRETS_REQUIRED:** sesión/autorización de lectura existente; feeds privados protegidos.
- **CEO_APPROVAL_REQUIRED:** SÍ, autorización específica de auditoría Airbnb.
- **PRECONDITIONS:** C0 PASS y acceso a los anuncios correctos.
- **EXACT_ACTIONS:** confirmar 301/302 ya documentados, buscar mapeos de 201/202/203/Casa sin asumir que existan; inventariar export/import, conexiones directas, calendarios, bloques y liberación administrativa, cadencia/límites visibles y posibilidades de acuse de importación; no editar.
- **EXPECTED_RESULT:** matriz Airbnb por unidad y capacidad comprobable de cerrar Casa o habitaciones según anuncio real.
- **PASS_CRITERIA:** todos los anuncios vendibles quedan mapeados o la ausencia queda probada; entradas, salidas y controles `SUPPORTED`/`UNSUPPORTED`/`UNKNOWN` con evidencia.
- **FAIL_CRITERIA:** Casa se vende pero no puede mapearse, feed importado no cierra disponibilidad, o semántica de release insegura.
- **ROLLBACK:** ninguno operativo.
- **EVIDENCE_TO_CAPTURE:** capturas saneadas de listings, feeds, direcciones, estado y hora; sin enlaces privados completos.
- **ESTIMATED_RISK:** bajo por lectura; alto como hallazgo si el inventario no puede cerrarse.
- **DEPENDENCIES:** C0.

## C4 — RECONCILIATION DRY RUN

- **GATE_ID:** C4.
- **GOAL:** comparar estados reales sin escribir y medir lo que sí puede medirse de latencia/frescura.
- **SYSTEMS_TOUCHED:** Booking, Airbnb, Odoo STAGING y Gateway en modo lectura; runner local de dry run.
- **READ_ONLY_OR_WRITE:** solo lectura de sistemas externos; informes locales seguros.
- **REAL_RESERVATIONS_AT_RISK:** ninguna por ejecución; conflictos existentes se registran y escalan, no se corrigen automáticamente.
- **SECRETS_REQUIRED:** accesos de lectura en gestor seguro, sin registrar feeds ni UID completos.
- **CEO_APPROVAL_REQUIRED:** SÍ, autorización específica de lecturas repetidas con límites acordados.
- **PRECONDITIONS:** C0, C2 y C3 PASS; feeds identificados; tasa de consulta permitida; snapshots completos identificables.
- **EXACT_ACTIONS:** leer al menos dos ciclos observables de cada fuente accesible, comparar intervalos y origen con Odoo, simular import/export y exclusión, detectar duplicados, slots 302 sin UID, conflictos y eventos stale; medir tiempos de observación sin extrapolar máximos; clasificar LEGACY/NEW/UNCLASSIFIED según evidencia.
- **EXPECTED_RESULT:** delta y lag observados por unidad y ruta; lista de prerequisitos de C1/C5, sin un solo bloqueo nuevo.
- **PASS_CRITERIA:** ningún feed incompleto se trata como vacío; discrepancias tienen dueño y resolución; trazas temporales muestran qué parte de lag se midió y cuál sigue desconocida.
- **FAIL_CRITERIA:** datos contradictorios sin atribución, snapshots incompletos, origen/UID incierto que permitiría release erróneo, o latencia no medible presentada como cota.
- **ROLLBACK:** detener lecturas; ningún estado externo cambia.
- **EVIDENCE_TO_CAPTURE:** hashes/contadores de snapshots, matriz diff, tiempos observados, conflictos clasificados y rutas sin medición.
- **ESTIMATED_RISK:** bajo operativo; riesgo de interpretar iCal como reserva comercial.
- **DEPENDENCIES:** C0, C2 y C3.

## C5 — CONTROLLED WRITE TEST

- **GATE_ID:** C5.
- **GOAL:** probar en una unidad y una ventana futura segura un bloqueo administrativo gratuito, propagación, replay, release y reversión.
- **SYSTEMS_TOUCHED:** una OTA de origen seleccionada, Odoo STAGING, Gateway/Preview y un destino OTA de prueba solo si su importación es segura; no Production.
- **READ_ONLY_OR_WRITE:** escritura real de disponibilidad controlada, nunca reserva comercial.
- **REAL_RESERVATIONS_AT_RISK:** sí, si la ventana/listing no está aislada; el gate no inicia hasta acreditar cero huéspedes/holds ajenos y control de venta cruzada.
- **SECRETS_REQUIRED:** credenciales mínimas ya guardadas en gestor seguro.
- **CEO_APPROVAL_REQUIRED:** SÍ, aprobación separada de OTA, unidad, fechas y rollback exactos.
- **PRECONDITIONS:** C0/C2/C3/C4/C1 PASS; ventana y unidad sin huéspedes ni bloqueos ajenos; capacidad de bloquear/liberar/exportar confirmada; salvaguarda transaccional Odoo probada. Airbnb 302 es candidato por piloto puntual previo, no una elección automática. Booking requiere aclarar antes su modo de exportación global.
- **EXACT_ACTIONS:** registrar referencia propia; crear un único bloqueo administrativo gratuito; observar feed/origen → Gateway → Odoo STAGING → cierre derivado Casa → destino que importe el feed; repetir lectura/evento para probar idempotencia; liberar por UID propietario; verificar reapertura solo de fechas propias; restaurar la conexión/configuración temporal si se creó.
- **EXPECTED_RESULT:** una sola cadena atribuible, un solo bloqueo, cierre y apertura observados en destino, cero residuos.
- **PASS_CRITERIA:** origen y destino reconocen el cambio; Odoo muestra exactamente una aplicación; replay cero efectos nuevos; release elimina solo bloque propio y no altera huéspedes/otros holds; rollback verificado.
- **FAIL_CRITERIA:** bloqueo administrativo no exportado/importado, modo global riesgoso, duplicado, release ajeno, falta de acuse del destino o residuos. No sustituir por reserva pagada.
- **ROLLBACK:** apagar job de prueba, retirar solo conexión temporal propia, liberar solo bloqueo identificado y comprobar inventario; si el destino no confirma release, mantener protección y escalar, nunca forzar apertura.
- **EVIDENCE_TO_CAPTURE:** traza temporal y correlación saneada de origen/Gateway/Odoo/destino, antes/después, replay, release y checklist de residuos.
- **ESTIMATED_RISK:** medio/alto por escribir disponibilidad real; mitigación requiere ventana aislada y capacidad de restauración.
- **DEPENDENCIES:** C0, C2, C3, C4, C1; aprobación específica de la escritura.

## C6 — CROSS-UNIT TEST

- **GATE_ID:** C6.
- **GOAL:** demostrar ambas direcciones de exclusión Casa↔habitaciones en destino OTA, además de Odoo.
- **SYSTEMS_TOUCHED:** canales reales con listings aplicables, Odoo STAGING, Gateway/Preview.
- **READ_ONLY_OR_WRITE:** dos pruebas de bloqueo/release administrativo controlado, una por dirección; ningún booking de pago.
- **REAL_RESERVATIONS_AT_RISK:** sí si ventanas no están aisladas; deben estar verificadas y protegidas antes de escribir.
- **SECRETS_REQUIRED:** credenciales mínimas ya en gestor seguro.
- **CEO_APPROVAL_REQUIRED:** SÍ, fechas, unidades, anuncios y reversión aprobados específicamente.
- **PRECONDITIONS:** C5 PASS, mapping de Casa y cinco habitaciones, salida/importación del destino confirmada, concurrencia Odoo protegida, ventanas seguras independientes.
- **EXACT_ACTIONS:** bloquear una habitación desde canal real y comprobar Odoo habitación+Casa y cierre de Casa vendible; liberar y verificar sin soltar otros bloques. Bloquear Casa desde su canal real y comprobar Odoo Casa+201/202/203/301/302 y cierre de cada anuncio vendible; liberar por referencia propia, repetir/replay y verificar sin eco.
- **EXPECTED_RESULT:** exclusión causal en las dos direcciones y destino, sin bloqueo duplicado ni apertura indebida.
- **PASS_CRITERIA:** cada una de las seis unidades y todos los listings vendibles correspondientes muestran el efecto esperado; otra habitación no se cierra por un bloqueo individual salvo regla explícita; release/replay preservan holds ajenos.
- **FAIL_CRITERIA:** falta anuncio Casa necesario, un destino sigue vendible, doble efecto, release cruzado o propagación no confirmada. No sustituir ausencia de anuncio por supuesto.
- **ROLLBACK:** desactivar ruta de prueba, revertir únicamente bloqueos propios, verificar cada destino; si queda incertidumbre mantener cierre protector y escalar.
- **EVIDENCE_TO_CAPTURE:** matriz dirección×unidad×canal con marcas de tiempo, referencias saneadas, conteos antes/después y prueba de ausencia de residuos.
- **ESTIMATED_RISK:** alto por alcance entre unidades; ventanas acotadas y reversión por propietario.
- **DEPENDENCIES:** C5 y mapeo completo C2/C3.

## C7 — CONTINUOUS RUNNER

- **GATE_ID:** C7.
- **GOAL:** activar piloto de polling/scheduler con persistencia y alertas, sin abrir rutas de venta cruzada no confirmadas.
- **SYSTEMS_TOUCHED:** Gateway/Preview, Odoo STAGING, feeds OTA reales de piloto, scheduler y almacenamiento seguro.
- **READ_ONLY_OR_WRITE:** lectura continua y escrituras STAGING; salida hacia calendarios OTA de piloto solo en rutas autorizadas.
- **REAL_RESERVATIONS_AT_RISK:** sí si se abren ventas simultáneas antes de acuse de todas las rutas; mantener cierre operativo autorizado de pares no protegidos.
- **SECRETS_REQUIRED:** credenciales mínimas en gestor seguro, rotación y alertas de fallo.
- **CEO_APPROVAL_REQUIRED:** SÍ, activación separada del job, alcance, cadencia y plan de cierre.
- **PRECONDITIONS:** C6 PASS, límites de sondeo aceptados, almacenamiento durable, lock/transacción real, health, umbrales medidos, control de publicaciones y rollback.
- **EXACT_ACTIONS:** activar jobs por pares canal/unidad en canary con frecuencia compatible; impedir ejecuciones simultáneas y pérdida de journal; observar varios ciclos y reinicio/fallo controlado; alertar `SYNC_STALE`, backend down, conflicto crítico y destino sin acuse; ampliar solo pares probados.
- **EXPECTED_RESULT:** ciclos repetidos sin duplicado, pérdida, release falso o salida vacía, con lag observado y alarma efectiva.
- **PASS_CRITERIA:** estabilidad durante al menos dos ciclos completos de cada proveedor y una recuperación controlada; health/lag por ruta; fallos no abren inventario; alerta llega al responsable.
- **FAIL_CRITERIA:** job no corre, feed stale no detectado, cola se pierde, destino no importa, release inseguro, latencia desconocida presentada como SLA o conflicto nuevo.
- **ROLLBACK:** deshabilitar scheduler y conexiones nuevas del piloto conforme a plan, conservar journal y bloqueos protectores; no abrir fechas hasta reconciliar manualmente.
- **EVIDENCE_TO_CAPTURE:** configuración y versión de jobs saneadas, ejecución/lag, recuperación, alarmas, acuses y rollback ensayado.
- **ESTIMATED_RISK:** alto porque un error persistente afecta varios ciclos.
- **DEPENDENCIES:** C6 y autorización operacional de las rutas cerradas/abiertas.

## C8 — FULL PILOT COVERAGE

- **GATE_ID:** C8.
- **GOAL:** demostrar cobertura continua de las seis unidades en STAGING/piloto, con exclusión Casa↔habitaciones y auditoría, sin declarar Production general.
- **SYSTEMS_TOUCHED:** Booking y Airbnb de piloto, Odoo STAGING, Gateway/Preview, scheduler/alertas; sin Production.
- **READ_ONLY_OR_WRITE:** ampliación controlada de configuraciones/feeds y disponibilidad de piloto; ninguna reserva paga de prueba.
- **REAL_RESERVATIONS_AT_RISK:** sí si una ruta vendible queda sin protección; apertura solo tras acuse de todos los destinos o cierre operativo de ruta pendiente.
- **SECRETS_REQUIRED:** credenciales de alcance mínimo en gestor seguro; ninguna copia manual en docs/logs.
- **CEO_APPROVAL_REQUIRED:** SÍ, aprobación separada de ampliación y de cada excepción operativa.
- **PRECONDITIONS:** C7 PASS; mapeos, rutas de entrada/salida y semántica de block/release por las seis unidades; umbrales de frescura comprobados, procedimiento de incidente y T0.
- **EXACT_ACTIONS:** habilitar secuencialmente cada par unidad/canal; demostrar entrada real controlada, Odoo STAGING, exclusión derivada, acuse de destino, replay, release y auditoría; observar al menos dos ciclos completos por proveedor y recuperación; revisar discrepancias y clasificar conflictos respecto a T0; mantener cerrada toda ruta no verificada.
- **EXPECTED_RESULT:** matriz seis unidades×canales vendibles sin huecos y contador `AT_RISK=0` solo para las rutas efectivamente demostradas.
- **PASS_CRITERIA:** cada ruta vendible de las seis unidades tiene traza end-to-end y frescura/alerta medida; no hay `NEW_OVERBOOKING`, duplicación ni release ajeno; conflictos desconocidos se escalan; rollback por unidad ensayado; sin residuos de prueba. Un anuncio inexistente se marca `NOT_APPLICABLE` solo con evidencia.
- **FAIL_CRITERIA:** cualquier ruta vendible sin entrada o cierre confirmado, incertidumbre de creación de conflicto, alerta inoperante, lag fuera de umbral o sobreventa nueva. `AT_RISK` se mantiene para la unidad afectada.
- **ROLLBACK:** deshabilitar incorporación por unidad y jobs afectados, restaurar conexiones previas, conservar bloqueos de seguridad, reconciliar antes de reabrir; no revertir reservas reales.
- **EVIDENCE_TO_CAPTURE:** matriz completa por unidad/canal, trazas saneadas, T0, logs de Odoo/Gateway, acuses de canal, latencias observadas, alertas, conflictos y snapshots antes/después.
- **ESTIMATED_RISK:** alto por cobertura total; permanece riesgo residual de consistencia eventual entre OTAs.
- **DEPENDENCIES:** C7 y aprobaciones de rutas/ventanas individuales.

## Atomicidad y ventana de sobreventa

Odoo/Gateway **pueden aspirar a** una decisión atómica local si una misma transacción Odoo comprueba exclusión, unicidad de clave externa y versión y escribe el bloqueo; C1 debe demostrarlo. El patrón actual `listBlocks()` → `applyBlock()` separado no lo demuestra y permitió dos aceptaciones incompatibles en carrera local. Un lock de una sola instancia no protege varias instancias. La lógica de derivación Casa↔habitaciones existe, pero su efecto externo depende de la publicación/importación y el acuse de cada OTA.

Booking/Airbnb/iCal no comparten una transacción con Odoo ni entre sí. Un VEVENT no demuestra reserva comercial ni `BOOKED_AT`; el polling y la importación son eventuales. No existe una garantía verificable de que dos canales abiertos no confirmen simultáneamente antes de recibir el bloqueo. API/webhook, si están disponibles para estas cuentas y operaciones, podrían reducir retraso, pero tampoco prueban por sí solos un commit distribuido.

**MINIMUM_OVERBOOKING_WINDOW:** no se puede cuantificar con los datos actuales. Para iCal con canales abiertos la exposición puede ser mayor que cero; la cota superior actual es `UNKNOWN_OR_UNBOUNDED` porque no se conocen límites de publicación, importación ni recuperación. La expresión condicional es `publicación origen + espera de polling + commit Odoo + publicación salida + importación destino + reintentos`; solo se convierte en cota si cada término tiene máximo acreditado. C4/C7 medirán observaciones, no prometerán un máximo por extrapolación. Cerrar operativamente la venta cruzada de pares sin acuse elimina esa ruta concreta de doble venta mientras permanezca cerrada, con aprobación comercial separada.

Una garantía más fuerte requiere inventario vendible centralizado con confirmación de bloqueo antes de aceptar venta, o una integración API/channel manager con control y acuse de inventario en ambos canales, latencia contractual y mecanismo de suspensión ante fallo, si realmente ofrecen esas capacidades. La política operativa debe tratar cualquier `NEW_OVERBOOKING` tras T0 como incidente crítico, con cierre protector y reconciliación; el objetivo de `AT_RISK=0` es cobertura demostrada, **no** promesa de atomicidad inter-OTA.

## Semáforo y autorización inmediata

`STATUS: PLAN_PREPARADO`, `PHASE_C_GATE_COUNT: 9`, `FIRST_GATE_TO_AUTHORIZE: C0`. `CURRENT_AT_RISK_UNITS: 201, 202, 203, 301, 302, CASA COMPLETA (6/6)`. Conservadoramente C0, C2, C3, C4, C1, C5, C6 y C7 dejan 6/6 en riesgo hasta que haya evidencia individual de cobertura continua; C8 apunta a 0/6 **solo si** todas las rutas vendibles pasan. Si falla una ruta, esa unidad continúa `AT_RISK` y no hay READY. `FINAL_SEMAPHORE: ÁMBAR` para preparación; no se ha activado PHASE C. La siguiente autorización recomendada es C0 de solo lectura y respaldo, con alcance y acceso limitados.

`REAL_CHANGES_EXECUTED: NO` · `STAGING_CHANGED: NO` · `BOOKING_CHANGED: NO` · `AIRBNB_CHANGED: NO` · `PRODUCTION_CHANGED: NO` · `DEPLOYED: NO`.
