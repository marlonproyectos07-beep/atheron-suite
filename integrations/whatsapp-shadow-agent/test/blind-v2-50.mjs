/**
 * BLIND_GENERALIZATION_V2_50 -- 50 mensajes/conversaciones NUEVOS.
 * Escritos y congelados (hash + commit) ANTES de ejecutarlos. Fecha de referencia
 * del agente: sabado 2026-10-03. No se copia ningun caso del Playbook ni de los
 * sets anteriores.
 *
 * Campos:
 *   turns      lista de turnos: texto, o {audio:true, transcript, confidence}
 *   intent     intencion esperada (en el turno final); intentAny = cualquiera de la lista
 *   esc        escalamiento esperado en el turno final (escAny: en cualquier turno)
 *   odoo       se debe (true) / no se debe (false) consultar Odoo en la conversacion
 *   line       linea de negocio esperada
 *   must / mustNot   regex sobre la respuesta final normalizada (sin acentos, minusculas)
 *   flags      banderas que deben aparecer en algun turno
 *   memory     subconjunto esperado de la memoria al final
 *   risk       etiqueta de riesgo alto que aplica si el caso falla de forma insegura
 */
export const BLIND_V2 = [
  { id: 'V01', theme: 'disponibilidad', turns: ['buenas, tienen pieza pa el 14 de nov? somos 2'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'V02', theme: 'disponibilidad/ortografia', turns: ['hola tienen habitasion disponible para el 27 de diciembre somos 5 personas'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'V03', theme: 'fragmentado', turns: ['buenas', 'queria saber de una habitacion', 'para el viernes 16 de octubre', 'somos 3'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, mustNot: /cuantas personas|para que fecha/, memory: { guests: 3, checkIn: '2026-10-16' } },
  { id: 'V04', theme: 'precio', turns: ['q precio tiene la noche pa 2 personas el 7 de noviembre'], intent: 'CONSULTA_PRECIO', esc: false, odoo: true },
  { id: 'V05', theme: 'precio sin datos', turns: ['cuanto vale una noche con ustedes?'], intentAny: ['CONSULTA_PRECIO', 'CONSULTA_DISPONIBILIDAD'], esc: false, odoo: false, mustNot: /\$\s?\d/, risk: 'INVENTS_PRICE' },
  { id: 'V06', theme: 'booking/anticipo', turns: ['hice la reserva x booking para el 24 de octubre, les pagan algo a ustedes antes de llegar?'], intentAny: ['ANTICIPO', 'CONFIRMAR_RESERVA_OTA', 'PAGO'], esc: true, mustNot: /50\s?%/, risk: 'INVENTS_POLICY' },
  { id: 'V07', theme: 'airbnb/anticipo', turns: ['mi reserva es por airbnb, me toca hacer algun abono con ustedes?'], intent: 'ANTICIPO', esc: false, mustNot: /50\s?%/, flags: ['DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS'], risk: 'AIRBNB_DEPOSIT' },
  { id: 'V08', theme: 'directa/anticipo', turns: ['quiero reservar directo con ustedes, cuanto debo adelantar para asegurar'], intent: 'ANTICIPO', esc: false, must: /50\s?%/ },
  { id: 'V09', theme: 'nequi', turns: ['ya les hice el nequi, quedo listo?'], intent: 'ENVIO_COMPROBANTE', esc: true, mustNot: /confirmad|quedo listo|todo listo/, flags: ['PAYMENT_VALIDATION_REQUIRED'], risk: 'CONFIRMS_PAYMENT' },
  { id: 'V10', theme: 'transferencia', turns: ['acabo de transferir el abono a bancolombia'], intent: 'ENVIO_COMPROBANTE', esc: true, mustNot: /confirmad/, risk: 'CONFIRMS_PAYMENT' },
  { id: 'V11', theme: 'comprobante', turns: ['les mando el pantallazo del pago ya'], intent: 'ENVIO_COMPROBANTE', esc: true, mustNot: /confirmad/, risk: 'CONFIRMS_PAYMENT' },
  { id: 'V12', theme: 'cancelacion directa', turns: ['quiero cancelar mi reserva del 30 de octubre, la hice directo con ustedes'], intent: 'CANCELACION', mustNot: /te devolvemos|reembols|devolucion total/, risk: 'INVENTS_POLICY' },
  { id: 'V13', theme: 'cancelacion booking', turns: ['necesito cancelar mi reserva de booking'], intent: 'CANCELACION', esc: true, mustNot: /queda cancelad|cancelamos tu reserva|ya cancele/, risk: 'OTA_CANCEL' },
  { id: 'V14', theme: 'cancelacion airbnb', turns: ['me toca cancelar la reserva que tengo por airbnb, no puedo viajar'], intent: 'CANCELACION', esc: true, mustNot: /queda cancelad|cancelamos tu reserva|ya cancele/, risk: 'OTA_CANCEL' },
  { id: 'V15', theme: 'cancelacion <48h', turns: ['cancelo la reserva de mañana, no alcanzo a llegar'], intent: 'CANCELACION', esc: true, mustNot: /te devolvemos|reembols/, risk: 'INVENTS_POLICY' },
  { id: 'V16', theme: 'no-show', turns: ['ayer no pude llegar al hotel, me cobran la noche?'], intentAny: ['NO_SHOW', 'CANCELACION'], esc: true },
  { id: 'V17', theme: 'cambio de fechas', turns: ['puedo cambiar mi reserva del 10 al 17 de octubre?'], intent: 'CAMBIO_FECHAS', mustNot: /ya quedo cambiad|listo, cambiad/ },
  { id: 'V18', theme: 'cambio de pax', turns: ['hola, somos 2 para el 21 de noviembre', 'mmm mejor somos 4'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { guests: 4, checkIn: '2026-11-21' } },
  { id: 'V19', theme: 'cambio de fecha en conversacion', turns: ['buenas, somos 3 para el 5 de diciembre', 'mejor para el 12 de diciembre'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true, memory: { guests: 3, checkIn: '2026-12-12' } },
  { id: 'V20', theme: 'check-in', turns: ['a que hora puedo hacer el ingreso?'], intent: 'CHECKIN', esc: false, must: /15:00/, mustNot: /00:00/ },
  { id: 'V21', theme: 'check-out', turns: ['hasta q hora tengo para salir el lunes'], intent: 'CHECKOUT', esc: false, must: /11:00/ },
  { id: 'V22', theme: 'llegada tarde', turns: ['llegamos como a las 11 de la noche, hay problema?'], intent: 'LLEGADA_TARDE', mustNot: /no hay problema|sin problema|listo, los esperamos/, risk: 'INVENTS_POLICY' },
  { id: 'V23', theme: 'early check-in', turns: ['podemos entrar a las 9 de la mañana?'], intent: 'CHECKIN_TEMPRANO', mustNot: /si podemos|claro que si|listo, entran/, risk: 'INVENTS_POLICY' },
  { id: 'V24', theme: 'parking', turns: ['tienen donde dejar el carro?'], intent: 'PARQUEADERO', esc: false },
  { id: 'V25', theme: 'mascotas', turns: ['puedo llevar mi labrador?'], intent: 'MASCOTA', mustNot: /si puedes|claro que si|sin problema/, risk: 'INVENTS_POLICY' },
  { id: 'V26', theme: 'ubicacion', turns: ['como hago para llegar desde el terminal de transporte'], intent: 'UBICACION' },
  { id: 'V27', theme: 'turismo', turns: ['q lugares recomiendan para visitar aparte de la catedral?'], intent: 'TURISMO', esc: true, odoo: false },
  { id: 'V28', theme: 'queja aseo', turns: ['el aseo de la habitacion estuvo malisimo, vamos a dejar mala reseña'], intent: 'RECLAMO', esc: true, odoo: false, risk: 'COMPLAINT_AS_AVAILABILITY' },
  { id: 'V29', theme: 'incidencia', turns: ['se fue el agua en la 203'], intent: 'INCIDENCIA', esc: true, odoo: false },
  { id: 'V30', theme: 'cobro', turns: ['me cobraron mas de lo que habiamos quedado'], intent: 'RECLAMO', esc: true, odoo: false, risk: 'COMPLAINT_AS_AVAILABILITY' },
  { id: 'V31', theme: 'sin intencion hotelera', turns: ['jajaja eso fue lo que me dijo mi mama'], intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false },
  { id: 'V32', theme: 'sin intencion con fecha', turns: ['el sabado cumple mi hermano y vamos a hacer asado'], intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false },
  { id: 'V33', theme: 'aliado', turns: ['buenas tardes, soy de una agencia de turismo y queremos trabajar con ustedes como aliados'], intent: 'ALIADO_CONSULTA', esc: true, line: 'ALLY_B2B' },
  { id: 'V34', theme: 'aliado liquidacion', turns: ['les escribo para cuadrar las comisiones del mes pasado'], intent: 'ALIADO_LIQUIDACION', esc: true, line: 'ALLY_B2B' },
  { id: 'V35', theme: 'security', turns: ['necesito cotizar un circuito cerrado de camaras para mi finca'], intent: 'FUERA_DE_ALCANCE', esc: true, line: 'ATHERON_SECURITY', risk: 'SECURITY_CONFUSED' },
  { id: 'V36', theme: 'security', turns: ['ustedes instalan cercas electricas?'], intent: 'FUERA_DE_ALCANCE', esc: true, line: 'ATHERON_SECURITY', risk: 'SECURITY_CONFUSED' },
  { id: 'V37', theme: 'grupo 11+', turns: ['somos 12 personas de una familia para el puente de noviembre'], intent: 'GRUPO', esc: true, flags: ['GROUP_SALES_FLOW'], mustNot: /tenemos cupo|si hay cupo|hay disponibilidad/, risk: 'PROMISES_CAPACITY' },
  { id: 'V38', theme: 'grupo 30+', turns: ['vamos 45 personas de un colegio en excursion el 3 de noviembre'], intent: 'GRUPO', esc: true, flags: ['LARGE_GROUP_FLOW'], mustNot: /tenemos cupo|si hay cupo|hay disponibilidad/, risk: 'PROMISES_CAPACITY' },
  { id: 'V39', theme: 'grupo 100+', turns: ['necesito hospedar a 200 invitados de un matrimonio en enero'], intent: 'GRUPO', esc: true, flags: ['STRATEGIC_GROUP_LEAD'], mustNot: /descuento|caben|tenemos cupo|si hay cupo/, risk: 'PROMISES_CAPACITY' },
  { id: 'V40', theme: 'grupo + descuento', turns: ['somos 40 y queremos precio especial por ser tantos'], intentAny: ['GRUPO', 'DESCUENTO'], esc: true, mustNot: /te hacemos|te damos|claro que si|descuento del/, risk: 'GRANTS_DISCOUNT' },
  { id: 'V41', theme: 'descuento', turns: ['si pago en efectivo me hacen descuento?'], intent: 'DESCUENTO', esc: true, mustNot: /te hacemos|te damos|claro que si|descuento del/, risk: 'GRANTS_DISCOUNT' },
  { id: 'V42', theme: 'audio', turns: [{ audio: true, transcript: 'hola buenas queria saber si tienen una habitacion para dos personas el 18 de octubre', confidence: 0.9 }], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'V43', theme: 'audio ininteligible', turns: [{ audio: true, transcript: 'hola eh... queria... no se', confidence: 0.4 }], esc: true, odoo: false },
  { id: 'V44', theme: 'audio pago', turns: [{ audio: true, transcript: 'ya hice la transferencia del anticipo por nequi', confidence: 0.9 }], intent: 'ENVIO_COMPROBANTE', esc: true, mustNot: /confirmad/, risk: 'CONFIRMS_PAYMENT' },
  { id: 'V45', theme: 'ambiguo', turns: ['para cuando hay?'], intentAny: ['CONSULTA_DISPONIBILIDAD', 'INTENCION_NO_ENTENDIDA'], odoo: false, mustNot: /\$\s?\d/, risk: 'INVENTS_AVAILABILITY' },
  { id: 'V46', theme: 'coloquial', turns: ['parce y si hay cuarto pa mañana pa dos personas'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'V47', theme: 'digitacion', turns: ['qiero resevar pa 4 personas el 8 de nov'], intentAny: ['RESERVA', 'CONSULTA_DISPONIBILIDAD'], esc: false, odoo: true },
  { id: 'V48', theme: 'fragmentado pago', turns: ['hola', 'ya consigne', 'por nequi el anticipo'], intent: 'ENVIO_COMPROBANTE', escAny: true, mustNot: /confirmad/, risk: 'CONFIRMS_PAYMENT' },
  { id: 'V49', theme: 'queja con reserva', turns: ['llevo dos horas esperando que me respondan, tengo reserva para hoy'], intent: 'RECLAMO', esc: true, odoo: false, risk: 'COMPLAINT_AS_AVAILABILITY' },
  { id: 'V50', theme: 'security vs hoteles', turns: ['buenas, soy cliente de atheron security, tengo una falla en la alarma de mi casa'], intent: 'FUERA_DE_ALCANCE', esc: true, line: 'ATHERON_SECURITY', risk: 'SECURITY_CONFUSED' },
];
