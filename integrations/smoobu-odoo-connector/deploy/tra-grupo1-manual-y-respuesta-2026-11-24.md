# TRA Grupo 1 (PMS): manual oficial, respuesta 2-2026-039958 y reunion del 24/11/2026

Repositorio publico: solo ids, codigos y fuentes. Ningun dato de huespedes, documentos, importes reales ni secretos.
Estado al cierre: `TRA_EMITTER_ENABLED=no`, `TRA_AUTO_SEND=no`, `TRA_ENABLED=no`. SIRE y Smoobu -> Odoo sin cambios.
No se ha hecho ninguna peticion a pms.mincit.gov.co ni se ha enviado ningun ticket o correo.

## 1. Fuentes
| Fuente | Que es | Uso aqui |
|---|---|---|
| https://tramincit.gov.co/ > Alojamientos con PMS | Pagina oficial | Enlace al manual, autogestion del token y contacto |
| Manual Grupo 1 "Manual de integracion para prestadores de servicios de alojamiento turistico con PMS bajo Resolucion 409 de 2022", version 02-02-2023 (10 paginas, imagen) | Manual oficial | Leido completo el 24/11. Endpoints, cabecera, JSON, tipos y respuestas |
| Respuesta oficial MinCIT 2-2026-039958 (23/11/2026, Grupo Analisis Sectorial; radicado 1-2026-041876), correo certificado 4-72 | Respuesta escrita | Leida completa el 24/11. Se parafrasea en la seccion 3 |
| Reunion MinCIT del 24/11/2026 (demostracion) | Verbal, comunicada por Marlon | Flujo /one/ -> code -> /two/ con padre -> portal; advertencia de bloqueo (seccion 4) |
| Manual Grupo 2 (formulario web) | Manual oficial | Solo tipos de documento y de acomodacion: la respuesta oficial recomienda seguirlos. Los demas grupos no aportan nada necesario |

## 2. Manual Grupo 1 contra el codigo
| Punto del manual | Antes | Ahora |
|---|---|---|
| `POST https://pms.mincit.gov.co/one/` (principal) y `/two/` (acompanante) | Igual | Igual |
| Cabecera `Authorization` = `token <token>` | `authorization` en minusculas (HTTP no distingue, pero no era lo documentado) | `Authorization: token <token>` y `Content-Type: application/json` (cuerpo "raw" JSON). Una sola peticion por llamada, sin reintentos |
| Cuerpo /one/: 15 claves en el orden del ejemplo (incluida la grafia `cuidad_*`) | Mismas claves, pero `motivo` y `numero_acompanantes` iban despues de `check_out` | Orden exacto del manual (`TRA_ONE_KEYS`); con los valores del ejemplo sale byte a byte igual (prueba) |
| Cuerpo /two/: 10 claves; `padre` sin comillas | Igual | Lista fija `TRA_TWO_KEYS`; `padre` entero positivo |
| Tipos /one/: `numero_identificacion`, `numero_acompanantes`, `rnt_establecimiento` = numerico (el ejemplo los entrecomilla) | Sin validar | Texto de solo digitos; si no, error previo `DATO_NO_ADMITIDO` sin llamada |
| Tipos /two/: todo texto (`numero_identificacion` texto) | Igual | Igual (pasaportes alfanumericos admitidos en acompanantes) |
| `check_in` / `check_out` = fecha AAAA-MM-DD | `check_out` = fecha prevista de la reserva | Llegada y salida REALES de cada ficha, en fecha de Bogota |
| Respuesta /one/ `{"code": N}`; ese numero va en `padre` | Igual | Igual: 2xx con `code` entero = aceptado; cualquier otra cosa no se da por aceptada |
| Respuesta /two/ `{"code": N}`, solo informativo | Igual | Igual |
| No hay campos adicionales | Igual | El cuerpo se arma recorriendo las listas del manual: no puede salir una clave propia |

No se sabe si la API depende del orden de las claves; se sigue el del manual para no alterar el JSON.

## 3. Respuesta oficial 2-2026-039958 (parafraseada) y como se aplica
1. Integracion propia admitida (base de datos + API). -> Es nuestro caso.
2. TRA 1.0 no tiene ambiente de pruebas; los registros de prueba se borran pidiendolo por correo a soporte. -> Cero
   envios de prueba o ficticios. El primer envio es un caso real revisado (seccion 9).
3. El token no vence; solo caduca al pedir uno nuevo. -> No se genera otro token.
4. `tipo_identificacion`: texto; se recomienda seguir los tipos del formulario web (Grupo 2). -> Se mantienen los
   rotulos del Grupo 2. Sigue sin lista oficial de la API.
5. `motivo`: la API rechaza valores fuera de su lista y deben ser exactos. La lista no se adjunta. -> `reasons` sigue
   vacio y `verified: false`: ningun motivo se envia.
6. `tipo_acomodacion`: texto; seguir los tipos del Grupo 2. -> Pendiente de fijar el valor del establecimiento.
7. `costo`: costo total de alojamiento del principal y sus acompanantes, sin impuestos; texto, formato libre. -> Ver 5.
8. `numero_habitacion`: texto libre. 9. Ciudades: texto libre, extranjeras por su nombre en espanol. -> Sin cambio.
10. Si todos los campos quedan registrados se devuelve el `code` que sirve de `padre`; otros codigos son errores del
    sistema. 11. La confirmacion se hace en el modulo de consulta https://pms.mincit.gov.co/login/ (usuario = RNT).
12. Si el `code` no llega, el registro no se escribio; se consulta en ese modulo. -> Se conserva la revision manual:
    un timeout o una respuesta sin codigo quedan "incierto" y solo vuelven a pendiente tras revisar el portal
    (un timeout no prueba que el servidor no guardara el registro).
13. Lo enviado no se puede modificar; se pide su borrado a soporte. 14. Solo se envian registros completos; no hay
    procedimiento de reenvio ni de modificacion; sin costo.
15. Basta con enviar los registros al realizar el check-out. -> Implementado: cero envios antes de la salida real.

## 4. Advertencia verbal del asesor (reunion del 24/11/2026)
- **Que se sabe:** Marlon comunica que, para integraciones con terceros, alterar el JSON y repetir peticiones fallidas
  puede provocar bloqueos. Es una advertencia **verbal**, sin respaldo escrito.
- **Que no se sabe:** el mecanismo, el umbral, si el bloqueo es por token, por RNT o por IP, su duracion y como se
  levanta. No se supone ninguno.
- **Que hace el codigo para reducir la exposicion (precauciones propias, no reglas del MinCIT):**
  - JSON con claves, orden y tipos del manual; solo se sustituyen valores;
  - una peticion por ficha; el cliente no reintenta;
  - la estancia se detiene en el primer acompanante que no quede aceptado (`ACOMPANANTE_<resultado>`);
  - el recorrido programado se detiene en la primera estancia con una peticion fallida (`DETENIDO_TRAS_FALLO`);
  - con una ficha rechazada, incierta o en envio, la estancia entera espera revision (`TRA_*_REVISAR`);
  - tras dos peticiones reales fallidas de la misma ficha, bloqueo hasta soporte (`INTENTOS_FALLIDOS_REPETIDOS`);
  - sin ensayos: no hay ambiente de pruebas y no se envian registros ficticios.

## 5. Costo (`costo`)
- **Implementado:** solo un registro `x_tra_amount` confirmado con evidencia, en COP, con dos constancias nuevas
  (`x_excludes_taxes`: no incluye impuestos; `x_covers_all_guests`: cubre el alojamiento del principal y de todos sus
  acompanantes) y fecha de corte **igual o posterior a la salida real** de la estancia (Bogota) y no futura.
  "Confirmar con evidencia" exige las constancias y la salida real de todas las fichas; el emisor lo vuelve a
  comprobar. Una tarifa o un anticipo no se toman como importe definitivo.
- **Codigos nuevos:** `IMPORTE_ESPERA_SALIDA`, `IMPORTE_CORTE_ANTES_DE_SALIDA`,
  `IMPORTE_SIN_CONSTANCIA_SIN_IMPUESTOS`, `IMPORTE_SIN_CONSTANCIA_ALCANCE`.
- **Reglas que la respuesta NO aclara (pendientes; mientras tanto no se confirma el importe en esos casos):**
  1. saldo pendiente al salir: lo pagado o lo facturado;
  2. comision o retencion de una OTA: bruto o neto;
  3. descuentos, cupones y reembolsos posteriores;
  4. consumos y servicios adicionales (desayuno, parqueadero, lavanderia): dentro o fuera del alojamiento;
  5. una reserva con varias habitaciones o grupos con varios principales;
  6. pagos en moneda extranjera: tasa y fecha de conversion;
  7. formato: entero o con decimales, separadores.

## 6. Motivos y catalogo
- `tra-catalog.json`: `verified: false`, `reasons: {}`. Las tres propuestas de `reasonsProposed` no se envian.
- Mientras `verified` sea `false`, el envio real esta cerrado (`CATALOGO_NO_VERIFICADO`). Para abrirlo hace falta la
  lista exacta de motivos de la API (punto 5) por escrito. Los ejemplos del manual (`C.C`, `Pasaporte`, `Trabajo`,
  `Casa`) son ejemplos, no listas completas.

## 7. Comprobacion en el portal PMS (despues de cada envio y ante cualquier "incierto")
1. Entrar en https://pms.mincit.gov.co/login/ con el RNT y la clave del modulo de consulta (se pide una vez y llega al
   correo del RNT). Una sola consulta por caso; no refrescar en bucle.
2. Buscar la estancia en "Mis Huespedes" por fecha y verificar el principal **y cada acompanante**.
3. Captura sin datos ajenos a la estancia; adjuntarla en Odoo al intento (*Registrar resultado de reporte*).
4. Si aparece: *Aceptado* con evidencia. Si no aparece: *Comprobado: no recibido* (vuelve a pendiente; un solo reenvio
   revisado). Si aparece duplicado o con datos equivocados: solicitud de borrado (seccion 8). Nunca reenviar sin mirar.

## 8. Solicitud de borrado a soporte (solo si hay un registro real equivocado o duplicado; no enviada)
Desde el correo del RNT, por Marlon, a `cmurillo@mincit.gov.co` y `dortiz@mincit.gov.co`:
> Asunto: Solicitud de borrado de registro TRA - RNT 235267
> Cordial saludo. Como titular del RNT 235267 solicito el borrado del siguiente registro enviado por integracion PMS
> (Grupo 1), por [duplicado / dato equivocado: indicar cual, sin repetirlo]. Fecha y hora del envio: [..]. Codigo
> devuelto por /one/: [..] (y codigos de acompanantes, si los hay). Fechas de la estancia: [..]. Quedo atento a la
> confirmacion para registrar el dato correcto. [Nombre, cedula, telefono]
- Registrar en Odoo, en el intento, la fecha de la solicitud y la respuesta. No se reenvia hasta confirmar el borrado.

## 9. Plantilla de ticket (Centro de Gestion de Incidentes, https://gestion.mincit.gov.co/siat/login.php; no enviada)
Solo ante un fallo concreto que la documentacion no resuelva. Hoy **no hay fallo concreto**: no se ha hecho ninguna
peticion. Contenido: RNT; endpoint (`/one/` o `/two/`); fecha y hora (Bogota); estado HTTP; cuerpo de la respuesta
**sin datos personales**; codigo interno del intento (`x_report_attempt`); lista de claves enviadas (sin valores);
pregunta concreta. Nunca el token ni datos de huespedes.

## 10. Estancias ya registradas
Produccion, lectura del 24/11/2026: 7 fichas, ninguna con llegada ni salida real, `x_tra_state` vacio; 0 intentos
(`x_report_attempt`); 0 importes (`x_tra_amount`); enlaces de registro sin abrir. **Ninguna estancia afectada; no hace
falta migrar nada.** Regla para el futuro: no se reescribe historial. Una ficha aceptada conserva su intento y las
fechas reportadas; si luego se corrige la salida aparece "Discrepancia de fechas" y no se reenvia nada. Una ficha
pendiente simplemente espera la salida real.

## 11. Configuracion pendiente (nada se activa sin aprobacion)
1. **Secreto `TRA_TOKEN`** en GitHub con el token existente (correo del 25/02/2026). Su existencia no se pudo comprobar
   el 24/11 (sin sesion de GitHub en el navegador usado); el 19/11 no existia. No generar otro: invalida el anterior.
2. **Odoo produccion:** aplicar el manifiesto de esta rama (seccion 12).
3. **Establecimiento:** `x_tra_mode=api`; `x_tra_establishment_name` con su fuente (la comprobacion sin envio da
   `NOMBRE_TRA_SIN_REGISTRAR` si falta); `x_tra_accommodation_type` (decision: el certificado RNT dice Vivienda
   turistica / Casa turistica y el Grupo 2 lista apartamento, casa o finca); `x_tra_cost_basis=total_estancia`;
   `x_tra_config_verified` en falso hasta revisar el primer caso.
4. **Catalogo:** lista exacta de motivos (seccion 6).

## 12. Despliegue concreto (con respaldo y reversion; solo con aprobacion de Marlon)
Cambios de Odoo de esta rama frente a produccion (`e93ea57`), segun el diff del manifiesto:
- **2 creaciones:** `x_tra_amount.x_excludes_taxes` y `x_tra_amount.x_covers_all_guests` (booleanos).
- **3 reescrituras con cambio:** accion "Confirmar importe pagado (con evidencia)" y las dos vistas de importes.
- Todo lo demas, reescritura identica. Huella del manifiesto: `6c30f3dde1efb5f2` (antes `6ead35ac6e33321f`).
Orden: primero Odoo y despues la fusion (el emisor nuevo lee los dos campos).
1. La copia `atheron1-pruebas-20261108` vence el 24/11. Si ya no existe: nueva copia (PROCEDIMIENTO-COPIA-PRUEBAS.md)
   y ensayo alli, o decision expresa de aplicar sin ensayo.
2. Paquete: `node scripts/sire-tra-prod-bundle.mjs` desde la cabeza aprobada; comprobar su sha256.
3. Consola de atheron1.odoo.com: `bootProduction(window, <frase>)`, `snapshot()` (respaldo), `plan()`: debe dar
   2 creaciones y 0 bloqueos; si difiere, se detiene.
4. `apply()` una sola vez en segundo plano y consultar hasta terminar; `verify()`.
5. Comprobar: conteos iguales al respaldo; automatizaciones sin cambio (`au_amount_guard` sigue activa); permisos de
   `x_tra_amount` sin escritura ni borrado.
6. Fusionar la cabeza exacta de la PR. Variables TRA siguen en `no`.
**Reversion:** reaplicar el manifiesto de `e93ea57` con el aplicador de produccion (devuelve la accion y las vistas;
los dos campos quedan sin uso, no se borran) y revertir la fusion. Mientras el emisor siga apagado no hay efecto en
produccion.

## 13. Siguiente accion: primer envio desde Odoo (un caso real, revisado)
1. Caso real: fichas validadas, llegada y salida reales de todos, importe confirmado despues del check-out.
2. Comprobacion sin envio (`workflow_dispatch`, `order_id`, sin `send`): `ready_data: true`; solo deben quedar las
   puertas (`TRA_ENABLED_APAGADO`, `SIN_TOKEN`, `CATALOGO_NO_VERIFICADO`, `CONFIG_ESTABLECIMIENTO_NO_VERIFICADA`).
3. Revisar campo por campo con Marlon; resolver catalogo y configuracion.
4. Con aprobacion: `TRA_ENABLED=yes-real`, `TRA_EMITTER_ENABLED=yes`, `TRA_AUTO_SEND=no`; **una** ejecucion manual
   con `send` y ese `order_id`.
5. Aceptado (2xx con `code`) -> portal (seccion 7) para principal y acompanantes, captura en Odoo. Rechazado o
   incierto -> no repetir; portal; si hace falta, ticket (seccion 9).
6. Volver las tres variables a `no` hasta decidir el modo programado.

## 14. Preguntas para MinCIT / soporte
1. Lista exacta de valores de `motivo` aceptados por la API.
2. `numero_identificacion` del principal es "numerico": como se envia un pasaporte con letras.
3. Rotulos exactos de `tipo_identificacion` y `tipo_acomodacion` que acepta la API (ademas de los ejemplos).
4. Costo: las siete reglas de la seccion 5.
5. Grupos con varios principales y acompanantes con fechas distintas de llegada o salida.
6. Estados HTTP y cuerpos de error posibles; que significan los "otros codigos".
7. Bloqueo por peticiones fallidas: existe, umbral, alcance y como se levanta.
8. Borrado: datos que necesitan y plazo de respuesta.
