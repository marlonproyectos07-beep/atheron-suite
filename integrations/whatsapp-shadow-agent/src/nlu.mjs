/**
 * Entendimiento de texto en espanol colombiano, determinista (sin LLM, sin
 * red). Extrae entidades (fechas, personas, propiedad, vehiculo, mascota...)
 * y marca intenciones con el vocabulario del Playbook v0.1.
 */

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿¡]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const NUM_WORDS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100 };
const NUM = '(\\d{1,4}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|cien)';
const toNum = (t) => (/^\d+$/.test(t) ? Number(t) : NUM_WORDS[t] ?? null);

const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MONTH_RE = Object.keys(MONTHS).join('|');
const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const WEEKDAY_RE = Object.keys(WEEKDAYS).join('|');
export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const ymd = (d) => d.toISOString().slice(0, 10);
export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export function fmtDate(iso, { weekday = true } = {}) {
  const d = new Date(`${iso}T00:00:00Z`);
  const base = `${d.getUTCDate()} de ${MONTH_NAMES[d.getUTCMonth()]}`;
  return weekday ? `${WEEKDAY_NAMES[d.getUTCDay()]} ${base}` : base;
}

function resolveDayMonth(day, month, today) {
  const year = Number(today.slice(0, 4));
  let iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso < today) iso = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return iso;
}

/** Fechas, noches y ambiguedades. `today` = ISO de HOY. */
export function extractDates(n, today) {
  const out = { checkIn: null, checkOut: null, nights: null, tentative: false, ambiguous: null, deferral: false, sameDay: false, relative: null };

  // "te pago manana", "pago al llegar": no es una fecha de estancia
  if (/\b(te )?(pago|pagar|consigno|mando|envio|transfiero) (el )?(abono |anticipo )?manana\b/.test(n) || /\bpago manana\b/.test(n)) out.deferral = true;

  const range = n.match(new RegExp(`del (\\d{1,2}) al (\\d{1,2}) de (${MONTH_RE})`));
  if (range) {
    out.checkIn = resolveDayMonth(Number(range[1]), MONTHS[range[3]], today);
    out.checkOut = resolveDayMonth(Number(range[2]), MONTHS[range[3]], today);
    out.nights = Math.round((new Date(`${out.checkOut}T00:00:00Z`) - new Date(`${out.checkIn}T00:00:00Z`)) / 86400000);
    return out;
  }
  const single = n.match(new RegExp(`(\\d{1,2}) de (${MONTH_RE})`));
  if (single) {
    out.checkIn = resolveDayMonth(Number(single[1]), MONTHS[single[2]], today);
    out.relative = 'explicit';
  }

  const wd = n.match(new RegExp(`(?:\\b(este|el|para el|para este|proximo|el proximo)\\s+)?\\b(${WEEKDAY_RE})\\b(\\s+(siguiente|proximo))?(?:\\s+(\\d{1,2})\\b(?! de))?`));
  if (!out.checkIn && wd) {
    const target = WEEKDAYS[wd[2]];
    if (wd[5]) {
      // "sabado 10": dia del mes explicito
      const day = Number(wd[5]);
      const m = Number(today.slice(5, 7));
      let iso = `${today.slice(0, 4)}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (iso < today) iso = addDays(iso, 0);
      out.checkIn = iso;
    } else {
      let delta = (target - dow(today) + 7) % 7;
      const sameWeekday = delta === 0;
      if (delta === 0) delta = 7;
      out.checkIn = addDays(today, delta);
      out.tentative = sameWeekday; // solo es ambiguo si hoy ya es ese dia de la semana
      out.next_week_marker = Boolean(wd[4]);
    }
    out.relative = 'weekday';
    out.weekday = wd[2];
  }

  if (!out.checkIn) {
    if (/\b(hoy|esta noche|ahora mismo|para hoy|esta misma noche)\b/.test(n)) {
      out.checkIn = today;
      out.sameDay = true;
      out.relative = 'hoy';
    } else if (!out.deferral && /\bpasado manana\b/.test(n)) {
      out.checkIn = addDays(today, 2);
      out.relative = 'pasado_manana';
    } else if (!out.deferral && /\bmanana\b/.test(n)) {
      out.checkIn = addDays(today, 1);
      out.relative = 'manana';
    }
  }

  const nights = n.match(new RegExp(`${NUM} noches?`));
  if (nights) out.nights = toNum(nights[1]);
  if (/\buna semana\b|\b7 dias\b/.test(n) && !nights) out.nights = 7;
  if (/\bfin de semana\b|\bfinde\b/.test(n)) out.ambiguous = 'FIN_DE_SEMANA';
  if (/\bel puente\b|\bpuente\b|\bfestivo\b/.test(n) && !out.checkIn) out.ambiguous = 'PUENTE';

  if (out.checkIn && out.nights) out.checkOut = addDays(out.checkIn, out.nights);
  return out;
}

/** Personas: total, adultos, ninos, bebes, o conteo ambiguo ("para 2"). */
export function extractPersons(n) {
  const out = { total: null, adults: null, children: null, infants: null, ambiguous_count: null, rooms: null };
  const adults = n.match(new RegExp(`${NUM} adult[oa]s?`));
  const kids = n.match(new RegExp(`${NUM} (ninos?|ninas?|menores|chicos)`));
  const baby = n.match(new RegExp(`${NUM} bebes?`));
  if (adults) out.adults = toNum(adults[1]);
  if (kids) out.children = toNum(kids[1]);
  if (baby) out.infants = toNum(baby[1]);

  const somos = [...n.matchAll(new RegExp(`\\b(?:somos|quedamos|seremos) ${NUM}\\b(?! grupo| equipo| familia)`, 'g'))];
  const grupo = n.match(new RegExp(`\\b(?:grupo|equipo|familia|delegacion|cuadrilla) de ${NUM}\\b`));
  if (somos.length) out.total = toNum(somos.at(-1)[1]);
  else if (grupo) out.total = toNum(grupo[1]);
  else {
    const pers = n.match(new RegExp(`\\b${NUM} (personas?|huespedes?|amigos|amigas|pasajeros|invitados|colegas|empleados|adult[oa]s?)\\b`));
    const paraPers = n.match(new RegExp(`\\bpara ${NUM} (personas?|huespedes?|adult[oa]s?|amigos)\\b`)) ?? n.match(new RegExp(`\\bpara ${NUM}(?= (?:esta noche|hoy|manana|este |el |la noche))`));
    if (paraPers) out.total = toNum(paraPers[1]);
    else if (pers) out.total = toNum(pers[1]);
  }
  if (out.total == null && /\bpareja\b/.test(n)) out.total = 2;
  if (out.total == null && /\b(una persona|1 persona|solo yo|para uno|para 1)\b/.test(n)) out.total = 1;
  if (out.total == null && out.adults != null) out.total = out.adults + (out.children ?? 0);

  const rooms = n.match(new RegExp(`${NUM} habitaciones?`));
  if (rooms) out.rooms = toNum(rooms[1]);

  if (out.total == null && out.rooms == null) {
    const bare = n.match(new RegExp(`^(?:y )?(?:para )?${NUM}$|\\bpara ${NUM}\\s*$`));
    if (bare) out.ambiguous_count = toNum(bare[1] ?? bare[2]);
  }
  return out;
}

export function extractProperty(n) {
  if (/casa colonial centro/.test(n)) return { key: null, not_bookable: 'Casa Colonial Centro' };
  if (/apartamentos?( en)? algarra|algarra apartamentos?|apartamentos? algarra/.test(n)) return { key: 'AA' };
  if (/casa algarra/.test(n)) return { key: 'CA' };
  if (/\balgarra\b/.test(n)) return { key: null, ambiguous: 'ALGARRA' };
  if (/casa neusa|cabana neusa|\bneusa\b/.test(n)) return { key: 'CN' };
  if (/colonial( confort)?/.test(n)) return { key: 'CC' };
  if (/margarita/.test(n)) return { key: 'LM' };
  if (/atheron suite|hotel atheron|\bla suite\b/.test(n)) return { key: 'AS' };
  return { key: null };
}

export function extractMisc(n) {
  const budget = n.match(/(?:solo tengo|tengo solo|presupuesto(?: de)?|hasta|maximo)\s*\$?\s*(\d{2,3})(?:\.?000| mil)/);
  const vehicle = /\bmoto\b/.test(n) ? 'moto' : /\b(carro|carros|camioneta|vehiculo|vehiculos|automovil)\b/.test(n) ? 'carro' : null;
  const vehicles = n.match(new RegExp(`${NUM} (carros|motos|vehiculos|camionetas)`));
  return {
    budget: budget ? Number(budget[1]) * 1000 : null,
    bath: /\bprivado\b/.test(n) ? 'privado' : /\bcompartido\b/.test(n) ? 'compartido' : null,
    vehicle,
    vehicles_count: vehicles ? toNum(vehicles[1]) : null,
    pet: /\b(perro|perros|perrito|mascota|mascotas|gato|gatos)\b/.test(n),
    kids: /\b(nino|ninos|nina|ninas|menores|bebe|bebes|hijos)\b/.test(n),
    ota: /\b(booking|airbnb|plataforma)\b/.test(n),
    lateTime: parseArrivalTime(n),
  };
}

function parseArrivalTime(n) {
  const m = n.match(/(?:llego|llegamos|llegaria|llegando)[^.]*?(?:a las|despues de las|pasadas las)\s*(\d{1,2})(?::(\d{2}))?\s*(?:de la (noche|tarde|manana)|(am|pm))?/);
  if (!m) return null;
  let h = Number(m[1]);
  const pm = m[3] === 'noche' || m[3] === 'tarde' || m[4] === 'pm';
  if (pm && h < 12) h += 12;
  if (!m[3] && !m[4] && h <= 11 && /despues de las|pasadas las/.test(m[0])) h += 12; // "despues de las 8" = 20:00
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

const STOP = new Set('a al amigos adulto adultos adultas el la las los un una unos unas y o de del en con por para es son somos seremos estamos hay este esta estos proximo siguiente que si no ya me mi tu su nos se lo le hotel habitacion habitaciones persona personas noche noches dia dias hoy manana pasado semana mes fecha desde hasta entre sobre'.split(' '));

/**
 * Palabras con contenido que NO explican ni las fechas, ni los numeros, ni los
 * conectores. Sirve de medida de confianza: un mensaje sin intencion y con
 * varias palabras sin explicar NO se interpreta (se pasa a un humano).
 */
export function residualWords(n) {
  const month = new Set(Object.keys(MONTHS));
  const wd = new Set(Object.keys(WEEKDAYS));
  return n
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w) && !month.has(w) && !wd.has(w) && !STOP.has(w) && !NUM_WORDS[w]);
}

/** Senales de que el mensaje trata de ALOJARSE (sin ellas, fechas/numeros sueltos no bastan para interpretar). */
export const STAY_CUE = /\b(quedo|quedar\w*|quedamos|reserv\w*|viaj\w*|lleg\w*|hosped\w*|aloj\w*|habitacion\w*|cuarto\w*|noche\w*|vacacion\w*|paseo|(quiero|queremos|quisiera|quisieramos|vamos|voy|necesito|necesitamos|pensamos|planeamos) (a )?(ir|venir|visitar|pasar|estar))\b/;

/** Idioma muy grueso: solo para decidir si el equipo puede responder. */
export function detectLanguage(text) {
  const n = norm(text);
  if (/\b(do you|have a|room for|for two|how much|available|hello|please|we are|i need|i would)\b/.test(n)) return 'en';
  if (/\b(avez|chambre|bonjour|pour deux|disponible\?)\b/.test(n)) return 'fr';
  return 'es';
}

const RULES = [
  ['SALUDO', /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ola)\b/],
  ['CONSULTA_DISPONIBILIDAD', /\b(solo queda (una|1)|la que queda|esa alcanza|alcanza para)\b/],
  ['CONSULTA_DISPONIBILIDAD', /\b(disponib|hay (habitacion|cupo|algo|espacio)|tienen (algo|habitacion|cupo|para)|tiene (habitacion|algo)|habitacion(es)? (para|disponible|libre)|cuartos? (libre|disponible|para)|queda(n)? (algo|habitacion)|cupos?|hay para(?! (hacer|visitar|ver|conocer|comer|pasear))|puedo ir ahora|quiero consultar|alcanza)/],
  ['CONSULTA_PRECIO', /\b(precio|cuanto (cuesta|vale|es|era|sale|seria)|valor|tarifa|cuesta|cobran)\b/],
  ['PAREJA', /\bparejas?\b/],
  ['PARQUEADERO', /\b(tengo|llevo|llegamos con|voy con|vamos con|traigo|traemos)\b[^.?]*\b(carro|carros|moto|motos|camioneta|vehiculo|vehiculos)\b/],
  ['PARQUEADERO', /\b(parqueadero|parquear|parqueo|garaje|estacionamiento|donde dejo (el|mi) (carro|moto))\b/],
  ['UBICACION', /\b(queda(n)? en el centro|esta(n)? en el centro|en que (zona|barrio|parte)|donde (queda|estan|esta)|direccion|ubicacion|ubicad|cerca (de|del)|que tan lejos|queda(n)? lejos|como llego|a cuantos? (minutos|cuadras))\b/],
  ['CHECKIN', /\b(check ?in|hora de (entrada|llegada|ingreso)|a que horas? (puedo |podemos |se puede |podria |podriamos )?(hacer (el )?)?(llego|llegar|ingreso|ingresar|entro|entrar|check)|a que hora llego|desde que hora (puedo )?(entrar|ingresar|llegar))\b/],
  ['CHECKOUT', /\b(check ?out|hora de salida|hora (es )?(de |la )?salida|a que hora es la salida|a que hora se sale|a que horas? (toca |hay que |debo |debemos |tengo que |tenemos que |puedo |podemos |se debe )?(salir|salgo|desocupar|dejar la habitacion|entregar|entregarla))/],
  ['MASCOTA', /\b(perro|perros|perrito|mascota|mascotas|gato|gatos)\b/],
  ['NINOS', /\b(nino|ninos|nina|ninas|menores|bebe|bebes|hijos|pagan los)\b/],
  ['ANTICIPO', /\b(abono|abonar\w*|anticipo|adelanto|separar|apartar|pierdo (la reserva|el cupo)|se cae la reserva|guardarme la (reserva|habitacion))\b/],
  ['METODO_PAGO', /\b(tarjeta|nequi|daviplata|pse|transferencia|qr|llave|a que cuenta|cuenta (de )?(ahorros|bancaria)|consign\w*|datos de pago|como (pago|puedo pagar)|medio de pago)\b/],
  ['CAMBIO_FECHAS', /\b(cambiar (mi |la )?(reserva|fecha)|cambio de (fecha|planes)|otra fecha|mover (la )?reserva|reprogramar|lo mismo pero|mejor (\d+|una|dos|tres|cuatro|cinco) noches?|mejor otra fecha)\b/],
  ['EXTENSION', /\b(una noche mas|quedarme mas|extender|prolongar|otra noche|noche adicional)\b/],
  ['CANCELACION', /\b(cancel|no pude llegar|no voy a poder|no podre ir|anular)/],
  ['NO_SHOW', /\b(no (llegue|llegamos|pudimos llegar)|no show)\b/],
  ['REEMBOLSO', /\b(reembolso|devolucion|devuelvan|devuelvame|mi plata|mi dinero|quiero mi plata)\b/],
  ['DESCUENTO', /\b(me sale mas barat\w*|sale mas barat\w*|(booking|airbnb|expedia|otra pagina|otro hotel|la competencia)[^.?]{0,40}(mas barat|menos|mas economic|mejor precio)|descuento|rebaja|rebajar|precio especial|tarifa especial|mejor tarifa|tarifa corporativa|promocion|mejor precio|mas barato en|igualar|hacerme un precio|me hace(s)? (un )?precio|booking me (lo )?ofrece|lo ofrece mas barato|descuento por)\b/],
  ['OBJECION_PRECIO', /\b(muy caro|esta caro|es mucho|muy costoso|carisimo|demasiado)\b/],
  ['PRESUPUESTO_LIMITADO', /\b(mas economic\w*|mas barat\w*|economica|solo tengo|tengo solo|presupuesto|la mas barata)\b/],
  ['RECLAMO', /\b(me cobraron (de mas|doble|dos veces)|cobro (de mas|indebido|doble)|cobraron de mas|no me (ha )?llegado (la )?confirmacion|no he recibido (la )?confirmacion|no me confirman|estafa|pesimo|inaceptable|queja|reclamo|molest\w*|furios\w*|mal servicio|nadie abre|nadie (contesta|responde|atiende)|no me (han|ha) (respondido|contestado|atendido)|no (nos )?(han|ha) (respondido|contestado)|no me llego (la )?(reserva|confirmacion|respuesta)|esperando|me siento enga\w*|indignad\w*|horrible)\b/],
  ['INCIDENCIA', /\b(no sale (agua )?caliente|no hay (agua|luz|internet|wifi|senal|gas)|no (funciona|prende|enciende|sirve|calienta|abre|cierra|baja|carga)|se (dano|rompio|fue la luz)|esta (danad[oa]|rot[oa]|sucio|sucia)|sin (luz|agua|wifi|internet)|gotera|sucio|ruido)\b/],
  ['HABLAR_CON_HUMANO', /\b(hablar con (una |un )?(persona|alguien|humano|asesor|asesora|agente|encargad[oa]|administrador|recepcion)|quiero un asesor|un asesor|pasame con|comunicame con|comunicarme con (una |un )?(persona|asesor|agente)|una persona real|atienda una persona)\b/],
  ['IDENTIDAD', /\b(eres (un )?(robot|bot|maquina|ia)|es (un )?(robot|bot)|hablo con (un )?(robot|bot)|eres humano|eres una persona)\b/],
  ['LLAMADA_PEDIDA', /\b(llamame|me llaman|llamarme|llamen|pueden llamar|quiero una llamada)\b/],
  ['LLEGADA_INMINENTE', /\b((estoy|estamos|ya estoy|ya estamos) (en la puerta|en la entrada|aqui afuera|afuera|llegando)|ya llegue|ya estoy (afuera|aqui|en la puerta)|estoy afuera|estamos afuera|estoy en la puerta|ya estamos aqui)\b/],
  ['LLEGADA_TARDE', /\b(llego (tarde|despues|a las \d)|llegamos (tarde|despues)|llego a las|estoy en carretera|llegare (tarde|a las|despues)|llegaremos (tarde|a las|despues)|llego sobre las|llegaria tarde|llego en la noche|(voy|vamos) a llegar (tarde|despues|a las|sobre las|pasadas)|llegamos a las)\b/],
  ['CHECKIN_TEMPRANO', /\b(entro mas temprano|ingreso (mas )?temprano|llegar temprano|entrar (mas )?temprano|early check)\b/],
  ['CHECKOUT_TARDE', /\b(salgo mas tarde|salida (mas )?tarde|salir mas tarde|late check|check ?out (mas )?tarde)\b/],
  ['ENVIO_COMPROBANTE', /\b((les |te |lo )?(consigne|consignamos|transferi|transferimos|deposite|depositamos)\b|(les |te |lo )?(envie|mande|hice|realice|hicimos|enviamos|mandamos) (el |la |un )?(pago|abono|anticipo|transferencia|consignacion|deposito)|ya me confirman|ya (les|te|lo) pague|pague (por|con|via|a traves)|ya pague|ya consigne|ya transferi|comprobante|soporte (de|del) pago|aqui (esta|va) el soporte|el soporte|adjunto el pago|te envie el pago|ya (hice|realice|envie|mande) (el |la )?(pago|transferencia|consignacion|abono|anticipo)|pago realizado|transferencia realizada)\b/],
  ['FACTURA', /\b(factura|facturacion|nit|rut|datos fiscales)\b/],
  ['EQUIPAJE', /\b(maletas?|equipaje|guardar (las )?maletas)\b/],
  ['LISTA_ESPERA', /\b(avisame si se libera|avisame si hay|si se libera|lista de espera|si alguien cancela)\b/],
  ['CIERRE', /^(gracias|muchas gracias|ok gracias|listo gracias|vale gracias|perfecto gracias|mil gracias)\b/],
  ['CANCELA_CONSULTA', /\b(pensandolo mejor,? no|ya no (voy|vamos|quiero)|no gracias|ya reserve en otro|ya reservamos|mejor no|dejemoslo asi)\b/],
  ['RESERVA', /\b(quiero reservar|quisiera reservar|reservar|hacer una reserva|reserva para|me lo(s)? (separa|aparta|reserva))\b/],
  ['CONFIRMAR_RESERVA_OTA', /\b(hice (una )?reserva (por|en|a traves de) (booking|airbnb)|mi reserva (de|por) (booking|airbnb)|reserva (en|por) (booking|airbnb))\b/],
  ['ACLARACION_PRECIO', /\b(por persona|por habitacion|cada persona|el precio es por)\b/],
  ['PREGUNTA_PROPIEDAD', /\b(desayuno|wifi|wi-fi|cocina|aire acondicionado|ascensor|piso bajo|primer piso|camas?|tipo de cama|agua caliente|netflix|politica|incluye|que incluye)\b/],
  ['POLITICA_CANCELACION', /\bpolitica de cancelacion\b|\bcondiciones de cancelacion\b|\bsi cancelo\b/],
  ['ALIADO_CONSULTA', /\b(consulta de disponibilidad para un cliente|para un cliente mio|tengo un cliente|mi cliente|soy del hotel|somos del hotel|soy de la agencia|somos una agencia|les mando (un|una|a un)|te mando (un|una)|mando un (huesped|cliente)|reserva para un cliente|cliente mio)\b/],
  ['ALIADO_LIQUIDACION', /\b(cuadremos cuentas|liquidacion|comision(es)? de|cuadrar cuentas|cuentas de (septiembre|octubre|agosto))\b/],
  ['TURISMO', /\b(que hay para (hacer|visitar|ver|conocer)|que (hacer|visitar|conocer) en|que lugares|que (sitios|atracciones)|planes (en|para)|atracciones|recomiendan (visitar|conocer))\b/],
  ['FUERA_DE_ALCANCE', /\b(camaras? (de )?(seguridad|vigilancia)|vigilancia|venden camaras|sensores? de|camara ip|camaras? de seguridad|alarmas?|camaras?|cctv|dvr|seguridad electronica|camara ip)\b/],
  ['SELECCION', /\b(esa de|la de|me quedo con (la|esa)|esa (me )?(sirve|gusta)|quiero esa|dame esa|la primera|la segunda)\b/],
  ['PREFERENCIA', /\b(mejor con|prefiero|baño privado|bano privado|bano compartido|con bano)\b/],
];

/** Intenciones (multi-etiqueta) detectadas en `n` (texto normalizado). */
export function detectIntents(n) {
  const found = [];
  for (const [intent, re] of RULES) if (re.test(n)) found.push(intent);
  return found;
}
