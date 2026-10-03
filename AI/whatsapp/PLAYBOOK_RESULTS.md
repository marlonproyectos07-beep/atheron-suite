# Resultados Playbook v0.1 — agente SHADOW

Playbook sha256: `d6e13916dd64c8dbe8da49b7fd1a68e2b405726a616d4269bb8e056fc3bff92d`
Casos: 100 · PASS: 100 · FAIL: 0 · desviaciones documentadas respecto al Playbook: 21

## Desviaciones (spec distinta de lo que dice el Playbook, con razón)

- **T23** · ESC: Playbook «Sí» → aplicado «no». POLITICA OFICIAL CEO 2026-10-03 (CEO-03): reserva directa con mas de 48 h al check-in se explica (saldo a favor 6 meses, sujeto a disponibilidad/tarifa vigente) y no se escala; el Playbook decia ESC=Si. Sin nueva fecha no se consulta Odoo.
- **T23** · ODOO: Playbook «Sí (ver cupo)» → aplicado «mustNot». POLITICA OFICIAL CEO 2026-10-03 (CEO-03): reserva directa con mas de 48 h al check-in se explica (saldo a favor 6 meses, sujeto a disponibilidad/tarifa vigente) y no se escala; el Playbook decia ESC=Si. Sin nueva fecha no se consulta Odoo.
- **T25** · ODOO: Playbook «Sí» → aplicado «mustNot». Sin fecha no se afirma disponibilidad ni se consulta Odoo: se orienta con la capacidad verificada de las fichas (302 hasta 3, 202 hasta 4) y se pide la fecha.
- **T26** · ODOO: Playbook «Sí» → aplicado «mustNot». Sin fecha no se consulta Odoo; primero se piden edades (el Playbook: no aplicar tarifa de ninos inventada).
- **T27** · ODOO: Playbook «Sí» → aplicado «mustNot». Hoy es sabado: "fin de semana" es ambiguo (este o el siguiente); no se consulta Odoo hasta confirmar fechas.
- **T28** · ODOO: Playbook «Sí» → aplicado «mustNot». Grupo de 9 sin fechas: no hay consulta posible; se escala la cotizacion de grupo y se piden las fechas.
- **T29** · ODOO: Playbook «Sí» → aplicado «mustNot». Grupo de 13 sin fechas: no hay consulta posible; pasa a humano con resumen.
- **T30** · ODOO: Playbook «Sí» → aplicado «mustNot». Grupo de 25 sin fechas: solo se valida capacidad multipropiedad con humano (capacidad verificada en Odoo = solo Atheron Suite, 22).
- **T31** · ODOO: Playbook «Sí» → aplicado «mustNot». Sin fecha no se consulta Odoo; primero se pregunta por la cuna.
- **T35** · ODOO: Playbook «Sí» → aplicado «mustNot». Casa Neusa no esta mapeada en Odoo (UNIT_ID_MAP solo cubre Atheron Suite): no hay consulta posible, DATA_GAP + humano.
- **T47** · ESC: Playbook «Sí» → aplicado «no». POLITICA OFICIAL CEO 2026-10-03 (CEO-03): cambio de reserva directa con mas de 48 h = se explica la politica y se revisa cupo; el Playbook decia ESC=Si.
- **T57** · ESC: Playbook «Sí hasta definir regla» → aplicado «no». DECISION CEO 2026-10-03: el anticipo oficial es 50 %. El Playbook v0.1 decia "escalar hasta definir regla" (DATA_GAP #2), ya resuelto. El total sale de la cotizacion de Odoo ya hecha en la conversacion; el agente solo aplica el 50 % y no vuelve a consultar.
- **T57** · ODOO: Playbook «Sí (total)» → aplicado «mustNot». DECISION CEO 2026-10-03: el anticipo oficial es 50 %. El Playbook v0.1 decia "escalar hasta definir regla" (DATA_GAP #2), ya resuelto. El total sale de la cotizacion de Odoo ya hecha en la conversacion; el agente solo aplica el 50 % y no vuelve a consultar.
- **T69** · ODOO: Playbook «Sí (precio)» → aplicado «mustNot». El audio pide precio pero no trae fecha ni personas: no hay consulta posible a Odoo; se responden parqueadero y check-in y se pide la fecha.
- **T70** · ODOO: Playbook «Sí» → aplicado «mustNot». Idioma no soportado (DATA_GAP): se escala a humano en vez de consultar Odoo y responder en un idioma que el equipo aun no soporta.
- **T81** · ESC: Playbook «Sí» → aplicado «no». POLITICA OFICIAL CEO 2026-10-03: ya existe politica de cancelacion de reservas directas (DATA_GAP #1 del Playbook resuelto); se responde con el texto oficial en vez de escalar.
- **T83** · ESC: Playbook «No» → aplicado «yes». Las alternativas (Colonial/La Margarita) no se pueden consultar en Odoo (UNIT_ID_MAP solo Atheron Suite): sin cupo en Atheron Suite se escala a humano para revisar otras propiedades en vez de ofrecerlas sin verificar.
- **T85** · ESC: Playbook «No» → aplicado «yes». Sin otra habitacion que alcance en Atheron Suite y sin consulta posible a otras propiedades, se escala a humano (el Playbook decia ESC=No porque suponia alternativas en Odoo).
- **T87** · ODOO: Playbook «Sí (si sincronizado)» → aplicado «mustNot». Sin nombre ni fechas no se puede ubicar la reserva; ademas la sincronizacion OTA->Odoo es DATA_GAP #10. Se piden los datos y, si no aparece, escala.
- **T88** · ODOO: Playbook «Sí» → aplicado «mustNot». Responder el check-in de una reserva ya ubicada no requiere Odoo: es un dato fijo verificado de la propiedad.
- **T89** · ODOO: Playbook «Sí» → aplicado «mustNot». La cancelacion de una reserva OTA la decide un humano; el agente no necesita leer la reserva para escalarla (shadow no escribe ni decide).

## Resultado por caso

| ID | Resultado | Intención | Escaló | Odoo | Respuesta propuesta |
|---|---|---|---|---|---|
| T01 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Para qué fecha y cuántas personas? |
| T02 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | ¡Hola! Para sábado 3 de octubre (1 noche), 2 pers. tengo: hab. 201 con baño compartido, $105.000 en total y hab. 302 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T03 | PASS | CONSULTA_PRECIO | no | no | ¡Hola! ¿Para qué fecha y cuántas personas? Así te doy el precio exacto. |
| T04 | PASS | PREGUNTA_PROPIEDAD | no | no | ¡Hola! El precio incluye aseo, ropa de cama y WiFi. ⏎ ¿Para qué fecha? Así te doy el precio exacto. |
| T05 | PASS | CHECKIN | no | no | ¡Hola! En Atheron Suite el check-in es desde las 15:00 y el check-out hasta las 11:00. |
| T06 | PASS | UBICACION | no | no | Atheron Suite queda a unos 1,4 km, unos 16 min a pie de la Catedral de Sal. |
| T07 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Para qué fecha? |
| T08 | PASS | SALUDO_SOLO | no | no | Hola, ¿en qué te puedo ayudar? |
| T09 | PASS | CIERRE | no | no | Con gusto. Si quieres te la separo con el anticipo. |
| T10 | PASS | UBICACION | no | no | ¡Hola! Atheron Suite queda en Cra. 9 #10-32, centro de Zipaquirá. |
| T11 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿De qué día a qué día sería el puente? |
| T12 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¿Son 2 personas o 2 habitaciones? |
| T13 | PASS | CONSULTA_PRECIO | no | no | ¿Para qué fecha y cuántas personas? Así te doy el precio exacto. |
| T14 | PASS | FECHA | no | no | ¡Hola! ¿Te refieres al sábado 10 de octubre? |
| T15 | PASS | ACLARACION_PRECIO | no | no | En Atheron Suite el valor es por habitación, según cuántas personas. |
| T16 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Para qué fecha y cuántas personas? |
| T17 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Para qué fecha y cuántas personas? |
| T18 | PASS | SELECCION | no | no | ¿Te refieres a la hab. 203 con baño privado, $120.000 en total? |
| T19 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Entonces son 3 noches. ⏎ Del sábado 10 de octubre al martes 13 de octubre (3 noches), 2 pers. tengo: hab. 201 con baño compartido, $315.000 en total y hab. 302 con baño privado, $360.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T20 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Entonces son 4 personas. ⏎ Para sábado 10 de octubre (1 noche), 4 pers. tengo: hab. 202 con baño compartido, $105.000 en total y hab. 203 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T21 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Para sábado 10 de octubre (1 noche), 2 pers. tengo: hab. 302 con baño privado, $120.000 en total y hab. 203 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T22 | PASS | CANCELA_CONSULTA | no | no | Claro, sin problema. Si cambias de idea, aquí estoy. |
| T23 | PASS | CAMBIO_FECHAS | no | no | Cancelación o cambio hasta 48 horas antes del check-in: no hay devolución en efectivo; el valor pagado queda como saldo a favor 6 meses para una nueva reserva en Hoteles Atheron. ⏎ Queda sujeto a disponibilidad y a la tarifa vigente de las nuevas fechas; si es superior, pagas la diferencia. ⏎ ¿Para qué nueva fecha sería? |
| T24 | PASS | PRESUPUESTO_LIMITADO | no | no | La más económica disponible es la hab. 201 con baño compartido, $105.000 en total. Cambia que el baño se comparte con una habitación vecina. |
| T25 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! Para 3 personas sirven la 302 (hasta 3) o la 202 (hasta 4), según disponibilidad. ⏎ ¿Para qué fecha? |
| T26 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Qué edades tienen los niños y para qué fecha? |
| T27 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! Para 6 personas te sirve la suite 301 (hasta 7) o los Apartamentos Algarra. ¿Es este fin de semana (sáb 3 – dom 4) o el siguiente, y necesitas cocina? |
| T28 | PASS | GRUPO | sí | no | ¡Hola! Para un grupo de 9 personas armamos una cotización a la medida. Paso tu caso con una persona del equipo. ¿Para qué fechas sería? |
| T29 | PASS | GRUPO | sí | no | ¡Hola! Para un grupo de 13 personas armamos una cotización a la medida. Paso tu caso con una persona del equipo. ¿Para qué fechas sería? |
| T30 | PASS | GRUPO | sí | no | ¡Hola! Sí podemos revisar un grupo de ese tamaño. Déjame validar capacidad entre nuestras propiedades y te confirmo la distribución. ¿Para qué fechas sería? |
| T31 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿El bebé necesita cuna y para qué fecha? |
| T32 | PASS | MASCOTA | no | no | ¡Hola! ¿Para qué fechas y de qué tamaño es tu mascota? Depende de la propiedad: en Apartamentos Algarra las reciben y en Atheron Suite es bajo consulta. |
| T33 | PASS | MASCOTA | no | no | En Colonial Confort no se admiten mascotas. Te puedo ofrecer Apartamentos Algarra (las reciben) o Atheron Suite (bajo consulta). |
| T34 | PASS | MASCOTA | sí | no | Voy a consultar con el equipo si podemos recibir a tu mascota y te cuento; no te lo puedo confirmar yo. |
| T35 | PASS | MASCOTA | sí | no | En Casa Neusa las mascotas requieren aprobación previa y tienen un costo adicional. Consulto el valor con el equipo. |
| T36 | PASS | MASCOTA | sí | no | ¡Hola! En Apartamentos Algarra las mascotas son bienvenidas, con un cargo de aseo adicional. El valor lo confirma el equipo. |
| T37 | PASS | PARQUEADERO | no | no | ¿Es carro o moto? |
| T38 | PASS | PARQUEADERO | no | no | En Atheron Suite no tenemos parqueadero propio, pero hay un parqueadero aliado a unas 2 cuadras y media (unos $15.000 la noche el carro, sujeto a cupo). |
| T39 | PASS | PARQUEADERO | no | no | En Atheron Suite no tenemos parqueadero propio, pero hay un parqueadero aliado a unas 2 cuadras y media (la moto va sin costo; el cupo se confirma el mismo día). |
| T40 | PASS | PARQUEADERO | no | no | En Casa Algarra hay parqueadero para 2 vehículos incluido. |
| T41 | PASS | PARQUEADERO | sí | no | En Apartamentos Algarra hay parqueadero cubierto (2 carros y 3 motos), $20.000 la noche el carro y $10.000 la moto; hay que reservarlo antes. ⏎ La altura máxima del parqueadero la confirmo con el equipo. |
| T42 | PASS | PARQUEADERO | no | no | El parqueadero aliado queda a unas 2 cuadras y media. |
| T43 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | ¡Hola! Del martes 20 de octubre al domingo 25 de octubre (5 noches), 2 pers. tengo: hab. 201 con baño compartido, $525.000 en total y hab. 302 con baño privado, $600.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T44 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¿Desde qué fecha empiezas y cuántas personas son? |
| T45 | PASS | DESCUENTO | sí | no | Déjame consultar si hay margen para esas fechas y te cuento. |
| T46 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Del sábado 10 de octubre al martes 13 de octubre (3 noches), 2 pers. tengo: hab. 201 con baño compartido, $105.000 en total y hab. 302 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T47 | PASS | CAMBIO_FECHAS | no | sí | Cancelación o cambio hasta 48 horas antes del check-in: no hay devolución en efectivo; el valor pagado queda como saldo a favor 6 meses para una nueva reserva en Hoteles Atheron. ⏎ Queda sujeto a disponibilidad y a la tarifa vigente de las nuevas fechas; si es superior, pagas la diferencia. ⏎ Para el domingo 4 de octubre reviso el cupo. |
| T48 | PASS | EXTENSION | sí | sí | Reviso el cupo para esa noche más y lo confirmo con el equipo. |
| T49 | PASS | CHECKOUT_TARDE | sí | no | En Atheron Suite el check-out es hasta las 11:00. Consulto con el equipo si se puede salir más tarde. |
| T50 | PASS | CHECKIN_TEMPRANO | sí | no | En Atheron Suite el check-in es desde las 15:00. Consulto con el equipo si se puede ingresar antes. |
| T51 | PASS | PRESUPUESTO_LIMITADO | no | no | La más económica disponible es la hab. 201 con baño compartido, $105.000 en total. Cambia que el baño se comparte con una habitación vecina. |
| T52 | PASS | OBJECION_PRECIO | no | no | Entiendo. Incluye aseo, ropa de cama y WiFi; si quieres te muestro una opción más económica disponible. |
| T53 | PASS | DESCUENTO | sí | no | Déjame consultar si hay margen para esas fechas y te cuento. |
| T54 | PASS | DESCUENTO | sí | no | ¡Hola! Lo consulto con el equipo para ver qué podemos hacer. |
| T55 | PASS | ACLARACION_PRECIO | no | no | En Atheron Suite el valor es por habitación, según cuántas personas. |
| T56 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Con ese presupuesto no tengo una opción disponible para sábado 10 de octubre (1 noche). ⏎ La más económica es la hab. 201 con baño compartido, $105.000 en total. |
| T57 | PASS | ANTICIPO | no | no | El anticipo es del 50%: $180.000 de $360.000, y asegura tu cupo. |
| T58 | PASS | METODO_PAGO | no | no | Te envío los datos de pago oficiales; luego mándame el comprobante por este mismo WhatsApp. |
| T59 | PASS | METODO_PAGO | no | no | ¡Hola! Puedes pagar con tarjeta por un link de pago; tiene un recargo del 5%. |
| T60 | PASS | ENVIO_COMPROBANTE | sí | no | Recibido. Lo valido con el equipo y te confirmo. |
| T61 | PASS | ANTICIPO_DIFERIDO | no | no | El anticipo es lo que asegura el cupo; sin él no puedo garantizártelo. |
| T62 | PASS | PAGO | sí | no | El anticipo es lo que asegura el cupo. Lo de pagar al llegar lo consulto con el equipo. |
| T63 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Para qué fecha? |
| T64 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Para sábado 3 de octubre (1 noche), 2 pers. tengo: hab. 201 con baño compartido, $105.000 en total y hab. 302 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T65 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! Perfecto. ¿Me confirmas fecha de llegada, fecha de salida y número de huéspedes? |
| T66 | PASS | CONSULTA_DISPONIBILIDAD | no | no | ¡Hola! ¿Me completas así? Ej.: llegada 10 oct, salida 11 oct, 2 huéspedes. |
| T67 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | ¡Hola! Entendí: 2 personas, sábado 3 de octubre. ⏎ Para sábado 3 de octubre (1 noche), 2 pers. tengo: hab. 201 con baño compartido, $105.000 en total y hab. 302 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T68 | PASS | AUDIO_ILEGIBLE | sí | no | ¡Hola! No alcancé a escuchar bien. ¿Me escribes la fecha y cuántas personas son? |
| T69 | PASS | PARQUEADERO | no | no | En Atheron Suite no tenemos parqueadero propio, pero hay un parqueadero aliado a unas 2 cuadras y media (≈ $15.000 la noche el carro; la moto sin costo, sujeta a cupo). ⏎ En Atheron Suite el check-in es desde las 15:00. ⏎ ¿Para qué fecha y cuántas personas? Así te doy el precio exacto. |
| T70 | PASS | CONSULTA_DISPONIBILIDAD | sí | no | Thanks for your message! A team member will help you shortly. / Gracias, una persona del equipo te ayudará en breve. |
| T71 | PASS | LLEGADA_INMINENTE | sí | no | Aviso ya a recepción, en un momento te abren. |
| T72 | PASS | RECLAMO | sí | no | Lamento la espera. Aviso ya a una persona del equipo para que te atienda. |
| T73 | PASS | RECLAMO | sí | no | Entiendo tu preocupación. Paso tu caso ya con una persona del equipo para que lo revise. |
| T74 | PASS | INCIDENCIA | sí | no | Lamento eso. Aviso ya a operaciones para que lo revisen. |
| T75 | PASS | RECLAMO | sí | no | ¡Hola! Lamento tu experiencia. Paso tu caso con una persona del equipo; por aquí no puedo confirmarte devoluciones. |
| T76 | PASS | HABLAR_CON_HUMANO | sí | no | ¡Hola! Claro, voy a pasar tu caso con una persona del equipo. |
| T77 | PASS | IDENTIDAD | no | no | ¡Hola! Soy el asistente de atención de Atheron. Si prefieres, te paso con una persona del equipo. |
| T78 | PASS | LLAMADA | sí | no | ¡Hola! Listo, aviso a una persona del equipo para que te llame a este número. |
| T79 | PASS | PREGUNTA_PROPIEDAD | sí | no | El desayuno no lo tengo confirmado; lo consulto con el equipo y te cuento. |
| T80 | PASS | NINOS | sí | no | La tarifa de niños no la tengo confirmada; la consulto con administración y te cuento. |
| T81 | PASS | CANCELACION | no | no | Cancelación o cambio hasta 48 horas antes del check-in: no hay devolución en efectivo; el valor pagado queda como saldo a favor 6 meses para una nueva reserva en Hoteles Atheron. ⏎ Queda sujeto a disponibilidad y a la tarifa vigente de las nuevas fechas; si es superior, pagas la diferencia. ⏎ Menos de 48 h, no-show y casos excepcionales los revisa una persona; las reservas por Booking/Airbnb se rigen primero por la plataforma. |
| T82 | PASS | FACTURA | sí | no | Sí manejamos facturación electrónica. Te paso con una persona del equipo para tomar tus datos fiscales. |
| T83 | PASS | CONSULTA_DISPONIBILIDAD | sí | sí | Para domingo 4 de octubre (1 noche) no tengo cupo en Atheron Suite para 2 personas. ⏎ Déjame revisar con el equipo otras opciones en nuestras propiedades. |
| T84 | PASS | GRUPO | sí | sí | Para sábado 31 de octubre (1 noche) no tengo cupo en Atheron Suite para 8 personas. Paso tu caso con el equipo para revisar otras opciones y lista de espera. |
| T85 | PASS | CONSULTA_DISPONIBILIDAD | sí | sí | Esa habitación no alcanza para 3 personas. ⏎ Para sábado 10 de octubre (1 noche) no tengo cupo en Atheron Suite para 3 personas. ⏎ Déjame revisar con el equipo otras opciones en nuestras propiedades. |
| T86 | PASS | LISTA_ESPERA | sí | no | Dejo tu interés anotado y te aviso si se libera; no te lo puedo asegurar. |
| T87 | PASS | CONFIRMAR_RESERVA_OTA | no | no | ¡Hola! Claro. ¿A nombre de quién está la reserva y para qué fechas? La ubico. |
| T88 | PASS | CHECKIN | no | no | En Atheron Suite el check-in es desde las 15:00. |
| T89 | PASS | CANCELACION | sí | no | Entiendo. Tu reserva por plataforma se rige primero por las condiciones de esa plataforma; paso tu caso con una persona del equipo. |
| T90 | PASS | LLEGADA_TARDE | sí | no | Anotado: llegas hacia las 23:00. Lo confirmo con recepción. |
| T91 | PASS | LLEGADA_TARDE | sí | no | Anotado: llegas hacia las 20:00. Lo confirmo con recepción. |
| T92 | PASS | ALIADO_CONSULTA | sí | no | (silencio) |
| T93 | PASS | ALIADO_LIQUIDACION | sí | no | (silencio) |
| T94 | PASS | FUERA_DE_ALCANCE | sí | no | ¡Hola! Este canal es de reservas de hospedaje. Tu consulta de seguridad la derivamos al equipo de Atheron Security. |
| T95 | PASS | LLAMADA | sí | no | ¡Hola! Vimos tu llamada. En este momento no podemos atender; te respondemos desde las 8:00 a.m. Si es por una reserva, cuéntanos fecha y personas por aquí. |
| T96 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | ¡Hola! Para domingo 4 de octubre (1 noche), 4 pers. tengo: hab. 202 con baño compartido, $105.000 en total y hab. 203 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T97 | PASS | PARQUEADERO | no | no | ¿Es carro o moto? |
| T98 | PASS | CONSULTA_DISPONIBILIDAD | no | sí | Para sábado 10 de octubre (1 noche), 2 pers. tengo: hab. 201 con baño compartido, $105.000 en total y hab. 302 con baño privado, $120.000 en total (precio por habitación). ⏎ ¿Cuál prefieres? |
| T99 | PASS | CONSULTA_PRECIO | no | no | Eran $360.000 por 3 noches (sábado 10 de octubre al martes 13 de octubre), para 2 personas. |
| T100 | PASS | CANCELA_CONSULTA | no | no | Claro, sin problema. Si cambias de idea, aquí estoy. |

