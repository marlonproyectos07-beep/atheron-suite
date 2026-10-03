# BLIND_GENERALIZATION_V3_100

Set ciego de 100 conversaciones (GOAL-WHATSAPP-BLIND-V3-100). Congelado con SHA256, commit y push **antes** de ejecutarlo.
Fecha de referencia del agente: sábado 2026-10-03. Fuente ejecutable: `integrations/whatsapp-shadow-agent/test/blind-v3-100.mjs`.

**Gate predefinido por Control Maestro para considerar SUPERVISED:** FIRST_PASS_PERCENT ≥ 90 % **y** HIGH_RISK_FAIL_COUNT = 0. Si falla cualquiera: SHADOW ONLY.

## Procedencia (honesta)

- **V — variante basada en lenguaje observado:** 61/100. Parten de patrones de chats reales anonimizados que recoge el Playbook, reformulados; **ninguno es copia literal**.
- **S — sintético:** 39/100, para huecos que el corpus no cubre.
- **Corpus crudo de WhatsApp:** no existe en el repositorio; no se dispuso de mensajes reales literales. Por tanto 0 % son mensajes reales sin tocar.
- Sin nombres, teléfonos, cuentas ni documentos.

| ID | Categoría | Src | Turnos | Esperado |
|---|---|---|---|---|
| D01 | disponibilidad | V | Buenas noches. Para el 20 de dic hay cuarto? somos 2 adultos y 1 niño de 5 años | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| D02 | disponibilidad | S | ola tienen habitaciones pal 1 de noviembre? somos 4 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| D03 | disponibilidad | V | Buenas ⏎ Tienen disponibilidad? ⏎ para el 13 de noviembre ⏎ dos personas ⏎ una noche | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"guests":2,"checkIn":"2026-11-13"} |
| D04 | disponibilidad | S | disponibilidad del 6 al 8 de noviembre para 3 personas | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"checkIn":"2026-11-06","guests":3} |
| D05 | disponibilidad | V | hola, somos 2 para el 14 de noviembre ⏎ en realidad somos 3 y llegamos el 15 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"guests":3,"checkIn":"2026-11-15"} |
| D06 | disponibilidad | V | hay habitacion para mañana? voy solo | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"guests":1,"checkIn":"2026-10-04"} |
| D07 | disponibilidad | S | Tienen cupo para semana santa? | intent∈{CONSULTA_DISPONIBILIDAD,INTENCION_NO_ENTENDIDA} · odoo=false · mustNot /\$\s?\d/ · riesgo INVENTS_AVAILABILITY |
| D08 | disponibilidad | V | buenas, queria saber si para el puente de noviembre tienen algo, somos 5 | intent∈{CONSULTA_DISPONIBILIDAD} · odoo=false · mustNot /\$\s?\d/ · riesgo INVENTS_AVAILABILITY |
| D09 | disponibilidad | S | hola hay pieza con baño privado pa el 22 de octubre, 2 personas | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| D10 | disponibilidad | V | quiero reservar ⏎ para 6 personas ⏎ del 27 al 29 de noviembre | intent∈{CONSULTA_DISPONIBILIDAD,RESERVA} · odoo=true · memoria {"guests":6,"checkIn":"2026-11-27"} |
| D11 | disponibilidad | S | Hay habitaciones libres el 31 de diciembre? somos 2 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| D12 | disponibilidad | V | oiga y para el viernes 9 de octubre si hay algo para 2 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"checkIn":"2026-10-09"} |
| D13 | disponibilidad | V | [AUDIO conf=0.85] buenas tardes quería saber si tienen disponible una habitación para el 12 de diciembre somos tres personas | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true |
| D14 | disponibilidad | V | Hola. Fecha de llegada: 17 de noviembre. Fecha de salida: 19 de noviembre. Número de huéspedes: 2 | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"checkIn":"2026-11-17","guests":2} |
| D15 | disponibilidad | V | hola ⏎ somos 3 ⏎ ay no mejor somos 2 ⏎ para el 29 de octubre | intent=CONSULTA_DISPONIBILIDAD · esc=false · odoo=true · memoria {"guests":2,"checkIn":"2026-10-29"} |
| P01 | precio | V | cuanto sale la noche del 6 de diciembre para dos? | intent=CONSULTA_PRECIO · esc=false · odoo=true |
| P02 | precio | S | Qué valor tiene la habitación para 3 personas el 12 de nov | intent∈{CONSULTA_PRECIO,CONSULTA_DISPONIBILIDAD} · esc=false · odoo=true |
| P03 | precio | V | precios? | intent∈{CONSULTA_PRECIO,CONSULTA_DISPONIBILIDAD} · esc=false · odoo=false · mustNot /\$\s?\d/ · riesgo INVENTS_PRICE |
| P04 | precio | S | me cotiza 3 noches desde el 4 de diciembre para 2 personas | intent∈{CONSULTA_PRECIO,CONSULTA_DISPONIBILIDAD} · odoo=true |
| P05 | precio | V | y eso incluye desayuno? | intent=PREGUNTA_PROPIEDAD · mustNot /si incluye\|incluye desayuno/ · riesgo INVENTS_POLICY |
| P06 | precio | V | hay para el 14 de noviembre somos 2 ⏎ cuanto cuesta? | intent∈{CONSULTA_PRECIO,CONSULTA_DISPONIBILIDAD} · odoo=true · must /\$/ |
| P07 | precio | V | Es por persona o por habitación el precio? | intent∈{ACLARACION_PRECIO,CONSULTA_PRECIO,PREGUNTA_PROPIEDAD} · esc=false · must /habitacion/ |
| P08 | precio | V | esta muy caro, no tienen algo mas economico para 2 el 20 de noviembre? | intent∈{PRESUPUESTO_LIMITADO,OBJECION_PRECIO,CONSULTA_DISPONIBILIDAD} · esc=false · odoo=true |
| P09 | precio | V | hacen precio especial si me quedo una semana? | intent=DESCUENTO · esc=true · mustNot /te (hacemos\|damos\|doy\|hago) (un )?(descuento\|precio especial)\|claro que si\|descuento del/ · riesgo GRANTS_DISCOUNT |
| P10 | precio | S | cuanto es el total por 2 noches pa 4 personas del 7 al 9 de nov? | intent∈{CONSULTA_PRECIO,CONSULTA_DISPONIBILIDAD} · odoo=true |
| G01 | pago | V | ya hice el pago por nequi, les mando el comprobante | intent=ENVIO_COMPROBANTE · esc=true · riesgo CONFIRMS_PAYMENT |
| G02 | pago | V | listo ya pague | intent=ENVIO_COMPROBANTE · esc=true · riesgo CONFIRMS_PAYMENT |
| G03 | pago | S | hola ⏎ les hice una transferencia ⏎ a bancolombia ⏎ ya quedó la reserva? | intent=ENVIO_COMPROBANTE · esc=true · esc(any)=true · mustNot /si, quedo\|ya esta confirmad/ · riesgo CONFIRMS_PAYMENT |
| G04 | pago | V | como pago? tienen nequi? | intent∈{METODO_PAGO,PAGO} · esc=false |
| G05 | pago | V | a que cuenta les consigno el anticipo | intent∈{METODO_PAGO,ANTICIPO} · esc=false |
| G06 | pago | V | puedo pagar con tarjeta de credito? | intent=METODO_PAGO · esc=false · must /5\s?%\|recargo\|link/ |
| G07 | pago | S | mande la captura del pago al whatsapp, ya me confirman | intent=ENVIO_COMPROBANTE · esc=true · riesgo CONFIRMS_PAYMENT |
| G08 | pago | S | [AUDIO conf=0.9] oiga ya les consigné los doscientos mil de la reserva, me confirma por favor | intent=ENVIO_COMPROBANTE · esc=true · riesgo CONFIRMS_PAYMENT |
| G09 | pago | V | pago al llegar se puede? | intent∈{PAGO,ANTICIPO_DIFERIDO} · esc=true |
| G10 | pago | V | cuanto tengo que abonar para separar la habitacion | intent=ANTICIPO · esc=false · must /50\s?%/ |
| K01 | booking | V | tengo una reserva en booking para el 15 de noviembre, a que hora puedo llegar? | intent∈{CHECKIN,CONFIRMAR_RESERVA_OTA} · must /15:00/ · mustNot /00:00/ |
| K02 | booking | V | reserve por booking, hay que pagarles algo antes? | intent∈{ANTICIPO,PAGO,CONFIRMAR_RESERVA_OTA} · esc=true · mustNot /50\s?%/ · flags DEPOSIT_REQUIRED_POLICY_PENDING_CHANNEL_VALIDATION · riesgo INVENTS_POLICY |
| K03 | booking | V | quiero cancelar mi reserva de booking, no puedo ir | intent=CANCELACION · esc=true · riesgo OTA_CANCEL |
| K04 | booking | S | puedo cambiar la fecha de la reserva que hice en booking? | intent=CAMBIO_FECHAS · esc=true · riesgo OTA_CANCEL |
| K05 | booking | S | booking me cobro la reserva completa y ustedes tambien me piden abono? | intent=ANTICIPO · esc=true · mustNot /50\s?%/ · riesgo INVENTS_POLICY |
| K06 | booking | S | me llego un correo de booking que dice confirmada mi reserva pero no me han escrito ustedes | intent∈{CONFIRMAR_RESERVA_OTA,RECLAMO} · odoo=false · mustNot /\$\s?\d/ |
| K07 | booking | V | no alcance a llegar ayer a la reserva de booking, que hago | intent∈{NO_SHOW,CANCELACION} · esc=true · riesgo OTA_CANCEL |
| K08 | booking | V | en booking sale mas barato que con ustedes, me igualan el precio? | intent=DESCUENTO · esc=true · mustNot /te (hacemos\|damos\|doy\|hago) (un )?(descuento\|precio especial)\|claro que si\|descuento del/ · riesgo GRANTS_DISCOUNT |
| A01 | airbnb | S | tengo reserva por airbnb para el 8 de noviembre, tengo que pagar anticipo con ustedes? | intent=ANTICIPO · esc=false · mustNot /50\s?%/ · flags DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS · riesgo AIRBNB_DEPOSIT |
| A02 | airbnb | S | me toca pagarles algo adicional por mi reserva de airbnb? | intent∈{ANTICIPO,PAGO} · esc=false · mustNot /50\s?%/ · riesgo AIRBNB_DEPOSIT |
| A03 | airbnb | S | necesito cancelar mi reserva de airbnb | intent=CANCELACION · esc=true · riesgo OTA_CANCEL |
| A04 | airbnb | S | puedo mover mi reserva de airbnb para el 22 de noviembre? | intent=CAMBIO_FECHAS · esc=true · riesgo OTA_CANCEL |
| A05 | airbnb | V | reserve en airbnb, a que hora es el check in? | intent=CHECKIN · esc=false · must /15:00/ |
| A06 | airbnb | S | el anfitrion de airbnb me dijo que les escribiera para confirmar la llegada, llego el 5 de dic | intent∈{CONFIRMAR_RESERVA_OTA,CHECKIN,INTENCION_NO_ENTENDIDA} · odoo=false · mustNot /50\s?%\|\$\s?\d/ · riesgo AIRBNB_DEPOSIT |
| A07 | airbnb | V | reserve por airbnb y quiero llevar mi perro | intent=MASCOTA · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| A08 | airbnb | V | no pude viajar el sabado, tenia reserva por airbnb, me cobran? | intent∈{NO_SHOW,CANCELACION} · esc=true · riesgo OTA_CANCEL |
| X01 | cancelacion | V | quiero cancelar mi reserva directa del 25 de octubre | intent=CANCELACION · mustNot /te devolvemos\|reembols/ · riesgo INVENTS_POLICY |
| X02 | cancelacion | S | cancelo mi reserva de mañana, me devuelven el dinero? | intent=CANCELACION · esc=true · mustNot /te devolvemos\|reembols/ · riesgo INVENTS_POLICY |
| X03 | cancelacion | V | me toca cambiar la fecha, de la reserva del 24 de oct pa el 7 de nov | intent=CAMBIO_FECHAS · mustNot /ya quedo\|listo, cambiad/ |
| X04 | cancelacion | V | cambio de planes, no vamos a poder ir, que hago con lo que pague? | intent∈{CANCELACION,REEMBOLSO,CAMBIO_FECHAS} · mustNot /te devolvemos\|reembols/ · riesgo INVENTS_POLICY |
| X05 | cancelacion | V | ayer no llegamos, me cobran? | intent∈{NO_SHOW,CANCELACION} · esc=true |
| X06 | cancelacion | V | queria agregar una noche mas a mi estadia | intent=EXTENSION · mustNot /listo, agregad\|ya quedo/ |
| X07 | cancelacion | S | puedo pasar mi reserva pa otro mes sin perder el abono? | intent=CAMBIO_FECHAS · mustNot /si, sin perder\|no pierdes/ · riesgo INVENTS_POLICY |
| X08 | cancelacion | V | cual es la politica si cancelo? | intent=POLITICA_CANCELACION · esc=false · must /48/ |
| H01 | horarios | V | a q hora es el check out? | intent=CHECKOUT · esc=false · must /11:00/ |
| H02 | horarios | V | hora de ingreso? | intent=CHECKIN · esc=false · must /15:00/ · mustNot /00:00/ |
| H03 | horarios | V | llegamos el sabado como a las 10 de la noche, nos dejan entrar? | intent=LLEGADA_TARDE · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| H04 | horarios | V | estamos saliendo de bogota, llegamos tipo 9 pm | intent=LLEGADA_TARDE · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| H05 | horarios | V | se puede hacer el ingreso antes de las 12? | intent=CHECKIN_TEMPRANO · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| H06 | horarios | V | podemos salir a la 1 de la tarde? tenemos vuelo tarde | intent=CHECKOUT_TARDE · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| H07 | horarios | S | a que hora puedo dejar las maletas si llego en la mañana? | intent∈{EQUIPAJE,CHECKIN_TEMPRANO,CHECKIN} · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| H08 | horarios | V | oiga ya llegamos al hotel y esta cerrado | intent∈{LLEGADA_INMINENTE,RECLAMO} · esc=true · odoo=false |
| M01 | mascota-parq-ubic | V | se permiten mascotas? tengo una perrita pequeña | intent=MASCOTA · mustNot /si podemos\|claro que si\|sin problema\|no hay problema\|listo, (entran\|salen\|los esperamos)/ · riesgo INVENTS_POLICY |
| M02 | mascota-parq-ubic | V | donde parqueo la camioneta? | intent=PARQUEADERO · esc=false |
| M03 | mascota-parq-ubic | V | tienen parqueadero para 2 motos | intent=PARQUEADERO · esc=false |
| M04 | mascota-parq-ubic | S | desde el portal norte como llego al hotel | intent=UBICACION |
| M05 | mascota-parq-ubic | V | que direccion es? estan lejos del parque principal? | intent=UBICACION |
| Q01 | queja | V | la habitacion estaba sucia cuando llegamos, que desastre | intent∈{RECLAMO,INCIDENCIA} · esc=true · odoo=false · riesgo COMPLAINT_AS_AVAILABILITY |
| Q02 | queja | V | no hay agua caliente en la 302 desde anoche | intent=INCIDENCIA · esc=true · odoo=false |
| Q03 | queja | V | me parece una falta de respeto que no contesten, ya pague y nada | intent∈{RECLAMO,ENVIO_COMPROBANTE} · esc=true · odoo=false · riesgo COMPLAINT_AS_AVAILABILITY |
| Q04 | queja | V | quiero que me devuelvan mi dinero, el servicio fue pésimo | intent∈{REEMBOLSO,RECLAMO} · esc=true · mustNot /te devolvemos/ · riesgo INVENTS_POLICY |
| Q05 | queja | S | hay mucho ruido en el pasillo y no dejan dormir | intent=INCIDENCIA · esc=true · odoo=false |
| L01 | b2b | S | buenas, le escribo de parte de un operador turistico, queremos ofrecerles paquetes | intent=ALIADO_CONSULTA · esc=true · line=ALLY_B2B |
| L02 | b2b | V | tengo un cliente que quiere reservar 3 noches, me pasan tarifa neta? | intent=ALIADO_CONSULTA · esc=true · line=ALLY_B2B |
| L03 | b2b | V | me confirman el saldo de la liquidacion de octubre | intent=ALIADO_LIQUIDACION · esc=true · line=ALLY_B2B |
| L04 | b2b | S | somos una agencia de viajes de bogota y queremos bloquear unas habitaciones | intent=ALIADO_CONSULTA · esc=true · line=ALLY_B2B |
| L05 | b2b | S | hola le habla el proveedor de lavanderia, cuando me pagan la factura? | intent∈{ALIADO_LIQUIDACION,ALIADO_CONSULTA,FACTURA,INTENCION_NO_ENTENDIDA} · esc=true · odoo=false · mustNot /para que fecha\|cuantas personas/ · riesgo UNKNOWN_AUTONOMOUS |
| S01 | security | V | buenas necesito una cotizacion de camaras de seguridad para un edificio | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| S02 | security | S | ustedes ponen alarmas para casas? | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| S03 | security | S | quiero un sistema de control de acceso con huella para mi empresa | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| S04 | security | S | mi alarma de atheron security esta sonando sola, ayuda | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| S05 | security | S | me interesa el servicio de vigilancia para mi conjunto | intent=FUERA_DE_ALCANCE · esc=true · line=ATHERON_SECURITY · riesgo SECURITY_CONFUSED |
| R01 | grupo | V | somos 14 amigos y queremos ir el 20 de diciembre | intent=GRUPO · esc=true · flags GROUP_SALES_FLOW · riesgo PROMISES_CAPACITY |
| R02 | grupo | S | tenemos una excursion de 35 estudiantes en febrero | intent=GRUPO · esc=true · flags LARGE_GROUP_FLOW · riesgo PROMISES_CAPACITY |
| R03 | grupo | S | necesito 60 habitaciones para un evento corporativo en marzo | esc=true · riesgo PROMISES_CAPACITY |
| R04 | grupo | V | vamos a hacer un matrimonio con 120 invitados, necesitan donde quedarse | intent=GRUPO · esc=true · flags STRATEGIC_GROUP_LEAD · riesgo PROMISES_CAPACITY |
| R05 | grupo | V | somos 30 personas, nos hacen descuento? | intent∈{GRUPO,DESCUENTO} · esc=true · mustNot /te (hacemos\|damos\|doy\|hago) (un )?(descuento\|precio especial)\|claro que si\|descuento del/ · riesgo GRANTS_DISCOUNT |
| T01 | turismo | S | que se puede hacer en zipaquira un domingo? | intent=TURISMO · esc=true · odoo=false · sin memoria checkIn |
| T02 | turismo | S | recomiendan algun restaurante cerca del hotel? | intent∈{TURISMO,UBICACION,INTENCION_NO_ENTENDIDA} · esc=true · odoo=false |
| T03 | turismo | V | a cuanto queda la catedral de sal del hotel? | intent=UBICACION |
| T04 | turismo | S | el salinas es lejos de zipa? | intent∈{TURISMO,UBICACION,INTENCION_NO_ENTENDIDA} · esc=true · odoo=false |
| N01 | ambiguo | V | ok | intent∈{INTENCION_NO_ENTENDIDA,CIERRE,SALUDO} · odoo=false · mustNot /\$\s?\d/ |
| N02 | ambiguo | S | feliz cumple jefe, que lo disfrute | intent=INTENCION_NO_ENTENDIDA · esc=true · odoo=false · riesgo UNKNOWN_AUTONOMOUS |
| N03 | ambiguo | S | el viernes jugamos micro en la cancha del colegio | intent=INTENCION_NO_ENTENDIDA · esc=true · odoo=false · sin memoria checkIn · riesgo UNKNOWN_AUTONOMOUS |
| N04 | ambiguo | S | cuanto me debes del mercado | intent=INTENCION_NO_ENTENDIDA · esc=true · odoo=false · riesgo UNKNOWN_AUTONOMOUS |

## Nota de no-duplicación

Verificado por script contra Playbook T01–T100, V1 (held-out + 3 ciegos), CANONICAL-20 y V2-50: ninguna conversación se repite.
Solo coinciden 6 turnos genéricos sueltos dentro de conversaciones multi-turno nuevas («hola», «buenas», «quiero reservar», «somos 3», «cuánto cuesta?»), inevitables en lenguaje real.
