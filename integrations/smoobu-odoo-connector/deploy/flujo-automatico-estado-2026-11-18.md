# Flujo Smoobu -> registro de huespedes -> TRA: estado por tramo (2026-11-18)

Rama `feat/ath-sire-tra-inc1-estructura` (PR #112). Pruebas: 446/446 (Python real incluido).
"Rama" = programado y probado, **no instalado** en atheron1. "Produccion" = instalado y verificado.

| Tramo | Modo | Donde | Evidencia | Pendiente |
|---|---|---|---|---|
| Smoobu -> reserva Odoo (conector) | Automatico, con guardias | Produccion (GitHub Actions, rama `main`) | ejecuciones programadas correctas (ultima #72); desde el 8/11 bloquea las reservas nuevas por guardias de calidad (nombre, total, precio) y avisa sobreventa 301 (4/1/2027) | revisar las reservas bloqueadas; el conector no se modifico |
| Enlace de registro al confirmar / revocar al cancelar | Automatico | Produccion | reservas sinteticas 03899/03900; 4 reales con enlace | - |
| Enlace al INGRESAR la reserva (borrador), excepcion de contacto, mensaje preparado | Automatico | Rama | pruebas: un enlace por reserva, reprocesar sin duplicar, excepcion visible, mensaje no enviado, cancelar revoca | probar en la copia e instalar |
| Envio del mensaje al huesped | Manual (Recepcion) | - | por diseno: sin autorizacion del canal no se envia | autorizacion por canal |
| Formulario -> fichas vinculadas a la reserva | Automatico | Produccion | huesped anonimo sintetico (03901): 2 fichas *Recibido* | - |
| Validacion + habitacion fisica + establecimiento | Manual (Recepcion) | Produccion | fichas sinteticas validadas con habitacion 203 | - |
| Llegada / salida real con hora real y hora de captura, correccion auditada | Manual (Recepcion) | Rama | pruebas Python real (tardia con motivo, correccion con valor anterior, bloqueo si ya reportado) | probar en la copia e instalar; en produccion la version actual guarda la hora del clic |
| TRA: envio tras validacion y llegada real | Automatico preparado, **APAGADO** | Rama (`tra-emitter.yml` cada hora) | reclamo por linea (sin duplicados), incierto sin reenvio, solo validados con llegada | ver bloqueos TRA |
| SIRE | Manual (hoja guiada); exportador apagado | Produccion | cuenta SIRE de ATHERON SAS (119520/25899) registrada en Migracion | acceso y formato sin verificar: **no operativo** |

## Diagnostico del conector (2026-11-18)
- **Ejecucion correcta != sincronizacion efectiva.** La ejecucion #42 (fallida) detuvo el lote con `DUPLICADO_DETECTADO`:
  la reserva ...2219 coincidia por correo o telefono con dos contactos PREVIOS de Odoo (`CONTACTOS_DUPLICADOS`). El job
  `apagado` abrio la incidencia #111 (`BLOQUEO-ESCRITURA-SYNC`) y desde entonces TODAS las ejecuciones (#43 a #72, en verde)
  corren en sombra: **0 pedidos incorporados**. Ultimo pedido creado por el conector: 8/11.
- Ultima ejecucion (#72): incorporadas 0, actualizadas 0 (el conector nunca actualiza), bloqueadas 8 (nombre no
  identificable 4, total no fiable/base distinta 2, precio faltante 1, revision manual 1), conflictos 1 (fechas distintas),
  alerta de sobreventa 1. Omitidas: solo en la bitacora del artefacto (requiere sesion de GitHub).
- Cerrojo en Odoo (`auditSyncWrites`, leido en solo lectura): limpio (0 contactos SMOOBU sin pedido, 0 pedidos duplicados).
- Defecto corregido en la rama (`98e11c8`): los contactos previos duplicados pasan a `CONTACTO_DUPLICADO_EN_ODOO`
  (revision humana; el lote sigue). El duplicado por referencia SMOOBU-<id> sigue deteniendo todo. La plantilla de la
  incidencia ocultaba el numero (`<...>`): el valor de desbloqueo es `DESBLOQUEO-111`.
- La correccion solo actua desde `main` (el horario corre desde la rama por defecto). Desbloquear sin fusionar puede
  volver a bloquear si ...2219 sigue en la ventana.
- Sobreventa 301 (4/1/2027): la reserva ...9171 esta marcada por Smoobu como `OverBooking`; en Odoo la 301 esta libre del
  3 al 6/1 (0 pedidos, disponibilidad 0/1). Revisar en el calendario de Smoobu (posible choque con ...2936, 301, desde el
  6/1, en conflicto de fechas). No se tocaron canales ni inventario.

## TRA por campo (que se resuelve leyendo y que depende del MinCIT)
| Campo / requisito | Estado | Fuente | Accion concreta |
|---|---|---|---|
| `tipo_identificacion` (C.C, Pasaporte, T.I, C.E, Registro Civil) | Resuelto | manuales oficiales Grupo 2 y PMS | - |
| `tipo_identificacion` PEP / PPT | Depende del MinCIT | sin fuente oficial | preguntar en el radicado; hoy el emisor los deja en error previo |
| `motivo` (catalogo `reasons` vacio) | Se resuelve leyendo el portal | lista desplegable del formulario web TRA (manual Grupo 2, 4.7) | abrir el formulario web TRA con la cuenta del RNT y copiar las opciones sin enviar nada |
| `tipo_acomodacion` | Se resuelve leyendo el portal | lista desplegable (manual Grupo 2, 4.11) | igual; elegir la de Atheron Suite |
| `costo` (`x_tra_cost_basis`) | Se resuelve leyendo la norma | Res. 409/2022: "valor total pagado por el servicio de alojamiento" | fijar `total_estancia` |
| Token PMS (`TRA_TOKEN`) | Verificar | correos "Solicitud de Token PMS" (feb.) | confirmar vigencia sin regenerarlo |
| Como se confirma la aceptacion | Parcial | la API devuelve `code`; "Mis Huespedes" lista filas sin codigo ni estado | primer envio real + consulta en el portal; confirmar con MinCIT |
| Correccion de fechas tras aceptar | Depende del MinCIT | sin procedimiento publicado | radicado |
| `verified: true` del catalogo | Depende de lo anterior | - | solo con motivo y acomodacion copiados del portal |

## Que impide activar TRA (exacto)
1. `tra-catalog.json` con `"verified": false` (tipo de identificacion, motivo, tipo de acomodacion sin lista oficial).
2. Establecimiento: `x_tra_mode = manual` y `x_tra_config_verified = false`; `x_tra_accommodation_type` y `x_tra_cost_basis` vacios.
3. Sin respuesta de fondo al radicado MinCIT 1-2026-041876 (solo acuse del 13/11).
4. Token TRA en el secreto `TRA_TOKEN`: no verificable desde esta sesion.
5. El flujo programado solo corre desde `main` (requiere fusion) y con `TRA_EMITTER_ENABLED=yes`, `TRA_AUTO_SEND=yes`, `TRA_ENABLED=yes-real`.
6. Ningun envio oficial sin que Marlon apruebe el primer registro real y el destino.

## Reversion
- Rama: revertir los commits; en Odoo, el aplicador de produccion vuelve a escribir la version anterior del manifiesto.
- Produccion: `disable({apply:true})` apaga automatizaciones y menus sin borrar datos; `setAutomation('au_invite', false)`.
