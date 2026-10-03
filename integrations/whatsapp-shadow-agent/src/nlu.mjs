/**
 * NLU ligero en espanol colombiano: entidades e intenciones por reglas.
 * Determinista y sin red. Todo el texto se normaliza (minusculas, sin tildes).
 */

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const MONTH_RE = Object.keys(MONTHS).join('|');
const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

const UNITS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
};
const WORD = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|');
const NUMP = `(?:\\d{1,4}|(?:${WORD})(?:\\s+(?:y\\s+)?(?:${WORD}))*)`;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNumber(phrase) {
  const s = String(phrase).trim();
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  for (const tok of s.split(/\s+/)) {
    if (tok === 'y') continue;
    if (!(tok in UNITS)) return null;
    total += UNITS[tok];
  }
  return total;
}

// ---------------------------------------------------------------- fechas

const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Fecha de hoy en Colombia (UTC-5, sin horario de verano) como YYYY-MM-DD. */
export function bogotaToday(now) {
  const t = new Date(now.getTime() - 5 * 3600 * 1000);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
function weekdayOf(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}
function resolveDayMonth(day, month, today) {
  const year = Number(today.slice(0, 4));
  const candidate = iso(year, month, day);
  return candidate < today ? iso(year + 1, month, day) : candidate;
}

export function extractDates(t, today) {
  const out = {};
  const range = t.match(new RegExp(`(\\d{1,2})(?:\\s+de\\s+(${MONTH_RE}))?\\s+(?:al|hasta el|hasta|a)\\s+(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MONTH_RE})`));
  if (range) {
    const m2 = MONTHS[range[4]];
    const m1 = range[2] ? MONTHS[range[2]] : m2;
    out.fecha_in = resolveDayMonth(Number(range[1]), m1, today);
    out.fecha_out = resolveDayMonth(Number(range[3]), m2, out.fecha_in);
  } else {
    const singles = [...t.matchAll(new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTH_RE})`, 'g'))];
    if (singles[0]) out.fecha_in = resolveDayMonth(Number(singles[0][1]), MONTHS[singles[0][2]], today);
    if (singles[1]) out.fecha_out = resolveDayMonth(Number(singles[1][1]), MONTHS[singles[1][2]], out.fecha_in ?? today);
    if (!singles.length) {
      const nums = [...t.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)];
      if (nums[0]) out.fecha_in = resolveDayMonth(Number(nums[0][1]), Number(nums[0][2]), today);
      if (nums[1]) out.fecha_out = resolveDayMonth(Number(nums[1][1]), Number(nums[1][2]), out.fecha_in ?? today);
    }
  }
  if (!out.fecha_in) {
    let m;
    if (/\bpasado manana\b/.test(t)) out.fecha_in = addDays(today, 2);
    else if (/\bmanana\b/.test(t) && !/\b(en|por|de|esta) la manana\b/.test(t)) out.fecha_in = addDays(today, 1);
    else if (/\b(hoy|esta noche)\b/.test(t)) out.fecha_in = today;
    else if ((m = t.match(new RegExp(`\\b(?:dentro de|en)\\s+(${NUMP})\\s+(dias?|semanas?)`)))) {
      const n = parseNumber(m[1]);
      if (n !== null) out.fecha_in = addDays(today, /semana/.test(m[2]) ? n * 7 : n);
    } else if ((m = t.match(new RegExp(`\\b(?:el|este|proximo)\\s+(${Object.keys(WEEKDAYS).join('|')})\\b`)))) {
      const delta = ((WEEKDAYS[m[1]] - weekdayOf(today) + 7) % 7) || 7;
      out.fecha_in = addDays(today, delta);
    }
  }
  const nights = t.match(new RegExp(`(${NUMP})\\s+noches?`));
  if (nights) {
    const n = parseNumber(nights[1]);
    if (n !== null && n > 0) out.noches = n;
  } else if (/\buna noche\b|\b1 noche\b/.test(t)) out.noches = 1;
  return out;
}

// ---------------------------------------------------------------- personas

export function extractGuests(t) {
  const out = {};
  const totals = [...t.matchAll(new RegExp(`\\bsomos\\s+(${NUMP})(?!\\s+(?:adultos?|ninos?|ninas?))`, 'g'))];
  if (totals.length) out.total_personas = parseNumber(totals[totals.length - 1][1]);
  const people = t.match(new RegExp(`\\b(${NUMP})\\s+(?:personas?|pax|huespedes?)\\b`));
  if (people && out.total_personas == null) out.total_personas = parseNumber(people[1]);
  const para = t.match(new RegExp(`\\bpara\\s+(${NUMP})\\s+(?:personas?|pax|adultos?|huespedes?)\\b`));
  if (para && out.total_personas == null) out.total_personas = parseNumber(para[1]);
  const adults = t.match(new RegExp(`\\b(${NUMP})\\s+adultos?\\b`));
  if (adults) out.adultos = parseNumber(adults[1]);
  const kids = t.match(new RegExp(`\\b(${NUMP})\\s+(?:ninos?|ninas?|menores|peques?|bebes?)\\b`));
  if (kids) out.ninos = parseNumber(kids[1]);
  const ages = t.match(/(?:ninos?|ninas?|menores|hijos?|bebes?)\s+de\s+((?:\d{1,2}\s*(?:,|y)?\s*)+)\s*anos?/);
  if (ages) out.edades_ninos = [...ages[1].matchAll(/\d{1,2}/g)].map((x) => Number(x[0]));
  if (out.total_personas == null) {
    if (/\b(voy solo|voy sola|solo yo|una sola persona|viajo solo|viajo sola)\b/.test(t)) out.total_personas = 1;
    else if (/\b(somos pareja|mi (?:esposa|esposo|pareja|novia|novio) y yo)\b/.test(t)) out.total_personas = 2;
    else if (out.adultos != null) out.total_personas = out.adultos + (out.ninos ?? 0);
  }
  return out;
}

// ---------------------------------------------------------------- otras entidades

export function extractMisc(t, catalog) {
  const out = {};
  if (/\b(bano|banio) privado\b/.test(t)) out.bano_preferencia = 'privado';
  else if (/\b(bano|banio) compartido\b/.test(t)) out.bano_preferencia = 'compartido';
  if (/\b(carro|camioneta|vehiculo|parqueadero|parquear|moto)\b/.test(t)) out.vehiculo = true;
  if (/\b(perro|perros|mascota|mascotas|gato|gatos)\b/.test(t)) out.mascota = true;
  const budget = t.match(/presupuesto (?:de|es de|maximo de)?\s*\$?\s*(\d[\d.,]*)(?:\s*(mil|k|millones?))?/);
  if (budget) {
    let v = Number(budget[1].replace(/[.,]/g, ''));
    if (budget[2] === 'mil' || budget[2] === 'k') v *= 1000;
    if (/millon/.test(budget[2] ?? '')) v *= 1000000;
    out.presupuesto = v;
  }
  const name = t.match(/\b(?:me llamo|mi nombre es|habla|soy)\s+([a-z]{3,}(?:\s[a-z]{3,})?)\b/);
  if (name && !/^(de la|del|el|la|un|una)\b/.test(name[1])) out.nombre = name[1];
  if (/\bbooking\b/.test(t)) out.canal = 'booking';
  else if (/\bairbnb\b/.test(t)) out.canal = 'airbnb';
  if (/\b(hello|hi there|how much|available|room|reservation|nights?|thank you)\b/.test(t)) out.idioma = 'en';
  if (catalog?.properties) {
    for (const p of catalog.properties) {
      const names = [p.name, ...(p.aliases ?? [])].map(normalize);
      if (names.some((n) => n && t.includes(n))) { out.propiedad = p.id; break; }
    }
  }
  return out;
}

export function extractEntities(text, { today, catalog } = {}) {
  const t = normalize(text);
  return { ...extractDates(t, today), ...extractGuests(t), ...extractMisc(t, catalog) };
}

// ---------------------------------------------------------------- intenciones

const INTENT_RULES = [
  ['DISCOUNT', /\b(descuento|rebaja|rebajar|rebajita|mejor precio|precio especial|tarifa especial|mas barato|mas economico|hacerme un precio|me hace un precio|ultimo precio|precio final|negociar|bajar(?:me)? el precio|promocion|me lo deja en)\b/],
  ['OTA_PRICE_COMPARISON', /\b(booking|airbnb|despegar|expedia|trivago)\b.*\b(barato|menos|economic|sale|cuesta|igual|iguala|igualar|precio|tarifa|vale)\b|\b(barato|menos|economic|igual|precio|tarifa)\b.*\b(booking|airbnb|despegar|expedia|trivago)\b/],
  ['DEPOSIT', /\b(abon\w*|anticipo|adelanto|separar|apartar|deposito|cuanto (?:debo|tengo que|hay que|toca) (?:pagar|dar|consignar|abonar)|como pago|50 ?%)\b/],
  ['PRICE', /\b(precio|tarifa|cuanto (?:cuesta|vale|sale|cobran|es)|valor|costo|cotiza\w*)\b/],
  ['AVAILABILITY', /\b(disponib\w*|habitacion\w*|cuarto\w*|hay (?:cupo|espacio)|tienen (?:cupo|espacio|habitacion)|alojamiento|hospedaje|hospedar\w*|quedarnos|reservar|reserva)\b|\bsomos\b/],
  ['CANCEL', /\b(cancel\w*|anular|ya no (?:puedo|podemos|vamos|voy) (?:a )?(?:ir|viajar|llegar)|no (?:podremos|podre) (?:ir|viajar))\b/],
  ['CHANGE_DATES', /\b(cambiar (?:la |las |mi )?fechas?|cambio de fechas?|reprogram\w*|mover (?:la |mi )?reserva|aplazar|pasar (?:la|mi) reserva)\b/],
  ['PAYMENT_CLAIM', /\b(ya pague|ya pagamos|hice el (?:pago|abono|deposito|giro)|ya consigne|ya transferi|ya abone|te envie el (?:comprobante|pago|soporte)|adjunto (?:el )?comprobante|comprobante|pago realizado|soporte de pago)\b/],
  ['BOT_QUESTION', /\b(eres|es|sos) (?:un |una )?(?:bot|robot|ia|inteligencia artificial|persona real|humano|persona)\b|\bhablo con (?:un |una )?(?:bot|robot|persona|humano|alguien real)\b|\bcon quien hablo\b|\batiende (?:una )?persona\b|\bes automatico\b/],
  ['HUMAN_REQUEST', /\b(hablar con (?:una )?(?:persona|asesor|alguien|humano)|pasame con|asesor|agente humano|quiero hablar con)\b/],
  ['CALL_REQUEST', /\b(llamar\w*|llamada|llamen|me llaman|llamame|marcame)\b/],
  ['THANKS', /\b(gracias|muy amable)\b/],
  ['GREETING', /^(hola|holi|buen(?:os|as) (?:dias|tardes|noches)|buenas|hey|saludos)\b/],
];

export function detectIntents(text) {
  const t = normalize(text);
  const found = INTENT_RULES.filter(([, re]) => re.test(t)).map(([name]) => name);
  // "hay disponibilidad ... precio" etc. se conserva; GREETING solo cuenta si abre el mensaje.
  return found;
}
