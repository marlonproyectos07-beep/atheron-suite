/** Textos en espanol colombiano: calidos, breves, sin tono corporativo. */
import { addDays } from './nlu.mjs';

const WORDS = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const fmtCOP = (n) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
export const numWord = (n) => (n >= 1 && n <= 12 ? WORDS[n] : String(n));
export const personas = (n) => (n === 1 ? 'una persona' : `${numWord(n)} personas`);

export function fechaLabel(isoDate, today) {
  if (isoDate === today) return 'hoy';
  if (isoDate === addDays(today, 1)) return 'mañana';
  if (isoDate === addDays(today, 2)) return 'pasado mañana';
  const [, m, d] = isoDate.split('-').map(Number);
  return `el ${d} de ${MONTH_NAMES[m - 1]}`;
}

/** "del 20 al 22 de octubre" cuando se conocen ambas fechas; si no, la etiqueta de la fecha de entrada. */
export function estanciaLabel(checkIn, checkOut, today) {
  if (!checkOut) return fechaLabel(checkIn, today);
  const [, m1, d1] = checkIn.split('-').map(Number);
  const [, m2, d2] = checkOut.split('-').map(Number);
  return m1 === m2 ? `del ${d1} al ${d2} de ${MONTH_NAMES[m2 - 1]}` : `del ${d1} de ${MONTH_NAMES[m1 - 1]} al ${d2} de ${MONTH_NAMES[m2 - 1]}`;
}

export function saludo(nowHourBogota) {
  const franja = nowHourBogota < 12 ? 'buenos días' : nowHourBogota < 19 ? 'buenas tardes' : 'buenas noches';
  return `Hola, ${franja}. Gracias por comunicarte con Hoteles Atero.`;
}

export const TEXTS = Object.freeze({
  botDisclosure: 'Soy el asistente de atención de Hoteles Atero. Si prefieres, puedo pasar la conversación a una persona del equipo.',
  discount: 'Entiendo. Esa solicitud la revisa una persona del equipo comercial, así que le paso tu caso con todo lo que me has contado y te responden por aquí.',
  otaComparison: 'Gracias por contarme. Esa comparación la revisa una persona del equipo comercial; le paso tu caso para que te responda por aquí.',
  payment: 'Gracias por avisarme. Paso tu comprobante a una persona del equipo para que lo valide; la reserva queda confirmada cuando ellos verifiquen el pago.',
  human: 'Claro, le paso la conversación a una persona del equipo para que te escriba por aquí.',
  depositGeneric: 'Para confirmar una reserva directa se abona el 50% del valor total. Si me cuentas fechas y personas, te calculo el valor exacto.',
  cancelWithin: 'Puedes solicitar la cancelación hasta 48 horas antes del check-in. No se devuelve el dinero en efectivo: lo pagado queda como saldo a favor durante 6 meses, para usarlo en nuevas fechas según disponibilidad y tarifa vigente (si hay diferencia de tarifa, se recalcula). Un compañero del equipo te ayuda a gestionarlo.',
  cancelException: 'Entiendo. Como falta menos de 48 horas para tu llegada, este caso lo revisa una persona del equipo; le paso tu solicitud y te responden por aquí.',
  cancelOta: 'Las reservas hechas por Booking o Airbnb se rigen primero por las condiciones de la plataforma, así que cualquier cambio o cancelación hay que gestionarlo por ahí. Si necesitas ayuda, una persona del equipo te orienta.',
  cancelNeedDate: 'Con gusto te ayudo con eso. ¿Para qué fecha era tu llegada?',
  gatewayError: 'Déjame confirmar esa información con el equipo y te respondo por aquí en un momento.',
  audioPending: 'Recibí tu audio, pero por ahora no puedo escucharlo. ¿Me lo escribes por aquí? Si prefieres, una persona del equipo te responde.',
  unknownOpener: '¿Te puedo ayudar con alojamiento? Cuéntame para qué fechas y cuántas personas serían.',
  unknownConservative: 'Gracias por escribir. Déjame pasar tu mensaje a una persona del equipo para atenderte bien.',
  noAvailability: 'Para esas fechas no veo disponibilidad. Si quieres, reviso otras fechas.',
  groupPricing: 'Por el tamaño del grupo puedo solicitar una tarifa especial, pero debo confirmarla con el equipo comercial.',
});
