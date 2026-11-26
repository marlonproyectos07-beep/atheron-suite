# TRA Grupo 1 (PMS): manual oficial, respuesta 2-2026-039958 y reunion del 24/11/2026

Repositorio publico: solo ids, codigos y fuentes. Ningun dato de huespedes, documentos, importes reales ni secretos.
Estado verificado el 24-25/11/2026 en GitHub (sesion de Marlon): `TRA_EMITTER_ENABLED=no`, `TRA_AUTO_SEND=no`,
`TRA_ENABLED=no`; el secreto `TRA_TOKEN` **no existe**. SIRE y Smoobu -> Odoo sin cambios. Ninguna peticion a
pms.mincit.gov.co; ningun ticket ni correo enviado.

Etiquetas: **OFICIAL** = escrito por el MinCIT (manual o respuesta); **VERBAL** = dicho en la reunion, sin respaldo
escrito; **PROPIA** = decision tecnica nuestra; **MARLON** = instruccion de gerencia. Nada PROPIO se atribuye al MinCIT.

## 1. Fuentes
| Fuente | Tipo | Leida |
|---|---|---|
| Manual Grupo 1 "Manual de integracion ... con PMS bajo Resolucion 409 de 2022", version 02-02-2023 | OFICIAL | completo, 24/11 |
| Respuesta MinCIT 2-2026-039958 (23/11/2026; radicado 1-2026-041876), correo certificado 4-72 | OFICIAL | completa, 24/11 |
| Manual Grupo 2 "Manual Usuarios Directos Conectados" (tramincit.gov.co/tarjeta/media/docs/Manual-Grupo-2-Usuarios-Directos-Conectados.pdf) | OFICIAL; la respuesta (puntos 4 y 6) recomienda seguir sus tipos | 4.1, 4.2, 4.6, 4.8 a 4.12, 5.1, 5.2; texto extraido del PDF el 24/11 |
| Reunion MinCIT del 24/11/2026 | VERBAL, comunicada por Marlon | flujo /one/ -> code -> /two/ con padre -> portal; advertencia de bloqueo |
| Certificado RNT 235267 (Camara de Comercio de Bogota, 18/03/2026) | registro oficial | categoria Viviendas turisticas / Casa turistica |

## 2. Origen de cada regla del emisor
| Regla | Origen | Respaldo | Codigo |
|---|---|---|---|
| Enviar solo al check-out | OFICIAL | respuesta, punto 15 | `SIN_SALIDA_REAL`, `ESTANCIA_SIN_SALIDA_REAL` |
| Esperar la salida de todos los huespedes de la estancia | PROPIA | punto 14 (solo registros completos); el principal declara `numero_acompanantes` | idem |
| `check_in` / `check_out` = llegada / salida reales (fecha Bogota) | PROPIA | consecuencia del punto 15; el manual pide fechas | `buildPayload` |
| Endpoints, claves, orden del ejemplo, tipos, `padre` = `code` | OFICIAL | manual Grupo 1 | `TRA_ONE_KEYS`, `TRA_TWO_KEYS` |
| Sin campos propios en el JSON | MARLON (24/11) + VERBAL | advertencia de bloqueo | el cuerpo se arma solo con las listas |
| `Authorization: token <token>` | OFICIAL | manual Grupo 1, Headers | `traHeaders` |
| `Content-Type: application/json` | PROPIA | el manual no lo nombra; cuerpo JSON | `traHeaders` |
| Cero reintentos automaticos; una peticion por llamada | PROPIA | advertencia VERBAL; puntos 13-14 (sin reenvio) | `tra-http.mjs`, `emitStay` |
| Parar en el primer acompanante que falle y en la primera estancia con fallo | PROPIA | advertencia VERBAL (no encadenar peticiones fallidas) | `ACOMPANANTE_<r>`, `DETENIDO_TRAS_FALLO` |
| Rechazado/incierto: nada mas de la estancia hasta revisar el portal | PROPIA | puntos 11-12: la confirmacion se hace en el portal | `TRA_*_REVISAR` |
| Timeout o sin `code` = incierto, nunca "no recibido" automatico | PROPIA | el punto 12 dice que sin code no se escribio, pero un timeout no prueba que no llegara | `classify` |
| Sin duplicados (reclamo previo) | PROPIA | puntos 13-14 | `sa_claim` |
| Documento del principal C.C, T.I, C.E: solo digitos | OFICIAL | Grupo 1 "numerico"; Grupo 2, 4.2 | `DATO_NO_ADMITIDO:numero_identificacion` |
| Pasaporte con letras como principal | NO RESUELTO | Grupo 2, 4.2 lo admite; Grupo 1 dice "numerico" | excepcion especifica (seccion 4) |
| Documento del acompanante: texto | OFICIAL | Grupo 1 | sin validacion |
| Registro Civil solo acompanantes | OFICIAL | Grupo 2, 4.1 y 5.1 | `mainDocTypes` |
| RNT y `numero_acompanantes`: digitos | OFICIAL | Grupo 1 "numerico" | `TRA_ONE_DIGITS` |
| `motivo` exacto de la lista de la API | OFICIAL | punto 5 (lista no entregada) | solo equivalencias con fuente oficial (`reasons`) |
| `Trabajo` como valor de `motivo` | OFICIAL | ejemplo del cuerpo /one/ del manual Grupo 1; respalda ese valor, no la lista | `reasons: {"Trabajo": "Trabajo"}` |
| Sin puerta global de catalogo | MARLON (25/11) | una lista incompleta no bloquea los valores respaldados | `emissionGates` |
| `tipo_acomodacion` texto, segun el Grupo 2 | OFICIAL | punto 6; Grupo 2, 4.11 | seccion 5 |
| Costo del principal y sus acompanantes, sin impuestos | OFICIAL | punto 7; Grupo 2, 4.12 | seccion 6 |
| Costo en COP y solo numeros | OFICIAL | Grupo 2, 4.12 | `IMPORTE_MONEDA_NO_COP` |
| Importe con decimales: no se redondea | PROPIA | 4.12 solo numeros; redondear alteraria el valor | `EXCEPCION_IMPORTE_CON_DECIMALES` |
| Sin envios de prueba ni registros ficticios | OFICIAL + MARLON | punto 2 (sin ambiente de pruebas) | sin pruebas contra la API |
| No generar otro token | OFICIAL | punto 3 | - |

**Retirado:** el limite de "dos fallos por ficha" (PROPIA, sin respaldo). Quedan los reintentos en cero y la revision
humana: tras un rechazo o incierto solo hay otro envio si Recepcion, despues de mirar el portal, registra
"Comprobado: no recibido" y alguien lanza otra ejecucion manual.

## 3. Advertencia verbal (reunion del 24/11/2026)
Marlon comunica que el asesor advirtio, para integraciones con terceros, que alterar el JSON y repetir peticiones
fallidas puede provocar bloqueos. No hay texto escrito. Se desconoce el mecanismo, el umbral, el alcance (token, RNT,
IP), la duracion y como se levanta; no se supone ninguno. Las reglas PROPIAS que dependen de ella estan marcadas arriba.

## 4. Documento del huesped principal
- C.C, T.I y C.E con solo digitos: se envian tal cual. Con puntos, espacios u otros caracteres: `DATO_NO_ADMITIDO`
  (Grupo 2, 4.2), sin corregir el valor.
- Pasaporte solo con digitos: se envia. **Pasaporte con letras: excepcion especifica**
  `EXCEPCION_PENDIENTE:numero_identificacion`. No se envia, no se altera y no afecta a ningun otro caso. Pregunta para
  MinCIT: si `/one/` admite letras en el pasaporte, como el formulario del Grupo 2.
- Acompanantes: el manual Grupo 1 declara texto; un pasaporte con letras se envia tal cual.

## 5. `tipo_acomodacion`
- OFICIAL: texto; se recomienda seguir los tipos del formulario (respuesta, punto 6). Grupo 2, 4.11: elegir de la
  lista desplegable; en viviendas turisticas, si se toma todo el apartamento, la casa o la finca, se elige ese tipo.
- Valor respaldado para el RNT 235267: **`Casa`**. Respaldo: el RNT lo inscribe como Vivienda turistica / Casa
  turistica, y 4.11 nombra "casa". El ejemplo del manual Grupo 1 tambien usa "Casa", pero solo es un ejemplo.
- **Ya registrado en produccion** (lectura del 24/11): `x_tra_accommodation_type = Casa`, `x_tra_mode = api`,
  `x_tra_cost_basis = total_estancia`, `x_tra_config_verified = false`. La ultima escritura es del 18/11 a las 19:35
  (Bogota), con el usuario de Marlon. El documento del 18/11 los daba vacios y el repositorio no registra quien los
  fijo: queda anotada aqui la fuente anterior.
- Limite: 4.11 describe el caso de la casa completa y no dice que elegir cuando se alquila una habitacion. Como el
  campo es de texto y la indicacion es una recomendacion, no bloquea. Queda como decision de Marlon:
  - (a) enviar `Casa` tambien en estancias por habitacion, que es el tipo de vivienda inscrito;
  - (b) preguntarlo antes al MinCIT.

## 6. Costo: que es oficial y que no
| Elemento | Origen |
|---|---|
| Total del alojamiento del principal y sus acompanantes | OFICIAL (punto 7; Grupo 2, 4.12: "el valor que paga el huesped principal") |
| Sin impuestos | OFICIAL (punto 7) |
| COP, solo numeros | OFICIAL (Grupo 2, 4.12) |
| Casillas `x_excludes_taxes` y `x_covers_all_guests` | PROPIA: control de esos dos requisitos. Quien registra el importe declara lo que ya exige la norma; no anaden condiciones |
| Fecha de corte >= salida real, y confirmar despues del check-out | PROPIA + MARLON (23/11: una tarifa o un anticipo no son el importe definitivo), coherente con el punto 15. No bloquea casos validos: el corte es "pagos recibidos hasta" y basta con la fecha de salida |
| Evidencia, confirmacion con quien y cuando, un solo confirmado | MARLON (18/11) |
| La tarifa del pedido nunca se envia | OFICIAL (Res. 409, art. 2, "valor total pagado"; 4.12 "el valor que paga") + MARLON |

**Decisiones pendientes de Marlon.** Ninguna bloquea una estancia sin ese elemento:
1. Saldo pendiente al salir. Hipotesis: el 4.12 dice "el valor que paga", asi que seria lo pagado.
2. Comision de una OTA. Hipotesis: el huesped paga el bruto.
3. Descuentos y reembolsos posteriores.
4. Consumos adicionales.
5. Varias habitaciones o varios principales en una reserva.
6. Pagos en otra moneda.
7. Importes con decimales (excepcion especifica).

## 7. Comprobacion en el portal PMS
1. https://pms.mincit.gov.co/login/, usuario = RNT (clave del modulo de consulta, enviada al correo del RNT). Una
   consulta por caso.
2. "Mis Huespedes": verificar el principal y cada acompanante de la estancia.
3. Captura en Odoo, en *Registrar resultado de reporte*. Si aparece: *Aceptado* con evidencia. Si no aparece:
   *Comprobado: no recibido*. Si aparece duplicado o mal: solicitud de borrado (seccion 8).

## 8. Solicitud de borrado (OFICIAL, puntos 2 y 13; no enviada)
Desde el correo del RNT, por Marlon, a `cmurillo@mincit.gov.co` y `dortiz@mincit.gov.co`:
> Asunto: Solicitud de borrado de registro TRA - RNT 235267. Como titular del RNT 235267 solicito el borrado del
> registro enviado por integracion PMS (Grupo 1) el [fecha y hora], codigo devuelto [code] (y acompanantes [codes]),
> estancia del [fechas], por [duplicado / dato equivocado]. [Nombre y telefono]
No se reenvia hasta confirmar el borrado.

## 9. Ticket de soporte (Centro de Gestion de Incidentes; no enviado)
Hoy no hay fallo concreto: no se ha hecho ninguna peticion. Ante uno, se enviaria:
- endpoint, fecha y hora;
- estado HTTP y cuerpo de la respuesta, sin datos personales;
- id del intento en Odoo;
- claves enviadas, sin valores;
- la pregunta concreta.
Nunca el token.

## 10. Estancias ya registradas
Produccion, 24/11: 7 fichas, ninguna con llegada ni salida; 0 intentos; 0 importes. Ninguna afectada; sin migracion.
No se reescribe historial: una ficha aceptada conserva su intento y sus fechas.

## 11. Despliegue minimo en Odoo (pendiente de aprobacion)
**Diferencias exactas, verificadas en produccion el 24/11 por sha256.** La accion 2040 y las vistas 6872 y 6873 son
identicas a `main` e93ea57, y los dos campos no existen. El despliegue hace exactamente esto:
| # | Objeto | Cambio |
|---|---|---|
| 1 | `x_tra_amount.x_excludes_taxes` | crear (booleano) + xmlid |
| 2 | `x_tra_amount.x_covers_all_guests` | crear (booleano) + xmlid |
| 3 | accion 2040 "Confirmar importe pagado (con evidencia)" | `code`: anade las dos constancias, la salida real de todos y corte >= salida |
| 4 | vista 6872 (formulario de importes) | `arch`: aviso y las dos casillas |
| 5 | vista 6873 (lista de importes) | `arch`: las dos columnas (opcionales) |
No reescribe nada mas, a diferencia del aplicador completo, que reescribe tambien las automatizaciones y hace que
Odoo recalcule su cron. Codigo: `src/sire-tra/delta.mjs`; contenido previo exacto en `delta-base-2026-11-24.mjs`.

**Procedimiento** (consola de atheron1.odoo.com con sesion de administrador):
1. `node scripts/sire-tra-prod-bundle.mjs` desde la cabeza aprobada; comprobar el sha256 impreso.
2. `p = ATH_SIRE_TRA_PROD.bootProduction(window, <frase de aprobacion de Marlon>)`.
3. `await p.snapshot()`: respaldo de configuracion y conteos.
4. `await p.planDelta()`: solo lecturas. Debe dar 5 cambios y 0 bloqueos; cualquier deriva bloquea.
5. Guardar `p.deltaBackup()` (JSON con el codigo y las vistas actuales) fuera de Odoo.
6. `await p.applyDelta()`: exige 3 y 4 en la misma sesion. Despues, `await p.verifyDelta()` debe dar `ok: true`.
7. Comprobar conteos iguales al respaldo y automatizaciones sin cambios (`au_amount_guard` sigue activa).
8. Fusionar la PR (el emisor nuevo lee los dos campos). Las variables TRA siguen en `no`.

**Reversion:** `await p.revertDelta(<respaldo>)` devuelve la accion y las dos vistas al contenido previo. Solo actua si
siguen con el contenido de la rama; si alguien las cambio, se detiene sin escribir. Los dos campos se quedan sin uso y
no se borran. Despues se revierte la fusion. Mientras el emisor este apagado no hay efecto operativo.

**Ensayo en copia (25/11/2026, autorizado por Marlon): HECHO.** Detalle en
`deploy/tra-delta-ensayo-copia-2026-11-25.md`. Copia `atheron1-pruebas-20261125`, aislada 8/8.
- Plan: 5 cambios y 0 bloqueos (los mismos ids que produccion).
- Aplicacion en 6,3 s; verificacion `ok`.
- Automatizaciones y cron 48 sin cambio.
- Vistas cargan.
- La accion responde como se espera en los 5 casos sinteticos.
- Reversion: accion y vistas vuelven byte a byte a la base; los campos se conservan.
Produccion seguia en la base el 25/11 (sha256 de la accion 2040 y de las vistas 6872 y 6873; los campos no existen).

## 12. Bloqueos reales para un primer caso valido
1. **`TRA_TOKEN` no existe** en GitHub. Lo crea Marlon con el token existente (correo del 25/02/2026) en Settings >
   Secrets and variables > Actions > New repository secret. Claude no maneja el token. No se genera otro: invalidaria
   el actual (punto 3).
2. **Despliegue del delta y fusion de la PR**, con aprobacion.
3. **Un caso real cerrado.** Lectura de produccion del 25/11: no existe ninguno (seccion 12.1).
4. **Puertas finales**, por decision de Marlon tras revisar ese caso: `x_tra_config_verified`,
   `TRA_ENABLED=yes-real`, `TRA_EMITTER_ENABLED=yes`, `TRA_AUTO_SEND=no`, y una sola ejecucion manual.

**Motivo: bloqueo por estancia, no global.**
- `Trabajo` tiene respaldo oficial (ejemplo del manual Grupo 1) y se envia si el huesped declara exactamente
  `Trabajo`.
- Desde el 26/11/2026 el formulario ofrece `Trabajo` (`tra-motivo-trabajo-produccion-2026-11-26.md`). Las otras siete
  opciones no tienen equivalencia respaldada: asignar `Trabajo` a "Negocios o motivos profesionales" seria una
  inferencia (RIET 2008). Quedan pendientes solo para la estancia que las declare.
- Para que un caso real salga hace falta que su motivo tenga respaldo.

No bloquean el primer caso:
- un pasaporte alfanumerico o un importe con decimales: excepciones solo de esos casos;
- `tipo_acomodacion`: ya es `Casa`;
- las decisiones de costo de la seccion 6, si el caso no tiene esos elementos.

### 12.1 Caso candidato (solo lectura de produccion, 25/11/2026)
**No hay ningun caso real cerrado.** En Odoo hay 7 fichas y ninguna tiene llegada ni salida real registradas. Hay
0 importes y 0 intentos. Ningun enlace de registro de una reserva real se ha abierto.

| Reserva | Estado | Fechas previstas | Fichas | Falta |
|---|---|---|---|---|
| COT/2026/03901 | **cancelada** | 17-18/11 | 2 validadas (principal y acompanante), motivo "Vacaciones, recreacion u ocio" | No es una estancia valida (pedido cancelado, importe 0) |
| COT/2026/03839 | confirmada | 21-22/11 | ninguna | formulario, validacion, llegada y salida reales, importe con evidencia, motivo con respaldo |
| COT/2026/03838 (Airbnb) | confirmada | 17-18/11 | 1 en borrador, sin datos | lo mismo |
| COT/2026/03875 | confirmada | 8-9/11 | 3 sin datos | lo mismo |
| COT/2026/03776 | confirmada | 23-25/10 | 1 sin datos | lo mismo |
| COT/2026/03905 | borrador | 18-19/11 | ninguna | confirmar el pedido y todo lo anterior |

En las estancias ya pasadas, la llegada y la salida reales solo se pueden registrar con las horas reales que conozca
Recepcion; la accion exige un motivo si el registro es tardio. No se completan por inferencia. Lo mas directo es una
estancia proxima tratada en tiempo real: enlace, formulario, validacion, llegada, salida e importe tras el check-out.

## 13. Primer envio desde Odoo
1. Comprobacion sin envio (`workflow_dispatch`, `order_id`, sin `send`): `ready_data: true`.
2. Revisar campo por campo con Marlon.
3. Abrir las puertas y hacer **una** ejecucion con `send`.
4. Aceptado: portal (seccion 7) y captura. Rechazado o incierto: no repetir; portal; ticket si hace falta.
5. Volver las variables a `no`.

## 14. Preguntas para MinCIT
1. Lista exacta de `motivo` (o el rotulo exacto de cada opcion del formulario de Atheron).
2. Pasaporte con letras en `/one/`.
3. `tipo_acomodacion` para el alquiler por habitacion en una casa turistica.
4. Las decisiones de costo de la seccion 6.
5. Varios principales en una reserva, y acompanantes con fechas distintas.
6. Codigos y cuerpos de error.
7. Alcance del bloqueo por peticiones fallidas.
8. Datos y plazo para pedir un borrado.
