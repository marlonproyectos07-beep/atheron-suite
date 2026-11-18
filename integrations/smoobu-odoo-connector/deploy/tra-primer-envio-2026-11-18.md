# TRA: primer envio oficial, preparado y NO transmitido (2026-11-18)

Repositorio publico: aqui solo hay ids, codigos y fuentes. Ningun dato de huespedes, documentos ni NIT.
Variables al cierre: `TRA_EMITTER_ENABLED=no`, `TRA_AUTO_SEND=no`, `TRA_ENABLED=no`. SIRE apagado y separado.

## 1. Alcance del emisor (esta PR)
- **Manual** (`workflow_dispatch` o ejecucion local): `order_id` es **obligatorio** en simulacion y en envio real.
  Solo se leen y procesan los huespedes de ese pedido. Termina en **error** (codigo de salida 1), sin escribir en Odoo
  y sin llamar a la API TRA, si el valor esta vacio (`PEDIDO_VACIO`), mal escrito (`PEDIDO_INVALIDO`), fuera del rango
  de ids de Odoo, 1..2147483647 (`PEDIDO_FUERA_DE_RANGO`), o si el pedido no tiene huespedes con TRA pendiente y
  llegada real (`PEDIDO_SIN_TRA_PENDIENTE`). Un envio manual con puertas cerradas tambien termina en error
  (`PUERTAS_CERRADAS`). En los cuatro primeros casos no hay ninguna peticion de red.
- **Programado** (`schedule`): autorizacion independiente. Envia solo con `TRA_AUTO_SEND=yes` (lo comprueba el workflow
  y otra vez el script: `ENVIO_PROGRAMADO_NO_AUTORIZADO`); sin ella solo lista ids. No admite pedido. Sigue apagado.
- Sin cambios en las puertas del envio real: `TRA_ENABLED=yes-real`, secreto `TRA_TOKEN`, `tra-catalog.json` con
  `"verified": true` y establecimiento en modo API con configuracion verificada. Esta PR no marca nada como verificado.

## 2. Importe: fuente oficial y separacion tarifa / pagado
- **Lo que exige TRA**: "valor total pagado por el servicio de alojamiento" (Res. 409 de 2022 del MinCIT, art. 2, que
  sustituye el art. 7 de la Res. 700 de 2021). Manual Grupo 2, 4.12: en pesos colombianos. Manual de integracion PMS:
  campo `costo`, texto. El portal TRA (Mis Huespedes) lo muestra como "PAGO TOTAL".
- **Tarifa contratada** = total del pedido (`amount_total`). **Suma efectivamente pagada** = pagos con soporte.
  No son lo mismo y no se sustituyen entre si.
- **Brecha conocida del emisor**: hoy calcula `costo` con `amount_total` (tarifa contratada) cuando la base es
  `total_estancia`. No comprueba pagos. Mientras no se decida la regla y la fuente del pago respaldado, ningun envio
  real debe aprobarse con una tarifa en lugar de lo pagado.

## 3. Nombre del establecimiento y nombre del titular
- Certificado RNT 235267 (Camara de Comercio de Bogota, expedido 18/03/2026): certifica "el inmueble" bajo el nombre del
  **titular persona natural**, con direccion comercial y categoria Viviendas turisticas / Casa turistica. **No registra
  un nombre de establecimiento distinto del titular.**
- Portal TRA del RNT (grupo PMS): "Nombre Comercial" = nombre del titular.
- "Atheron Suite" (`x_name` del establecimiento en Odoo) proviene de orden de gerencia, no del RNT.
- El emisor envia `nombre_establecimiento = x_name`. Pendiente decidir: registrar "Atheron Suite" como nombre comercial
  en el RNT, o enviar el nombre comercial que hoy figura en el RNT. No se cambia el titular ni `x_name`.

## 4. Motivo de viaje
- Proviene **solo** del formulario del huesped (`x_travel_reason`). El emisor no lo completa por defecto: sin
  equivalencia en `tra-catalog.json` -> `DATOS_INCOMPLETOS:motivo` y no se envia.
- El MinCIT no publica lista de valores (manual Grupo 2, 4.7: lista desplegable sin enumerar; ejemplo de la API
  "Trabajo"). La equivalencia sigue vacia hasta decision de gerencia o respuesta del MinCIT.

## 5. Caso candidato: pedido 22253 (COT/2026/03905), estado al 18/11/2026
| Requisito | Estado | Fuente |
|---|---|---|
| Reserva | directa, habitacion 203, 18 al 19/11, 1 adulto | Smoobu y Odoo |
| Tarifa contratada | 65.000 COP (linea sin impuestos) | Odoo y Smoobu |
| Pago respaldado | **Falta.** Smoobu registra un anticipo marcado "Paid" el 17/11 por 58.500 COP (registro del anfitrion); Odoo: pagado 0, sin facturas ni transacciones | Smoobu, Odoo |
| Formulario del huesped | **Falta** (enlace 12 "invitado", sin abrir; sin telefono ni correo: entrega en persona) | Odoo |
| Validacion de Recepcion (habitacion 203) | **Falta** (no hay ficha) | Odoo |
| Pedido confirmado | **Falta** (borrador; "Registrar llegada" exige pedido confirmado) | Odoo |
| Llegada real con hora | **Falta** | Odoo |
| Motivo | **Falta** (del formulario) | - |

Datos ya acreditados para la carga: RNT 235267, habitacion 203 (por validar), salida 2026-11-19, 0 acompanantes,
tipo de acomodacion "Casa" (certificado RNT + manual Grupo 2 4.11 + ejemplo de la API), destino `POST /one/`.

## 6. Secuencia propuesta (cada paso con aprobacion)
1. Marlon guarda el token existente (correo "Solicitud de Token PMS" del 25/02/2026) como secreto `TRA_TOKEN`.
   No se genera ni renueva otro token.
2. Completar el caso: formulario, validacion, confirmacion del pedido, llegada real y pago respaldado.
3. Decisiones: motivo (equivalencia), nombre del establecimiento, regla del importe pagado.
4. Revisar y fusionar esta PR.
5. Solo entonces: catalogo y configuracion verificados, `TRA_ENABLED=yes-real`, `TRA_EMITTER_ENABLED=yes`
   (`TRA_AUTO_SEND` sigue en `no`); simulacion con `order_id=22253`; envio con `order_id=22253`.
6. Aceptado = HTTP 2xx con `code` entero, guardado en la linea; comprobar la fila en Mis Huespedes y guardar captura
   como adjunto en Odoo (MinCIT, respuesta 2-2026-018244: TRA no expide constancia).
7. Volver `TRA_ENABLED` y `TRA_EMITTER_ENABLED` a `no`.
