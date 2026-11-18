# TRA: primer envio oficial, preparado y NO transmitido (2026-11-18)

Repositorio publico: aqui solo hay ids, codigos y fuentes. Ningun dato de huespedes, documentos, NIT ni importes reales.
Variables al cierre: `TRA_EMITTER_ENABLED=no`, `TRA_AUTO_SEND=no`, `TRA_ENABLED=no`. SIRE apagado y separado.
Los cambios de Odoo de esta PR (modelo `x_tra_amount`, campos de nombre TRA, acciones y vistas) **no estan aplicados en
produccion**: requieren el aplicador con su frase, respaldo y aprobacion de Marlon.

## 1. Alcance del emisor
- **Manual** (`workflow_dispatch` o local): `order_id` obligatorio en la comprobacion y en el envio real. Solo se leen y
  procesan las fichas de ese pedido. Error (salida 1) sin tocar Odoo ni MinCIT si el valor esta vacio
  (`PEDIDO_VACIO`), mal escrito (`PEDIDO_INVALIDO`) o fuera de 1..2147483647 (`PEDIDO_FUERA_DE_RANGO`).
- **Comprobacion sin envio** (manual sin `send`): arma el payload de cada ficha del pedido y devuelve, campo por campo,
  `ok` / `falta` / `no_admitido` y todos los bloqueos: pedido no confirmado, sin fichas, ficha no validada, sin llegada
  real, importe, nombre TRA, motivo, estado TRA a revisar y puertas. Solo lectura. La salida lleva codigos, nunca valores.
  Error si el pedido no tiene TRA pendiente (`PEDIDO_SIN_TRA_PENDIENTE`) o si algun dato bloquea (`DATOS_NO_LISTOS`).
- **Envio real manual**: repite la comprobacion; si algo bloquea, no reclama, no escribe y no llama a MinCIT. Con datos
  completos y puertas cerradas: `PUERTAS_CERRADAS`.
- **Programado**: autorizacion independiente (`TRA_AUTO_SEND=yes`, en el workflow y en el script); no admite pedido;
  omite las estancias con datos incompletos. Sigue apagado.

## 2. Importe (campo `costo`)
- **Fuente oficial**: "valor total pagado por el servicio de alojamiento" (Res. 409 de 2022 del MinCIT, art. 2, que
  sustituye el art. 7 de la Res. 700 de 2021); manual Grupo 2, 4.12: en pesos colombianos; manual PMS: `costo`, texto.
- **Tarifa contratada** (`amount_total` del pedido) y **suma efectivamente pagada** son datos distintos. La tarifa
  nunca se envia; solo se informa si difiere de lo pagado.
- **Fuente del importe confirmado**: registro `x_tra_amount` del pedido (menu Registro SIRE/TRA > Importes pagados).
  No es un pago contable y no crea ni modifica pagos, facturas ni pedidos. Campos: importe, moneda, fecha de corte
  (pagos recibidos hasta), tipo de evidencia (comprobante de pago, liquidacion del canal, factura con pago registrado,
  extracto bancario), referencia y archivo. La accion "Confirmar con evidencia" exige todo, COP y corte no futuro, un
  solo confirmado por reserva, y deja quien y cuando. El usuario no puede editarlo ni borrarlo; se anula y se registra
  otro.
- **Bloqueos**: `IMPORTE_AUSENTE`; `IMPORTE_SIN_CONFIRMAR` (registro sin confirmar, p. ej. el "Paid" de Smoobu anotado
  sin contrastar: es un reporte, no evidencia); `IMPORTE_SIN_EVIDENCIA`; `IMPORTE_MONEDA_NO_COP`;
  `IMPORTE_SIN_FECHA_CORTE`; `IMPORTE_FECHA_CORTE_FUTURA`; `IMPORTE_INVALIDO`; `IMPORTE_AMBIGUO`;
  `IMPORTE_MODIFICADO_TRAS_CONFIRMAR`; `IMPORTE_SIN_CONFIRMACION_REGISTRADA`; `COSTO_BASE_NO_ADMITIDA` (solo
  `total_estancia`).
- Pendiente de MinCIT (no lo decide el codigo): si al registrar la llegada se reporta lo pagado hasta ese momento o el
  total de la estancia. Mientras tanto se envia el importe confirmado a su fecha de corte, o nada.

## 3. Nombre del establecimiento
- Certificado RNT 235267 (Camara de Comercio de Bogota, 18/03/2026): certifica "el inmueble" bajo el nombre del titular
  persona natural, con direccion y categoria Viviendas turisticas / Casa turistica. No registra otro nombre.
- Portal TRA del RNT: "Nombre Comercial" = nombre del titular.
- Nuevo campo `x_tra_establishment_name` (+ fuente) en el establecimiento: es lo unico que se envia como
  `nombre_establecimiento`. `x_name` ("Atheron Suite", orden de gerencia) queda como nombre interno y nunca se envia.
  Vacio: `NOMBRE_TRA_SIN_REGISTRAR`. No se cambia el titular ni se renombra nada.

## 4. Motivo de viaje
- Se conserva el texto que declara el huesped (`x_travel_reason`); el emisor no lo modifica ni lo completa.
- Se envia solo una equivalencia de `tra-catalog.json` > `reasons`, que sigue vacia y `verified: false`.
- `reasonsProposed` documenta tres equivalencias con fuente (rotulos observados en el formulario web TRA en una guia no
  oficial); nunca se envian. Salud, Educacion, Religion y Otro: sin propuesta.
- Bloqueos: `MOTIVO_NO_DECLARADO`, `MOTIVO_EQUIVALENCIA_NO_VERIFICADA`, `MOTIVO_SIN_EQUIVALENCIA`.

## 5. Caso candidato: pedido 22253 (COT/2026/03905)
Reserva directa, habitacion 203, 18 al 19/11, 1 adulto. Faltan (ninguno se marca como cumplido):
formulario del huesped, validacion con habitacion 203, confirmacion del pedido, llegada real con hora, importe pagado
confirmado con evidencia, nombre TRA registrado y equivalencia verificada del motivo que declare el huesped.
Smoobu reporta un anticipo "Paid"; es un reporte sin contrastar y no basta.

## 6. Secuencia propuesta (cada paso con aprobacion)
1. Secreto `TRA_TOKEN` con el token existente (correo del 25/02/2026). No se genera otro.
2. Aplicar en produccion el manifiesto de esta PR (aplicador, frase y respaldo) y registrar el nombre TRA con su fuente.
3. Completar el caso: formulario, validacion, confirmacion del pedido, llegada real e importe confirmado con evidencia.
4. Equivalencia del motivo declarado: confirmacion escrita del MinCIT o decision documentada; solo entonces `reasons`.
5. Fusionar; comprobacion sin envio con `order_id=22253` hasta `ready_data: true`.
6. Catalogo y configuracion verificados, `TRA_ENABLED=yes-real`, `TRA_EMITTER_ENABLED=yes` (`TRA_AUTO_SEND=no`);
   envio con `order_id=22253`; aceptado = HTTP 2xx con `code` entero; fila en Mis Huespedes y captura adjunta en Odoo
   (MinCIT, respuesta 2-2026-018244: TRA no expide constancia). Volver las variables a `no`.
