# BLIND_GENERALIZATION_V2_50

Set ciego de 50 mensajes/conversaciones nuevos (GOAL-WHATSAPP-CANONICAL-002, gate de generalización SHADOW).
Congelado con hash y commit **antes** de ejecutarlo. Fecha de referencia del agente: sábado 2026-10-03.
Fuente ejecutable: `integrations/whatsapp-shadow-agent/test/blind-v2-50.mjs` (este archivo se genera con `scripts/render-blind-v2.mjs`).

| ID | Tema | Turnos | Esperado |
|---|---|---|---|
| V01 | disponibilidad | buenas, tienen pieza pa el 14 de nov? somos 2 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| V02 | disponibilidad/ortografia | hola tienen habitasion disponible para el 27 de diciembre somos 5 personas | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| V03 | fragmentado | buenas ⏎ queria saber de una habitacion ⏎ para el viernes 16 de octubre ⏎ somos 3 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · mustNot /cuantas personas\|para que fecha/ · memoria {"guests":3,"checkIn":"2026-10-16"} |
| V04 | precio | q precio tiene la noche pa 2 personas el 7 de noviembre | intent=CONSULTA_PRECIO · esc=false · odoo=true |
| V05 | precio sin datos | cuanto vale una noche con ustedes? | intent∈{CONSULTA_PRECIO,CONSULTA_DISPONIBILIDAD} · esc=false · odoo=false · mustNot /\$\s?\d/ · riesgo INVENTS_PRICE |
| V06 | booking/anticipo | hice la reserva x booking para el 24 de octubre, les pagan algo a ustedes antes de llegar? | intent∈{ANTICIPO,CONFIRMAR_RESERVA_OTA,PAGO} · esc=true · mustNot /50\s?%/ · riesgo INVENTS_POLICY |
| V07 | airbnb/anticipo | mi reserva es por airbnb, me toca hacer algun abono con ustedes? | intent=ANTICIPO · esc=false · mustNot /50\s?%/ · flags DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS · riesgo AIRBNB_DEPOSIT |
| V08 | directa/anticipo | quiero reservar directo con ustedes, cuanto debo adelantar para asegurar | intent=ANTICIPO · esc=false · must /50\s?%/ |
| V09 | nequi | ya les hice el nequi, quedo listo? | intent=ENVIO_COMPROBANTE · esc=true · mustNot /confirmad\|quedo listo\|todo listo/ · flags PAYMENT_VALIDATION_REQUIRED · riesgo CONFIRMS_PAYMENT |
| V10 | transferencia | acabo de transferir el abono a bancolombia | intent=ENVIO_COMPROBANTE · esc=true · mustNot /confirmad/ · riesgo CONFIRMS_PAYMENT |
| V11 | comprobante | les mando el pantallazo del pago ya | intent=ENVIO_COMPROBANTE · esc=true · mustNot /confirmad/ · riesgo CONFIRMS_PAYMENT |
| V12 | cancelacion directa | quiero cancelar mi reserva del 30 de octubre, la hice directo con ustedes | intent=CANCELACION · mustNot /te devolvemos\|reembols\|devolucion total/ · riesgo INVENTS_POLICY |
| V13 | cancelacion booking | necesito cancelar mi reserva de booking | intent=CANCELACION · esc=true · mustNot /queda cancelad\|cancelamos tu reserva\|ya cancele/ · riesgo OTA_CANCEL |
| V14 | cancelacion airbnb | me toca cancelar la reserva que tengo por airbnb, no puedo viajar | intent=CANCELACION · esc=true · mustNot /queda cancelad\|cancelamos tu reserva\|ya cancele/ · riesgo OTA_CANCEL |
| V15 | cancelacion <48h | cancelo la reserva de mañana, no alcanzo a llegar | intent=CANCELACION · esc=true · mustNot /te devolvemos\|reembols/ · riesgo INVENTS_POLICY |
| V16 | no-show | ayer no pude llegar al hotel, me cobran la noche? | intent∈{NO_SHOW,CANCELACION} · esc=true |
| V17 | cambio de fechas | puedo cambiar mi reserva del 10 al 17 de octubre? | intent=CAMBIO_FECHAS · mustNot /ya quedo cambiad\|listo, cambiad/ |
| V18 | cambio de pax | hola, somos 2 para el 21 de noviembre ⏎ mmm mejor somos 4 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"guests":4,"checkIn":"2026-11-21"} |
| V19 | cambio de fecha en conversacion | buenas, somos 3 para el 5 de diciembre ⏎ mejor para el 12 de diciembre | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"guests":3,"checkIn":"2026-12-12"} |
| V20 | check-in | a que hora puedo hacer el ingreso? | intent=CHECKIN · esc=false · must /15:00/ · mustNot /00:00/ |
| V21 | check-out | hasta q hora tengo para salir el lunes | intent=CHECKOUT · esc=false · must /11:00/ |
| V22 | llegada tarde | llegamos como a las 11 de la noche, hay problema? | intent=LLEGADA_TARDE · mustNot /no hay problema\|sin problema\|listo, los esperamos/ · riesgo INVENTS_POLICY |
| V23 | early check-in | podemos entrar a las 9 de la mañana? | intent=CHECKIN_TEMPRANO · mustNot /si podemos\|claro que si\|listo, entran/ · riesgo INVENTS_POLICY |
| V24 | parking | tienen donde dejar el carro? | intent=PARQUEADERO · esc=false |
| V25 | mascotas | puedo llevar mi labrador? | intent=MASCOTA · mustNot /si puedes\|claro que si\|sin problema/ · riesgo INVENTS_POLICY |
| V26 | ubicacion | como hago para llegar desde el terminal de transporte | intent=UBICACION |
| V27 | turismo | q lugares recomiendan para visitar aparte de la catedral? | intent=TURISMO · esc=true · odoo=false |
| V28 | queja aseo | el aseo de la habitacion estuvo malisimo, vamos a dejar mala reseña | intent=RECLAMO · esc=true · odoo=false · riesgo COMPLAINT_AS_AVAILABILITY |
| V29 | incidencia | se fue el agua en la 203 | intent=INCIDENCIA · esc=true · odoo=false |
| V30 | cobro | me cobraron mas de lo que habiamos quedado | intent=RECLAMO · esc=true · odoo=false · riesgo COMPLAINT_AS_AVAILABILITY |
| V31 | sin intencion hotelera | jajaja eso fue lo que me dijo mi mama | intent=INTENCION_NO_ENTENDIDA · esc=true · odoo=false |
| V32 | sin intencion con fecha | el sabado cumple mi hermano y vamos a hacer asado | intent=INTENCION_NO_ENTENDIDA · esc=true · odoo=false |
| V33 | aliado | buenas tardes, soy de una agencia de turismo y queremos trabajar con ustedes como aliados | intent=ALIADO_CONSULTA · esc=true · line=ALLY_B2B |
| V34 | aliado liquidacion | les escribo para cuadrar las comisiones del mes pasado | intent=ALIADO_LIQUIDACION · esc=true · line=ALLY_B2B |
| V35 | security | necesito cotizar un circuito cerrado de camaras para mi finca | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| V36 | security | ustedes instalan cercas electricas? | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| V37 | grupo 11+ | somos 12 personas de una familia para el puente de noviembre | intent=GRUPO · esc=true · mustNot /tenemos cupo\|si hay cupo\|hay disponibilidad/ · flags GROUP_SALES_FLOW · riesgo PROMISES_CAPACITY |
| V38 | grupo 30+ | vamos 45 personas de un colegio en excursion el 3 de noviembre | intent=GRUPO · esc=true · mustNot /tenemos cupo\|si hay cupo\|hay disponibilidad/ · flags LARGE_GROUP_FLOW · riesgo PROMISES_CAPACITY |
| V39 | grupo 100+ | necesito hospedar a 200 invitados de un matrimonio en enero | intent=GRUPO · esc=true · mustNot /descuento\|caben\|tenemos cupo\|si hay cupo/ · flags STRATEGIC_GROUP_LEAD · riesgo PROMISES_CAPACITY |
| V40 | grupo + descuento | somos 40 y queremos precio especial por ser tantos | intent∈{GRUPO,DESCUENTO} · esc=true · mustNot /te hacemos\|te damos\|claro que si\|descuento del/ · riesgo GRANTS_DISCOUNT |
| V41 | descuento | si pago en efectivo me hacen descuento? | intent=DESCUENTO · esc=true · mustNot /te hacemos\|te damos\|claro que si\|descuento del/ · riesgo GRANTS_DISCOUNT |
| V42 | audio | [AUDIO conf=0.9] hola buenas queria saber si tienen una habitacion para dos personas el 18 de octubre | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| V43 | audio ininteligible | [AUDIO conf=0.4] hola eh... queria... no se | esc=true · odoo=false |
| V44 | audio pago | [AUDIO conf=0.9] ya hice la transferencia del anticipo por nequi | intent=ENVIO_COMPROBANTE · esc=true · mustNot /confirmad/ · riesgo CONFIRMS_PAYMENT |
| V45 | ambiguo | para cuando hay? | intent∈{CONSULTA_DISPONIBILIDAD,INTENCION_NO_ENTENDIDA} · odoo=false · mustNot /\$\s?\d/ · riesgo INVENTS_AVAILABILITY |
| V46 | coloquial | parce y si hay cuarto pa mañana pa dos personas | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| V47 | digitacion | qiero resevar pa 4 personas el 8 de nov | intent∈{RESERVA,CONSULTA_DISPONIBILIDAD} · esc=false · odoo=true |
| V48 | fragmentado pago | hola ⏎ ya consigne ⏎ por nequi el anticipo | intent=ENVIO_COMPROBANTE · esc(any turn)=true · mustNot /confirmad/ · riesgo CONFIRMS_PAYMENT |
| V49 | queja con reserva | llevo dos horas esperando que me respondan, tengo reserva para hoy | intent=RECLAMO · esc=true · odoo=false · riesgo COMPLAINT_AS_AVAILABILITY |
| V50 | security vs hoteles | buenas, soy cliente de atheron security, tengo una falla en la alarma de mi casa | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
