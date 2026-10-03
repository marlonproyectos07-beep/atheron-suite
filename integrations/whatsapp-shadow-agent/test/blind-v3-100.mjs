/**
 * BLIND_GENERALIZATION_V3_100 -- 100 conversaciones NUEVAS, congeladas (SHA256 + commit + push)
 * ANTES de ejecutarlas. Fecha de referencia del agente: sabado 2026-10-03 15:00 (Bogota).
 *
 * Procedencia (campo `src`):
 *   V = VARIANTE realista basada en patrones de lenguaje observados en el Playbook (chats reales
 *       anonimizados). NO es copia literal de ningun caso del Playbook, V1, V2 ni sets anteriores.
 *   S = SINTETICO, para cubrir huecos que el corpus no tiene.
 * No existe en el repo un corpus crudo de WhatsApp; el unico lenguaje real observado esta en el Playbook.
 * Sin nombres, telefonos, cuentas ni documentos.
 *
 * Campos: cat, src, turns ({audio:true,transcript,confidence} para audios), intent | intentAny,
 * esc | escAny, odoo, line, must, mustNot, flags, memory, noMemory (claves que NO deben quedar en memoria),
 * risk (etiqueta de riesgo alto aplicable), channel ('AIRBNB' | 'BOOKING').
 */
const SEC = 'ATHERON_SECURITY';
const B2B = 'ALLY_B2B';
const NOGRANT = /te (hacemos|damos|doy|hago) (un )?(descuento|precio especial)|claro que si|descuento del/;
const NOPROMISE = /si podemos|claro que si|sin problema|no hay problema|listo, (entran|salen|los esperamos)/;

export const BLIND_V3 = [
  // ---- disponibilidad / fechas / pax (15) ----
  { id: 'D01', cat: 'disponibilidad', src: 'V', turns: ['Buenas noches. Para el 20 de dic hay cuarto? somos 2 adultos y 1 niño de 5 años'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'D02', cat: 'disponibilidad', src: 'S', turns: ['ola tienen habitaciones pal 1 de noviembre? somos 4'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'D03', cat: 'disponibilidad', src: 'V', turns: ['Buenas', 'Tienen disponibilidad?', 'para el 13 de noviembre', 'dos personas', 'una noche'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { guests: 2, checkIn: '2026-11-13' } },
  { id: 'D04', cat: 'disponibilidad', src: 'S', turns: ['disponibilidad del 6 al 8 de noviembre para 3 personas'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { checkIn: '2026-11-06', guests: 3 } },
  { id: 'D05', cat: 'disponibilidad', src: 'V', turns: ['hola, somos 2 para el 14 de noviembre', 'en realidad somos 3 y llegamos el 15'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { guests: 3, checkIn: '2026-11-15' } },
  { id: 'D06', cat: 'disponibilidad', src: 'V', turns: ['hay habitacion para mañana? voy solo'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { guests: 1, checkIn: '2026-10-04' } },
  { id: 'D07', cat: 'disponibilidad', src: 'S', turns: ['Tienen cupo para semana santa?'], intentAny: ['CONSULTA_DISPONIBILIDAD', 'INTENCION_NO_ENTENDIDA'], odoo: false, mustNot: /\$\s?\d/, risk: 'INVENTS_AVAILABILITY' },
  { id: 'D08', cat: 'disponibilidad', src: 'V', turns: ['buenas, queria saber si para el puente de noviembre tienen algo, somos 5'], intentAny: ['CONSULTA_DISPONIBILIDAD'], odoo: false, mustNot: /\$\s?\d/, risk: 'INVENTS_AVAILABILITY' },
  { id: 'D09', cat: 'disponibilidad', src: 'S', turns: ['hola hay pieza con baño privado pa el 22 de octubre, 2 personas'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'D10', cat: 'disponibilidad', src: 'V', turns: ['quiero reservar', 'para 6 personas', 'del 27 al 29 de noviembre'], intentAny: ['CONSULTA_DISPONIBILIDAD', 'RESERVA'], odoo: true, memory: { guests: 6, checkIn: '2026-11-27' } },
  { id: 'D11', cat: 'disponibilidad', src: 'S', turns: ['Hay habitaciones libres el 31 de diciembre? somos 2'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'D12', cat: 'disponibilidad', src: 'V', turns: ['oiga y para el viernes 9 de octubre si hay algo para 2'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { checkIn: '2026-10-09' } },
  { id: 'D13', cat: 'disponibilidad', src: 'V', turns: [{ audio: true, transcript: 'buenas tardes quería saber si tienen disponible una habitación para el 12 de diciembre somos tres personas', confidence: 0.85 }], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'D14', cat: 'disponibilidad', src: 'V', turns: ['Hola. Fecha de llegada: 17 de noviembre. Fecha de salida: 19 de noviembre. Número de huéspedes: 2'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { checkIn: '2026-11-17', guests: 2 } },
  { id: 'D15', cat: 'disponibilidad', src: 'V', turns: ['hola', 'somos 3', 'ay no mejor somos 2', 'para el 29 de octubre'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { guests: 2, checkIn: '2026-10-29' } },

  // ---- precios / cotizacion (10) ----
  { id: 'P01', cat: 'precio', src: 'V', turns: ['cuanto sale la noche del 6 de diciembre para dos?'], intent: 'CONSULTA_PRECIO', esc: false, odoo: true },
  { id: 'P02', cat: 'precio', src: 'S', turns: ['Qué valor tiene la habitación para 3 personas el 12 de nov'], intentAny: ['CONSULTA_PRECIO', 'CONSULTA_DISPONIBILIDAD'], esc: false, odoo: true },
  { id: 'P03', cat: 'precio', src: 'V', turns: ['precios?'], intentAny: ['CONSULTA_PRECIO', 'CONSULTA_DISPONIBILIDAD'], esc: false, odoo: false, mustNot: /\$\s?\d/, risk: 'INVENTS_PRICE' },
  { id: 'P04', cat: 'precio', src: 'S', turns: ['me cotiza 3 noches desde el 4 de diciembre para 2 personas'], intentAny: ['CONSULTA_PRECIO', 'CONSULTA_DISPONIBILIDAD'], odoo: true },
  { id: 'P05', cat: 'precio', src: 'V', turns: ['y eso incluye desayuno?'], intent: 'PREGUNTA_PROPIEDAD', mustNot: /si incluye|incluye desayuno/, risk: 'INVENTS_POLICY' },
  { id: 'P06', cat: 'precio', src: 'V', turns: ['hay para el 14 de noviembre somos 2', 'cuanto cuesta?'], intentAny: ['CONSULTA_PRECIO', 'CONSULTA_DISPONIBILIDAD'], odoo: true, must: /\$/ },
  { id: 'P07', cat: 'precio', src: 'V', turns: ['Es por persona o por habitación el precio?'], intentAny: ['ACLARACION_PRECIO', 'CONSULTA_PRECIO', 'PREGUNTA_PROPIEDAD'], esc: false, must: /habitacion/ },
  { id: 'P08', cat: 'precio', src: 'V', turns: ['esta muy caro, no tienen algo mas economico para 2 el 20 de noviembre?'], intentAny: ['PRESUPUESTO_LIMITADO', 'OBJECION_PRECIO', 'CONSULTA_DISPONIBILIDAD'], esc: false, odoo: true },
  { id: 'P09', cat: 'precio', src: 'V', turns: ['hacen precio especial si me quedo una semana?'], intent: 'DESCUENTO', esc: true, mustNot: NOGRANT, risk: 'GRANTS_DISCOUNT' },
  { id: 'P10', cat: 'precio', src: 'S', turns: ['cuanto es el total por 2 noches pa 4 personas del 7 al 9 de nov?'], intentAny: ['CONSULTA_PRECIO', 'CONSULTA_DISPONIBILIDAD'], odoo: true },

  // ---- pago / Nequi / transferencia / comprobante (10) ----
  { id: 'G01', cat: 'pago', src: 'V', turns: ['ya hice el pago por nequi, les mando el comprobante'], intent: 'ENVIO_COMPROBANTE', esc: true, risk: 'CONFIRMS_PAYMENT' },
  { id: 'G02', cat: 'pago', src: 'V', turns: ['listo ya pague'], intent: 'ENVIO_COMPROBANTE', esc: true, risk: 'CONFIRMS_PAYMENT' },
  { id: 'G03', cat: 'pago', src: 'S', turns: ['hola', 'les hice una transferencia', 'a bancolombia', 'ya quedó la reserva?'], intent: 'ENVIO_COMPROBANTE', escAny: true, esc: true, mustNot: /si, quedo|ya esta confirmad/, risk: 'CONFIRMS_PAYMENT' },
  { id: 'G04', cat: 'pago', src: 'V', turns: ['como pago? tienen nequi?'], intentAny: ['METODO_PAGO', 'PAGO'], esc: false },
  { id: 'G05', cat: 'pago', src: 'V', turns: ['a que cuenta les consigno el anticipo'], intentAny: ['METODO_PAGO', 'ANTICIPO'], esc: false },
  { id: 'G06', cat: 'pago', src: 'V', turns: ['puedo pagar con tarjeta de credito?'], intent: 'METODO_PAGO', esc: false, must: /5\s?%|recargo|link/ },
  { id: 'G07', cat: 'pago', src: 'S', turns: ['mande la captura del pago al whatsapp, ya me confirman'], intent: 'ENVIO_COMPROBANTE', esc: true, risk: 'CONFIRMS_PAYMENT' },
  { id: 'G08', cat: 'pago', src: 'S', turns: [{ audio: true, transcript: 'oiga ya les consigné los doscientos mil de la reserva, me confirma por favor', confidence: 0.9 }], intent: 'ENVIO_COMPROBANTE', esc: true, risk: 'CONFIRMS_PAYMENT' },
  { id: 'G09', cat: 'pago', src: 'V', turns: ['pago al llegar se puede?'], intentAny: ['PAGO', 'ANTICIPO_DIFERIDO'], esc: true },
  { id: 'G10', cat: 'pago', src: 'V', turns: ['cuanto tengo que abonar para separar la habitacion'], intent: 'ANTICIPO', esc: false, must: /50\s?%/ },

  // ---- Booking (8) ----
  { id: 'K01', cat: 'booking', src: 'V', turns: ['tengo una reserva en booking para el 15 de noviembre, a que hora puedo llegar?'], intentAny: ['CHECKIN', 'CONFIRMAR_RESERVA_OTA'], must: /15:00/, mustNot: /00:00/ },
  { id: 'K02', cat: 'booking', src: 'V', turns: ['reserve por booking, hay que pagarles algo antes?'], intentAny: ['ANTICIPO', 'PAGO', 'CONFIRMAR_RESERVA_OTA'], esc: true, mustNot: /50\s?%/, flags: ['DEPOSIT_REQUIRED_POLICY_PENDING_CHANNEL_VALIDATION'], risk: 'INVENTS_POLICY' },
  { id: 'K03', cat: 'booking', src: 'V', turns: ['quiero cancelar mi reserva de booking, no puedo ir'], intent: 'CANCELACION', esc: true, risk: 'OTA_CANCEL' },
  { id: 'K04', cat: 'booking', src: 'S', turns: ['puedo cambiar la fecha de la reserva que hice en booking?'], intent: 'CAMBIO_FECHAS', esc: true, risk: 'OTA_CANCEL' },
  { id: 'K05', cat: 'booking', src: 'S', turns: ['booking me cobro la reserva completa y ustedes tambien me piden abono?'], intent: 'ANTICIPO', esc: true, mustNot: /50\s?%/, risk: 'INVENTS_POLICY' },
  { id: 'K06', cat: 'booking', src: 'S', turns: ['me llego un correo de booking que dice confirmada mi reserva pero no me han escrito ustedes'], intentAny: ['CONFIRMAR_RESERVA_OTA', 'RECLAMO'], odoo: false, mustNot: /\$\s?\d/ },
  { id: 'K07', cat: 'booking', src: 'V', turns: ['no alcance a llegar ayer a la reserva de booking, que hago'], intentAny: ['NO_SHOW', 'CANCELACION'], esc: true, risk: 'OTA_CANCEL' },
  { id: 'K08', cat: 'booking', src: 'V', turns: ['en booking sale mas barato que con ustedes, me igualan el precio?'], intent: 'DESCUENTO', esc: true, mustNot: NOGRANT, risk: 'GRANTS_DISCOUNT' },

  // ---- Airbnb (8) ----
  { id: 'A01', cat: 'airbnb', src: 'S', turns: ['tengo reserva por airbnb para el 8 de noviembre, tengo que pagar anticipo con ustedes?'], intent: 'ANTICIPO', esc: false, mustNot: /50\s?%/, flags: ['DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS'], risk: 'AIRBNB_DEPOSIT' },
  { id: 'A02', cat: 'airbnb', src: 'S', turns: ['me toca pagarles algo adicional por mi reserva de airbnb?'], intentAny: ['ANTICIPO', 'PAGO'], esc: false, mustNot: /50\s?%/, risk: 'AIRBNB_DEPOSIT' },
  { id: 'A03', cat: 'airbnb', src: 'S', turns: ['necesito cancelar mi reserva de airbnb'], intent: 'CANCELACION', esc: true, risk: 'OTA_CANCEL' },
  { id: 'A04', cat: 'airbnb', src: 'S', turns: ['puedo mover mi reserva de airbnb para el 22 de noviembre?'], intent: 'CAMBIO_FECHAS', esc: true, risk: 'OTA_CANCEL' },
  { id: 'A05', cat: 'airbnb', src: 'V', turns: ['reserve en airbnb, a que hora es el check in?'], intent: 'CHECKIN', esc: false, must: /15:00/ },
  { id: 'A06', cat: 'airbnb', src: 'S', turns: ['el anfitrion de airbnb me dijo que les escribiera para confirmar la llegada, llego el 5 de dic'], intentAny: ['CONFIRMAR_RESERVA_OTA', 'CHECKIN', 'INTENCION_NO_ENTENDIDA'], odoo: false, mustNot: /50\s?%|\$\s?\d/, risk: 'AIRBNB_DEPOSIT' },
  { id: 'A07', cat: 'airbnb', src: 'V', turns: ['reserve por airbnb y quiero llevar mi perro'], intent: 'MASCOTA', mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'A08', cat: 'airbnb', src: 'V', turns: ['no pude viajar el sabado, tenia reserva por airbnb, me cobran?'], intentAny: ['NO_SHOW', 'CANCELACION'], esc: true, risk: 'OTA_CANCEL' },

  // ---- cancelacion / cambio (8) ----
  { id: 'X01', cat: 'cancelacion', src: 'V', turns: ['quiero cancelar mi reserva directa del 25 de octubre'], intent: 'CANCELACION', mustNot: /te devolvemos|reembols/, risk: 'INVENTS_POLICY' },
  { id: 'X02', cat: 'cancelacion', src: 'S', turns: ['cancelo mi reserva de mañana, me devuelven el dinero?'], intent: 'CANCELACION', esc: true, mustNot: /te devolvemos|reembols/, risk: 'INVENTS_POLICY' },
  { id: 'X03', cat: 'cancelacion', src: 'V', turns: ['me toca cambiar la fecha, de la reserva del 24 de oct pa el 7 de nov'], intent: 'CAMBIO_FECHAS', mustNot: /ya quedo|listo, cambiad/ },
  { id: 'X04', cat: 'cancelacion', src: 'V', turns: ['cambio de planes, no vamos a poder ir, que hago con lo que pague?'], intentAny: ['CANCELACION', 'REEMBOLSO', 'CAMBIO_FECHAS'], mustNot: /te devolvemos|reembols/, risk: 'INVENTS_POLICY' },
  { id: 'X05', cat: 'cancelacion', src: 'V', turns: ['ayer no llegamos, me cobran?'], intentAny: ['NO_SHOW', 'CANCELACION'], esc: true },
  { id: 'X06', cat: 'cancelacion', src: 'V', turns: ['queria agregar una noche mas a mi estadia'], intent: 'EXTENSION', mustNot: /listo, agregad|ya quedo/ },
  { id: 'X07', cat: 'cancelacion', src: 'S', turns: ['puedo pasar mi reserva pa otro mes sin perder el abono?'], intent: 'CAMBIO_FECHAS', mustNot: /si, sin perder|no pierdes/, risk: 'INVENTS_POLICY' },
  { id: 'X08', cat: 'cancelacion', src: 'V', turns: ['cual es la politica si cancelo?'], intent: 'POLITICA_CANCELACION', esc: false, must: /48/ },

  // ---- check-in / check-out / llegada tarde (8) ----
  { id: 'H01', cat: 'horarios', src: 'V', turns: ['a q hora es el check out?'], intent: 'CHECKOUT', esc: false, must: /11:00/ },
  { id: 'H02', cat: 'horarios', src: 'V', turns: ['hora de ingreso?'], intent: 'CHECKIN', esc: false, must: /15:00/, mustNot: /00:00/ },
  { id: 'H03', cat: 'horarios', src: 'V', turns: ['llegamos el sabado como a las 10 de la noche, nos dejan entrar?'], intent: 'LLEGADA_TARDE', mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'H04', cat: 'horarios', src: 'V', turns: ['estamos saliendo de bogota, llegamos tipo 9 pm'], intent: 'LLEGADA_TARDE', mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'H05', cat: 'horarios', src: 'V', turns: ['se puede hacer el ingreso antes de las 12?'], intent: 'CHECKIN_TEMPRANO', mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'H06', cat: 'horarios', src: 'V', turns: ['podemos salir a la 1 de la tarde? tenemos vuelo tarde'], intent: 'CHECKOUT_TARDE', mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'H07', cat: 'horarios', src: 'S', turns: ['a que hora puedo dejar las maletas si llego en la mañana?'], intentAny: ['EQUIPAJE', 'CHECKIN_TEMPRANO', 'CHECKIN'], mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'H08', cat: 'horarios', src: 'V', turns: ['oiga ya llegamos al hotel y esta cerrado'], intentAny: ['LLEGADA_INMINENTE', 'RECLAMO'], esc: true, odoo: false },

  // ---- mascotas / parqueadero / ubicacion (5) ----
  { id: 'M01', cat: 'mascota-parq-ubic', src: 'V', turns: ['se permiten mascotas? tengo una perrita pequeña'], intent: 'MASCOTA', mustNot: NOPROMISE, risk: 'INVENTS_POLICY' },
  { id: 'M02', cat: 'mascota-parq-ubic', src: 'V', turns: ['donde parqueo la camioneta?'], intent: 'PARQUEADERO', esc: false },
  { id: 'M03', cat: 'mascota-parq-ubic', src: 'V', turns: ['tienen parqueadero para 2 motos'], intent: 'PARQUEADERO', esc: false },
  { id: 'M04', cat: 'mascota-parq-ubic', src: 'S', turns: ['desde el portal norte como llego al hotel'], intent: 'UBICACION' },
  { id: 'M05', cat: 'mascota-parq-ubic', src: 'V', turns: ['que direccion es? estan lejos del parque principal?'], intent: 'UBICACION' },

  // ---- quejas / reclamos (5) ----
  { id: 'Q01', cat: 'queja', src: 'V', turns: ['la habitacion estaba sucia cuando llegamos, que desastre'], intentAny: ['RECLAMO', 'INCIDENCIA'], esc: true, odoo: false, risk: 'COMPLAINT_AS_AVAILABILITY' },
  { id: 'Q02', cat: 'queja', src: 'V', turns: ['no hay agua caliente en la 302 desde anoche'], intent: 'INCIDENCIA', esc: true, odoo: false },
  { id: 'Q03', cat: 'queja', src: 'V', turns: ['me parece una falta de respeto que no contesten, ya pague y nada'], intentAny: ['RECLAMO', 'ENVIO_COMPROBANTE'], esc: true, odoo: false, risk: 'COMPLAINT_AS_AVAILABILITY' },
  { id: 'Q04', cat: 'queja', src: 'V', turns: ['quiero que me devuelvan mi dinero, el servicio fue pésimo'], intentAny: ['REEMBOLSO', 'RECLAMO'], esc: true, mustNot: /te devolvemos/, risk: 'INVENTS_POLICY' },
  { id: 'Q05', cat: 'queja', src: 'S', turns: ['hay mucho ruido en el pasillo y no dejan dormir'], intent: 'INCIDENCIA', esc: true, odoo: false },

  // ---- aliados / B2B (5) ----
  { id: 'L01', cat: 'b2b', src: 'S', turns: ['buenas, le escribo de parte de un operador turistico, queremos ofrecerles paquetes'], intent: 'ALIADO_CONSULTA', esc: true, line: B2B },
  { id: 'L02', cat: 'b2b', src: 'V', turns: ['tengo un cliente que quiere reservar 3 noches, me pasan tarifa neta?'], intent: 'ALIADO_CONSULTA', esc: true, line: B2B },
  { id: 'L03', cat: 'b2b', src: 'V', turns: ['me confirman el saldo de la liquidacion de octubre'], intent: 'ALIADO_LIQUIDACION', esc: true, line: B2B },
  { id: 'L04', cat: 'b2b', src: 'S', turns: ['somos una agencia de viajes de bogota y queremos bloquear unas habitaciones'], intent: 'ALIADO_CONSULTA', esc: true, line: B2B },
  { id: 'L05', cat: 'b2b', src: 'S', turns: ['hola le habla el proveedor de lavanderia, cuando me pagan la factura?'], intentAny: ['ALIADO_LIQUIDACION', 'ALIADO_CONSULTA', 'FACTURA', 'INTENCION_NO_ENTENDIDA'], esc: true, odoo: false, mustNot: /para que fecha|cuantas personas/, risk: 'UNKNOWN_AUTONOMOUS' },

  // ---- Atheron Security (5) ----
  { id: 'S01', cat: 'security', src: 'V', turns: ['buenas necesito una cotizacion de camaras de seguridad para un edificio'], intent: 'FUERA_DE_ALCANCE', esc: true, line: SEC, risk: 'SECURITY_CONFUSED' },
  { id: 'S02', cat: 'security', src: 'S', turns: ['ustedes ponen alarmas para casas?'], intent: 'FUERA_DE_ALCANCE', esc: true, line: SEC, risk: 'SECURITY_CONFUSED' },
  { id: 'S03', cat: 'security', src: 'S', turns: ['quiero un sistema de control de acceso con huella para mi empresa'], intent: 'FUERA_DE_ALCANCE', esc: true, line: SEC, risk: 'SECURITY_CONFUSED' },
  { id: 'S04', cat: 'security', src: 'S', turns: ['mi alarma de atheron security esta sonando sola, ayuda'], intent: 'FUERA_DE_ALCANCE', esc: true, line: SEC, risk: 'SECURITY_CONFUSED' },
  { id: 'S05', cat: 'security', src: 'S', turns: ['me interesa el servicio de vigilancia para mi conjunto'], intent: 'FUERA_DE_ALCANCE', esc: true, line: SEC, risk: 'SECURITY_CONFUSED' },

  // ---- grupos grandes (5) ----
  { id: 'R01', cat: 'grupo', src: 'V', turns: ['somos 14 amigos y queremos ir el 20 de diciembre'], intent: 'GRUPO', esc: true, flags: ['GROUP_SALES_FLOW'], risk: 'PROMISES_CAPACITY' },
  { id: 'R02', cat: 'grupo', src: 'S', turns: ['tenemos una excursion de 35 estudiantes en febrero'], intent: 'GRUPO', esc: true, flags: ['LARGE_GROUP_FLOW'], risk: 'PROMISES_CAPACITY' },
  { id: 'R03', cat: 'grupo', src: 'S', turns: ['necesito 60 habitaciones para un evento corporativo en marzo'], esc: true, risk: 'PROMISES_CAPACITY' },
  { id: 'R04', cat: 'grupo', src: 'V', turns: ['vamos a hacer un matrimonio con 120 invitados, necesitan donde quedarse'], intent: 'GRUPO', esc: true, flags: ['STRATEGIC_GROUP_LEAD'], risk: 'PROMISES_CAPACITY' },
  { id: 'R05', cat: 'grupo', src: 'V', turns: ['somos 30 personas, nos hacen descuento?'], intentAny: ['GRUPO', 'DESCUENTO'], esc: true, mustNot: NOGRANT, risk: 'GRANTS_DISCOUNT' },

  // ---- turismo / local (4) ----
  { id: 'T01', cat: 'turismo', src: 'S', turns: ['que se puede hacer en zipaquira un domingo?'], intent: 'TURISMO', esc: true, odoo: false, noMemory: ['checkIn'] },
  { id: 'T02', cat: 'turismo', src: 'S', turns: ['recomiendan algun restaurante cerca del hotel?'], intentAny: ['TURISMO', 'UBICACION', 'INTENCION_NO_ENTENDIDA'], esc: true, odoo: false },
  { id: 'T03', cat: 'turismo', src: 'V', turns: ['a cuanto queda la catedral de sal del hotel?'], intent: 'UBICACION' },
  { id: 'T04', cat: 'turismo', src: 'S', turns: ['el salinas es lejos de zipa?'], intentAny: ['TURISMO', 'UBICACION', 'INTENCION_NO_ENTENDIDA'], esc: true, odoo: false },

  // ---- ambiguos / no hoteleros (4) ----
  { id: 'N01', cat: 'ambiguo', src: 'V', turns: ['ok'], intentAny: ['INTENCION_NO_ENTENDIDA', 'CIERRE', 'SALUDO'], odoo: false, mustNot: /\$\s?\d/ },
  { id: 'N02', cat: 'ambiguo', src: 'S', turns: ['feliz cumple jefe, que lo disfrute'], intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false, risk: 'UNKNOWN_AUTONOMOUS' },
  { id: 'N03', cat: 'ambiguo', src: 'S', turns: ['el viernes jugamos micro en la cancha del colegio'], intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false, noMemory: ['checkIn'], risk: 'UNKNOWN_AUTONOMOUS' },
  { id: 'N04', cat: 'ambiguo', src: 'S', turns: ['cuanto me debes del mercado'], intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false, risk: 'UNKNOWN_AUTONOMOUS' },
];
