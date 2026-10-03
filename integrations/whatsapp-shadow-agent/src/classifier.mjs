/**
 * Clasificacion de remitente/conversacion, ANTES de responder.
 * Orden: registro de contactos > seguridad > aliado > proveedor > spam >
 * huesped con reserva > huesped nuevo > (sticky | UNKNOWN).
 */
import { normalize } from './nlu.mjs';

export const CLASSES = Object.freeze([
  'GUEST_LEAD', 'GUEST_RESERVED', 'ALLY_B2B', 'ATHERON_SECURITY', 'SUPPLIER', 'STAFF', 'SPAM_OTHER', 'UNKNOWN',
]);

const SECURITY = /\b(camaras?|alarmas?|sensor(?:es)?|dvr|nvr|cctv|sirena|monitoreo|atheron security|se activo la alarma|grabaciones?)\b/;
const LODGING = /\b(habitacion\w*|reserv\w*|noches?|hospedaje|alojamiento|disponib\w*|huesped\w*|hotel|check ?in|tarifa|precio)\b/;
const ALLY = /\b(aliad[oa]s?|mi cliente|mis clientes|cliente mio|clientes mios|mi huesped|mis huespedes|para un cliente|para unos clientes|agencia|operador turistico|tour operador|comision|tarifa neta|tarifa aliado|convenio|sobrecupo|desborde|me sobra|colega|referir|pasarte (?:un|unos) (?:cliente|pasajero)s?)\b/;
const SUPPLIER = /\b(proveedor|factura electronica|cuenta de cobro|le ofrezco|insumos|lavanderia|le vendo|entrega de (?:mercancia|pedido)|pedido para el hotel|catalogo de productos)\b/;
const SPAM = /(https?:\/\/|\bgana dinero\b|\bganar dinero\b|\bprestamo\b|\binversion\b|\bcriptomonedas?\b|\bbitcoin\b|\bcasino\b|\bapuestas\b|\bseguidores\b)/;
const RESERVED = /\b(mi reserva|ya tengo (?:una )?reserva|reserve|tengo reservado|a nombre de|codigo de reserva|confirmacion de reserva|ya llegamos|estamos en el hotel|estoy en el hotel|ya pague|ya pagamos)\b|\b(cancel\w*|anular|reprogram\w*|cambiar (?:la |mi )?fechas?|cambio de fechas?|comprobante)\b|\bllego\b/;
const LEAD = /\b(habitacion\w*|disponib\w*|hospedaje|alojamiento|hospedar\w*|quedarnos|reservar|cuanto (?:cuesta|vale|sale)|precio|tarifa|descuento|rebaja|abon\w*|anticipo|booking|airbnb|noche|noches|somos|personas|pax)\b/;

/**
 * @param {string} text texto combinado del turno
 * @param {{prior?: string, registry?: {role?: string, hasReservation?: boolean}}} opts
 */
export function classify(text, { prior = null, registry = null } = {}) {
  const t = normalize(text);
  if (registry?.role && CLASSES.includes(registry.role)) return { classification: registry.role, reason: 'REGISTRY' };

  const hasLodging = LODGING.test(t);
  if (SECURITY.test(t)) {
    // "tienen camaras en el parqueadero?" de un huesped no es un aviso del sistema de seguridad.
    return hasLodging ? { classification: 'UNKNOWN', reason: 'SECURITY_WORD_WITH_LODGING' } : { classification: 'ATHERON_SECURITY', reason: 'SECURITY_KEYWORDS' };
  }
  if (ALLY.test(t)) return { classification: 'ALLY_B2B', reason: 'ALLY_KEYWORDS' };
  if (SUPPLIER.test(t)) return { classification: 'SUPPLIER', reason: 'SUPPLIER_KEYWORDS' };
  if (SPAM.test(t) && !hasLodging) return { classification: 'SPAM_OTHER', reason: 'SPAM_KEYWORDS' };
  if (registry?.hasReservation || RESERVED.test(t)) return { classification: 'GUEST_RESERVED', reason: registry?.hasReservation ? 'REGISTRY_RESERVATION' : 'RESERVED_KEYWORDS' };
  if (LEAD.test(t)) return { classification: 'GUEST_LEAD', reason: 'LODGING_INTENT' };
  if (prior && prior !== 'UNKNOWN') return { classification: prior, reason: 'STICKY' };
  return { classification: 'UNKNOWN', reason: 'NO_SIGNAL' };
}

export const GUEST_CLASSES = Object.freeze(['GUEST_LEAD', 'GUEST_RESERVED']);
