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

## Pendiente o limitado
- Tildes, gramatica y concurrencia de formularios: resueltos en la segunda ronda.
- El pais sigue siendo texto libre normalizado por catalogo (no hay selector de pais en Encuestas); lo no reconocido o ambiguo queda para Recepcion.
- Codigos SIRE (paquete de guia) y catalogos TRA: pendientes de fuente oficial; exportador y emisor apagados.
