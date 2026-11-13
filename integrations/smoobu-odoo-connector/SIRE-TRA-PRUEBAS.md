# Pruebas en copia aislada (ATH-HOTELS-SIRE-TRA-001) — 2026-11-08

Copia: `atheron1-pruebas-20261108` (neutralizada + controles adicionales 8/8). Datos 100 % sinteticos ("PRUEBA ...").
Codigo ejecutado = repositorio (huella del manifiesto `38295e4dc3395c3f` comprobada en el navegador; longitudes de funciones identicas).
Portales oficiales: solo simulador. Ningun envio real a SIRE ni a TRA.

## Unitarias (sin red)
`npm test`: 396/396 (21 nuevas: aplicador, emisor, guardia, compilacion y opcodes prohibidos por safe_eval del Python).

## Recorrido en Odoo (copia)
| Caso | Resultado observado |
|---|---|
| Aplicador: simulacion, aplicacion, repeticion | 313 registros con xmlid; segunda simulacion: 0 creaciones; 3 reaplicaciones: 0 duplicados |
| Ejecucion parcial (2 caidas reales) | x_name automatico de Odoo y cierre prohibido por safe_eval: corregido y reanudado sin duplicar |
| Enlace por reserva (A, B, C, D) | creado; vence el dia siguiente al check-out 23:59 (Bogota) |
| Acceso anonimo: valido / sin token / token falso / revocado / vencido | formulario / sin acceso / error / error / pagina de vencido |
| Exposicion tras enviar (pagina e impresion con el token) | sin datos personales (respuestas borradas tras procesar) |
| Repetir el mismo enlace | Odoo lo rechaza ("La encuesta ya comenzo") |
| A: principal colombiano + extranjero (pasaporte) + menor (TI) | 3 paginas; 3 huespedes "Recibido"; extranjero detectado; menor = child |
| C: grupo de 22 (Casa Completa) | 22 paginas, 22 huespedes; unidad derivada rechazada; habitaciones fisicas validan; llegada bloqueada (reserva no confirmada) |
| Validacion: sin habitacion / documento invalido / doble validacion | rechazo total con mensajes claros; correccion valida; doble rechazada |
| Llegada real A | TRA para todos; SIRE entrada solo extranjero; doble llegada rechazada |
| Concurrencia: dos reclamos simultaneos | uno reclama, el otro no (bloqueo por escritura de fila) |
| TRA modo real sin configuracion | BLOQUEADO (4 motivos), 0 llamadas |
| TRA sin catalogo de motivo | "error antes de enviar", 0 llamadas, vuelve a pendiente |
| TRA principal aceptado + acompanante rechazado | #101; rechazado HTTP 400; acompanante 2 aceptado; padre=101 |
| Repeticion del emisor | 0 reenvios; tras "no recibido" se reenvia solo el acompanante |
| TRA timeout (B) | incierto; repeticion sin llamada; Recepcion resuelve con evidencia del portal |
| Doble "aceptado" | rechazado por la maquina de estados |
| Historial | editar o borrar intentos: bloqueado (incluso administrador); borrar huesped con intentos: bloqueado |
| SIRE: exportador apagado / hoja guiada / aceptar sin y con evidencia | rechazo / enviado / rechazo / aceptado |
| SIRE: archivo (codigos ficticios en establecimiento PRUEBA) | 1 fila, 13 columnas TAB en el orden del manual (p. 29), CRLF, fecha local; segundo archivo rechazado |
| Cancelacion (D) | llegada y nuevo enlace rechazados |
| Formulario repetido (A) | principal validado no se sobrescribe (nota); acompanante nuevo con nota "nacionalidad no reconocido (United States)" |
| Interfaz | menu, lista, ficha con historial y dialogo de resultado verificados en pantalla; encuesta usable |
| Efectos externos desde el inicio | correos en cola 0, WhatsApp 0, SMS 0, tareas 0, actividades 0; 26 notas internas; 4 turnos de planning por confirmar reservas sinteticas |

## Hallazgos que cambiaron el diseno
1. `rental_status` pasa a "returned" al confirmar (las lineas de habitacion no son de alquiler): no sirve como alojamiento real. Regla nueva: reserva confirmada y hoy dentro de fechas + accion explicita de Recepcion.
2. `/survey/start/...?answer_token=` redirige a la portada sin sesion: el enlace usa `/survey/<encuesta>/<respuesta>`.
3. La impresion con el token muestra la encuesta sin sesion: por eso las respuestas se borran tras procesarlas.
4. Cambiar automatizaciones reactiva el cron 48 en la copia: apagarlo y volver a comprobar.
5. Regla existente de choque: Casa Completa no se confirma si hay habitaciones ocupadas (correcto).
6. La copia "Activacion pendiente: caduca en 3 horas" tras crearla (aviso en pantalla).

## Segunda ronda (2026-11-08 21:50-22:20 UTC) — cierre de defectos
Copia conservada (activada; vence 2026-11-24), aislamiento verificado de nuevo. Codigo de la copia = rama (huellas de las 11 acciones, preguntas, respuestas y 85 campos).
| Caso | Resultado |
|---|---|
| Tildes y concordancia | encuesta y notas con tildes ("Revisar: no se reconocio nacionalidad (...)") |
| Nacionalidad por catalogo | "EEUU" -> Estados Unidos (alias documentado); "Mexico" -> Mexico; **"Congo" y "Guinea" ambiguos: sin pais + nota** (defecto encontrado en esta ronda y corregido) |
| Dos formularios simultaneos de la misma reserva | ambos procesados; principal sin duplicar; 4 acompanantes conservados (0 respuestas perdidas) |
| Tercer formulario de la misma reserva | principal sigue sin duplicarse; nuevos acompanantes agregados |
| Regreso del mismo huesped en otra estancia | linea nueva en la reserva nueva; la estancia anterior no cambia |
| Casa Completa confirmada, grupo de 22 | llegada 22, TRA pendiente 22, SIRE entrada 7/7 extranjeros, habitaciones fisicas 201-302, hoja guiada -> enviado, salida 22, SIRE salida 7 |
| Reserva sin confirmar o con choque | confirmacion rechazada por la regla existente de choque (incluye cotizaciones); llegada y salida rechazadas |
| Privacidad tras enviar (pagina e impresion, 2 formularios) | sin datos personales |
| Evidencia conservada | version del formulario y del aviso, fecha de envio y copia de lo recibido con el texto del consentimiento en campo restringido a Administradores; respuestas de la encuesta borradas |

## Tercera ronda (2026-11-08 noche, hora de Bogotá) — discrepancia de fechas tras la aceptacion de TRA
Rama `feat/ath-sire-tra-inc1-estructura`, commit `5529796`. Copia `atheron1-pruebas-20261108` aislada 8/8 antes y despues (cron 48 reactivado por la escritura de automatizaciones: apagado de nuevo). Codigo ejecutado = commit (paquete de 90 505 bytes, sha256 `20dba1a1…c0351`, igual al construido localmente). Simulador de TRA; ninguna llamada de red.
Aplicacion en la copia: 7 elementos nuevos (5 campos, 1 accion de ventana, 1 menu), 0 bloqueos; segunda simulacion: 0 creaciones. (Una primera ejecucion cortada por el navegador siguio corriendo y se cruzo con la segunda: choque por clave duplicada, sin registros duplicados; se repitio una sola y termino bien.)
| Caso (reservas sinteticas "PRUEBA", 301/302/203, 9→12 nov) | Resultado observado en Odoo |
|---|---|
| Intento aceptado por simulador | guarda check-in 8 nov y check-out 12 nov tal como se enviaron; la linea copia las fechas; sin alerta |
| E: estancia sin cambios (solo cambia una nota de la reserva) | **sin alerta** (sin falso positivo) |
| P: prorroga (check-out de la reserva 12→14 nov) | alerta **Prorroga** en la lista y en la ficha |
| S: salida anticipada (salida real registrada antes del 12 nov) | alerta **Salida anticipada** |
| Reemision de las tres con el mismo simulador | 0 envios; llamadas al simulador 3→3 |
| Evidencia original | intentos y lineas identicos antes y despues (incluida `write_date`); estado TRA sigue `aceptado` |
| Pantalla | menu "Discrepancia de fechas" lista solo P y S; la ficha muestra el aviso sin indicar como corregir en el portal |
| Efectos externos | correos en cola 0, WhatsApp 0, SMS 0; crons activos: solo los 2 internos |
Unitarias: `npm test` 410/410 (9 nuevas, incluido el Python real del manifiesto ejecutado con python3; mutacion deliberada del calculo detectada).
Limites: la alerta compara solo el check-out (el check-in sale de la llegada real y no cambia); cubre lineas aceptadas despues de este cambio (las anteriores no tienen fechas guardadas); no corrige nada en el portal.

## Cuarta ronda (2026-11-13) — puente Smoobu → Odoo → enlace de registro
Rama `feat/ath-sire-tra-inc1-estructura`. Copia `atheron1-pruebas-20261108` (vence 2026-11-24). Aislamiento 8/8 antes, tras instalar y al final (el cron 48 se reactivo al crear la automatizacion y se apago de nuevo, solo en la copia). Instalado solo lo nuevo: accion `sa_invite_auto` y automatizacion `au_invite`; el codigo guardado en la copia tiene la misma huella (sha256 `2b5ca7a0d443acb0`) que el del repositorio. Simulador de TRA; ninguna llamada a Smoobu, a SIRE ni a MinCIT.
Reservas sinteticas con formato Smoobu (ids 170400911-13, correos `example.invalid`), pasadas por `buildCreatePayload` + `applyPlan` + lista blanca `validateWrite` del conector; las 9 escrituras resultantes se reprodujeron en la copia desde la sesion del navegador.
| Caso | Resultado observado |
|---|---|
| Borrador (3 reservas creadas por el conector) | estado borrador; **0 enlaces** |
| Confirmada (COT/2026/03887) | **1 enlace vigente** + nota interna "preparado (no enviado)"; la reserva no se modifica; vence el dia de la salida 23:59 Bogota |
| Repeticion: accion corrida 2 veces mas, escritura del mismo valor, reconfirmar, reprocesar el conector | sigue 1 enlace, mismo token y URL, 1 nota; el conector: 0 escrituras, `PEDIDO_YA_EXISTE` en las 3 |
| Sin fecha de entrada (COT/2026/03888, confirmada) | la confirmacion NO se bloquea; registro en estado *error* con la causa + nota; repetir no duplica; al completar la fecha, el MISMO registro pasa a enlace vigente (token nuevo) y repetir ya no cambia nada |
| Sin check-out pero con fecha de devolucion del alquiler (COT/2026/03889) | el enlace se prepara con esa fecha (igual que la accion manual); al restaurar el check-out no se regenera |
| Cancelacion (COT/2026/03888) | llegada rechazada ("reserva no confirmada, cancelada o no-show"); 0 intentos; 0 llamadas nuevas al simulador |
| Titular + 1 acompanante (COT/2026/03887) | formulario procesado (2 huespedes *Recibido*, respuestas borradas, enlace *procesado*) → validacion de Recepcion (sin habitacion: rechazada; con habitacion 201: validados) |
| Antes de la llegada real | emisor: `SIN_PRINCIPAL`, 0 llamadas, 0 intentos; los huespedes no tienen estado TRA |
| Llegada real → TRA | ambos *pendiente*; simulador: principal aceptado y acompanante aceptado (2 llamadas, 2 intentos, fechas guardadas); repetir 2 veces: 0 envios |
| Efectos externos (frente a la linea base) | correos 0, WhatsApp 0, SMS 0, actividades 0; +3 registros de enlace y +7 notas internas (esperados) |
Unitarias: `npm test` 420/420 (10 nuevas: Python real de la accion, recorrido con el conector, mutaciones deliberadas detectadas).
Limites de esta ronda:
- El cliente de escritura del conector (`SyncWriteClient`) sigue **desarmado y limitado a produccion**; no se toco. Las escrituras del conector se generaron con su codigo y se reprodujeron en la copia; la lectura de la repeticion uso el estado real de la copia.
- Las respuestas del formulario se cargaron como lineas de encuesta (la automatizacion y el mapeo son los reales); la pantalla del formulario no se recorrio en esta ronda (la pagina de bienvenida abre en modo anonimo; el recorrido de pantalla se probo en la ronda 1).
- El conector rechaza nombres genericos como "prueba": los huespedes sinteticos de esta ronda usan otro nombre ficticio.
- (Cuarta ronda; resuelto en la quinta) Un enlace vigente no se revocaba al cancelar la reserva.
- Si la estancia se prorroga, el enlace conserva su vencimiento original.
- La automatizacion corre dentro de la confirmacion de la reserva: nunca lanza error ni escribe en la reserva, pero es la unica automatizacion sobre reservas de este paquete.
- Datos sinteticos y 3 reservas de prueba se dejan en la copia (vence sola).

## Quinta ronda (2026-11-13) — revocacion al cancelar, modo copia del cliente y recorrido como huesped
Rama `feat/ath-sire-tra-inc1-estructura`. Copia `atheron1-pruebas-20261108`. Aislamiento 8/8 antes de aplicar y despues (cron 48 inactivo; esta vez no se reactivo al actualizar la regla). Cambios aplicados en la copia: solo el codigo de `sa_invite_auto` (id 2029) y la regla `au_invite` (id 212: nombre, dominio y campos disparadores).

**Decision sobre la restriccion del repositorio.** La revocacion no abre una regla nueva sobre reservas: se amplio la MISMA regla `au_invite` (sigue siendo la unica sobre `sale.order`). Dominio: reserva con referencia `SMOOBU-` y (`state` en `sale`/`cancel` o `x_reservation_status` en `cancelled`/`no_show`). Nunca dispara por borradores. Campo disparador nuevo: `x_reservation_status`. La rama de cancelacion solo escribe en registros de enlace (rota el token y marca *revocado*); no escribe en la reserva. Si Marlon no acepta ampliar la regla, la alternativa es dejar la cancelacion a la accion manual *Revocar enlace* (Recepcion), sin automatizacion.

**Revocacion.** Un enlace *vigente* de una reserva cancelada rota su token: la URL anterior y cualquier formulario ya abierto dejan de aceptar datos. No se toca el vencimiento original, ni los enlaces *procesado*/*revocado*/*error*, ni un formulario ya terminado, ni los enlaces de otras reservas. Una prorroga no mueve el vencimiento (el enlace vigente nunca se regenera) y reconfirmar tras cancelar no resucita el enlace. **Contencion de fallos:** la accion corre dentro de `try/except` por reserva y registra el error en el log de Odoo en vez de lanzarlo; no hay `raise` ni escrituras en la reserva (lo vigila `sire-tra-date-gap.test`). Limite: `try/except` captura errores de Python, no un error de base de datos que aborte la transaccion; no se uso `savepoint` porque no se probo que el evaluador de Odoo lo permita.

| Caso (copia, datos sinteticos, huesped en modo anonimo = sin cookies de sesion) | Resultado observado |
|---|---|
| Borrador (COT/2026/03890-92) | **0 enlaces** |
| Confirmacion de 03890 y 03891 | **1 enlace vigente cada una**, vence el dia de la salida 23:59 Bogota; 1 nota interna cada una |
| Reprocesar (escribir el mismo check-out, correr la accion 2 veces sobre ambas) | mismas filas, mismo token y URL; 0 notas nuevas |
| Cancelar 03891 con el formulario YA abierto por el huesped | enlace *revocado*, URL guardada borrada, token distinto, vencimiento original intacto, 1 nota |
| Abrir la URL anterior (sin sesion) | pagina "no tiene acceso a esta encuesta"; sin formulario |
| Enviar el formulario que estaba abierto (token anterior) | respuesta `token_wrong`; **0 huespedes y 0 respuestas** creados |
| Repetir la accion sobre la reserva ya cancelada | sin cambios y sin notas nuevas |
| Prorroga de 03892 (check-out +2 dias) tras confirmar | mismo enlace, mismo token, **mismo vencimiento** |
| 03892: el huesped envia el formulario y luego se cancela la reserva | enlace *procesado* y formulario *terminado* intactos; 1 huesped conservado; 0 notas de revocacion |
| Huesped real de la ruta publica: titular + 1 acompanante en 03890 (reserva de hoy, hab. 202) | `begin` + `submit` anonimos por las mismas rutas del formulario: 0 errores de campo; encuesta *terminada*, enlace *procesado*, 2 huespedes *Recibido* |
| Recepcion: validar sin habitacion | rechazado ("habitacion"); con habitacion 202: ambos *validado*; llegada registrada (2026-11-13 16:36 UTC), ambos *pendiente* |
| TRA simulado antes de la llegada | `SIN_PRINCIPAL`, **0 llamadas**; validado sin llegada: **0 llamadas** |
| TRA simulado tras la llegada | principal y acompanante *aceptados* (2 llamadas); repetir 2 veces: **0 reenvios** |
| Efectos externos frente a la linea base | correos 0, correo saliente en cola 0, WhatsApp 0, SMS 0, actividades 0, invitaciones de encuesta 0 |

**Cliente real del conector: alcance exacto.**
- `src/sync-copy-client.mjs` (`CopyWriteClient`) es el modo copia: solo `atheron1-pruebas-AAAAMMDD` en su propio host, credencial distinta de la de produccion, frase de armado propia (`COPY_ARM_PHRASE`), misma lista blanca (`validateWrite`) y tope, y verificacion del destino repetida en CADA escritura. No usa `WRITES_ENABLED`/`RELEASE_UNLOCKED`. `SyncWriteClient` sigue fijado a produccion y desarmado: no se toco ni se redirigio.
- `scripts/sync-copy.mjs` (`npm run sync-copy -- <sinteticas.json> [--apply]`) ejecuta `buildCreatePayload` + `applyPlan` con el cliente de lectura y `CopyWriteClient`; rechaza entrada que no sea sintetica (id 1704xxxxx, nombre "Sintetic…/Ficticio…", correo `@example.invalid`). Sin `--apply` usa `RecordingWriter` (no envia).
- **Probado:** 11 pruebas unitarias del guarda y del cliente contra un Odoo simulado (destino, credencial, frase, lista blanca, tope, mutacion del cliente hacia produccion, script rechaza todo antes de cualquier red).
- **NO ejecutado:** el cliente real contra la copia por HTTP. El entorno de esta sesion no alcanza `*.odoo.com` (el proxy responde 403 al tunel) y no hay credencial exclusiva de la copia. Las escrituras de esta ronda (9: 3 partners, 3 pedidos, 3 notas) se generaron con el codigo del conector y su lista blanca y se **reprodujeron** desde la sesion del navegador de la copia: eso es una **reproduccion**, no una ejecucion del cliente. Impedimento y orden pendiente: una credencial JSON-2 creada para la copia (nunca la de produccion) y una maquina con red hacia ella, y luego `ATH_COPY_ARM='ESCRIBIR SOLO EN LA COPIA DE PRUEBAS ATHERON1-PRUEBAS' npm run sync-copy -- <archivo> --apply`.

Otros limites: el recorrido del huesped usa las rutas publicas con peticiones sin cookies; **no se vio la pantalla** del formulario como huesped porque la ventana del navegador tiene la sesion de administrador abierta (cerrarla exige la contrasena). El fallo de `try/except` se prueba en Python simulado, no en Odoo. Datos sinteticos y 3 reservas se dejan en la copia (vence el 2026-11-24). `test/p0.test.mjs` registra `sync-copy-client.mjs` en la lista de clientes con capacidad de escritura (cada uno con su guarda y sus pruebas): es un cambio de politica que Marlon debe conocer.
Unitarias: `npm test` 431/431.

## Pendiente o limitado
- Tildes, gramatica y concurrencia de formularios: resueltos en la segunda ronda.
- El pais sigue siendo texto libre normalizado por catalogo (no hay selector de pais en Encuestas); lo no reconocido o ambiguo queda para Recepcion.
- Codigos SIRE (paquete de guia): pendientes de fuente oficial; exportador apagado.
- Catalogos TRA: contrastados con fuentes oficiales el 2026-11-08 (rotulos de documento coinciden; motivos y tipo de acomodacion sin lista oficial). Principal con Registro Civil bloqueado antes de enviar; probado en la copia con simulador. Detalle en `TRA-CATALOGOS-FUENTES.md`. Emisor apagado.
