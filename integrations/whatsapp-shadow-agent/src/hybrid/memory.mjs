/**
 * validateMemoryUpdate(): ningun dato extraido por el LLM entra a la memoria sin pasar por aqui.
 * Impide: contaminar la fecha con un mensaje irrelevante, reemplazar personas por una inferencia dudosa,
 * convertir un comentario casual en reserva, inventar propiedad e inventar monto.
 * Un dato del LLM solo se acepta si esta FUNDAMENTADO en el texto del cliente.
 */
import { STAY_CUE } from '../nlu.mjs';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUM_WORDS = { 1: ['un', 'uno', 'una', 'solo'], 2: ['dos', 'pareja'], 3: ['tres'], 4: ['cuatro'], 5: ['cinco'], 6: ['seis'], 7: ['siete'], 8: ['ocho'], 9: ['nueve'], 10: ['diez'], 11: ['once'], 12: ['doce'], 13: ['trece'], 14: ['catorce'], 15: ['quince'], 20: ['veinte'], 30: ['treinta'], 40: ['cuarenta'], 50: ['cincuenta'], 100: ['cien'] };
const RELATIVE = /\b(hoy|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|semana|puente|fin de semana|finde|proximo|siguiente|esta noche)\b/;
const CHANGE_CUE = /\b(mejor|ahora|en realidad|ya no|resulta|al final|seremos|somos|vamos|quedamos|cambio|cambia)\b/;
const PROPERTY_WORDS = { AS: /\b(atheron|suite)\b/, CA: /\b(casa algarra|algarra)\b/, CN: /\bneusa\b/, AA: /\b(apartamentos?|algarra)\b/, CC: /\bcolonial\b/, LM: /\bmargarita\b/ };
export const STAY_INTENTS = Object.freeze(['CONSULTA_DISPONIBILIDAD', 'CONSULTA_PRECIO', 'RESERVA', 'ANTICIPO', 'CAMBIO_FECHAS', 'GRUPO', 'CHECKIN', 'CHECKOUT', 'LLEGADA_TARDE', 'CHECKIN_TEMPRANO', 'CHECKOUT_TARDE', 'EXTENSION', 'CONFIRMAR_RESERVA_OTA', 'PARQUEADERO', 'MASCOTA']);
/** Evidencia minima de que el texto trata de alojamiento (no basta una fecha ni un numero sueltos). */
export const LODGING_EVIDENCE = /\b(habitacion\w*|cuarto\w*|pieza\w*|alcoba|suite|cupo\w*|disponib\w*|reserv\w*|alojam\w*|hospedaj\w*|hotel\w*|apartament\w*|casa|noche\w*|dormir|quedarnos?|quedarme|quedamos|cama\w*|tarifa\w*|precio\w*|cuesta\w*|cotiz\w*)\b/;
const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const dowOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * @param {{dates?:string[], pax?:number|null, property?:string|null, amount?:number|null}} proposed  solo lo propuesto por el LLM
 * @param {{text:string, intents:string[], llmIntent:string, memory:object, today:string, ambiguities:string[]}} ctx  text ya normalizado
 */
export function validateMemoryUpdate(proposed, ctx) {
  const accepted = {};
  const rejected = [];
  const reject = (field, reason) => rejected.push({ field, reason });
  const { text, intents, llmIntent, memory = {}, today, ambiguities = [] } = ctx;

  if (proposed.amount != null) reject('amount', 'AMOUNT_NOT_ALLOWED'); // jamas se guarda un monto del LLM

  const wants = (proposed.dates?.length ?? 0) > 0 || proposed.pax != null || proposed.property != null;
  if (!wants) return { accepted, rejected };

  const hasSlots = Boolean(memory.guests || memory.checkIn);
  const regexStay = intents.some((i) => STAY_INTENTS.includes(i));
  const llmCasual = ['INTENCION_NO_ENTENDIDA', 'SALUDO', 'CIERRE'].includes(llmIntent);
  const hotelContext = regexStay || (STAY_INTENTS.includes(llmIntent) && LODGING_EVIDENCE.test(text)) || STAY_CUE.test(text) || hasSlots;
  if (!hotelContext || (llmCasual && !regexStay && !hasSlots)) {
    for (const f of ['dates', 'pax', 'property']) if (proposed[f] != null && (f !== 'dates' || proposed.dates.length)) reject(f, 'CASUAL_COMMENT_NOT_A_BOOKING');
    return { accepted, rejected };
  }

  // fechas
  if (proposed.dates?.length) {
    const [ci, co] = proposed.dates;
    const limit = addDays(today, 730);
    const month = MONTHS[Number(ci.slice(5, 7)) - 1];
    const day = String(Number(ci.slice(8, 10)));
    // fundamentacion estricta: el dia de la semana debe coincidir; hoy/manana/pasado manana deben coincidir; "puente" o "proxima semana" solos NO bastan
    const wd = Object.keys(WEEKDAYS).find((w) => new RegExp(`\\b${w}\\b`).test(text));
    const relOk = /\bpasado manana\b/.test(text) ? ci === addDays(today, 2) : /\bmanana\b/.test(text) ? ci === addDays(today, 1) : /\b(hoy|esta noche)\b/.test(text) ? ci === today : false;
    const grounded = relOk || (wd !== undefined && dowOf(ci) === WEEKDAYS[wd] && ci <= addDays(today, 14)) || (text.includes(month) && new RegExp(`\\b${day}\\b`).test(text)) || (new RegExp(`\\b${day}\\b`).test(text) && memory.checkIn?.slice(0, 7) === ci.slice(0, 7));
    if (ambiguities.includes('DATE_UNCLEAR')) reject('dates', 'DATE_UNCLEAR');
    else if (ci < today || ci > limit) reject('dates', 'DATE_OUT_OF_RANGE');
    else if (!grounded) reject('dates', 'DATE_NOT_GROUNDED_IN_TEXT');
    else accepted.dates = co ? [ci, co] : [ci];
  }

  // personas
  if (proposed.pax != null) {
    const n = proposed.pax;
    const grounded = new RegExp(`\\b${n}\\b`).test(text) || (NUM_WORDS[n] ?? []).some((w) => new RegExp(`\\b${w}\\b`).test(text));
    if (ambiguities.includes('PAX_UNCLEAR')) reject('pax', 'PAX_UNCLEAR');
    else if (!grounded) reject('pax', 'PAX_NOT_GROUNDED_IN_TEXT');
    else if (memory.guests != null && memory.guests !== n && !CHANGE_CUE.test(text)) reject('pax', 'PAX_REPLACEMENT_WITHOUT_CHANGE_CUE');
    else accepted.pax = n;
  }

  // propiedad
  if (proposed.property != null) {
    if (ambiguities.includes('PROPERTY_UNCLEAR')) reject('property', 'PROPERTY_UNCLEAR');
    else if (!PROPERTY_WORDS[proposed.property]?.test(text)) reject('property', 'PROPERTY_NOT_NAMED_IN_TEXT');
    else accepted.property = proposed.property;
  }
  return { accepted, rejected };
}
