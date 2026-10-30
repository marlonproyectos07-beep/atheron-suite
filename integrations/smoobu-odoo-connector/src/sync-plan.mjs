import { createHash } from 'node:crypto';
import { ConnectorError } from './errors.mjs';
import { UNITS, unitForSmoobuApartment, conflictsWith } from './unit-map.mjs';

/**
 * Diseno ejecutable de la sincronizacion bidireccional. TODO es puro: calcula
 * planes, no escribe en Odoo ni en Smoobu. Aplicar un plan requiere una fase
 * posterior con autorizacion expresa.
 */

const DAY = 86400000;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Identificador de estancia estable: lo comparten todos los turnos de la reserva. */
export const stayId = (smoobuReservationId) => `SMOOBU-${Number(smoobuReservationId)}`;

/** Una noche = un turno (estructura historica de Odoo). Salida exclusiva. */
export function nightlySlots({ arrival, departure }) {
  if (!isDate(arrival) || !isDate(departure) || departure <= arrival) throw new ConnectorError('INVALID_STAY_WINDOW');
  const out = [];
  for (let t = Date.parse(`${arrival}T00:00:00Z`); t < Date.parse(`${departure}T00:00:00Z`); t += DAY) {
    const night = new Date(t).toISOString().slice(0, 10);
    out.push({ night, start: `${night}`, end: new Date(t + DAY).toISOString().slice(0, 10) });
  }
  return out;
}

/** Huella del contenido relevante: distingue reenvio identico de modificacion real. */
export const fingerprint = (b) => createHash('sha256')
  .update(JSON.stringify([b.id, b['apartment']?.id, b.arrival, b.departure, b.type ?? '', b.status ?? '']))
  .digest('hex');

/** Marca de origen para romper bucles: lo que escribimos nosotros no regresa como evento. */
export const ORIGIN_TAG = 'x_atheron_origin';

/**
 * Smoobu -> Odoo. `ledger` es un Map<reservationId, {fingerprint, slotKeys}> (persistente en la fase real).
 * Devuelve {action, ...}; acciones: IGNORE_UNMAPPED | IGNORE_DUPLICATE | IGNORE_ECHO | CREATE | UPDATE | CANCEL.
 */
export function planInbound(booking, { ledger, ownOrigin = new Set() }) {
  const unit = unitForSmoobuApartment(booking?.apartment?.id);
  if (!unit) return { action: 'IGNORE_UNMAPPED', reason: 'apartamento fuera del mapa' };
  if (!Number.isInteger(Number(booking.id))) throw new ConnectorError('INVALID_BOOKING');
  if (ownOrigin.has(Number(booking.id))) return { action: 'IGNORE_ECHO', reason: 'reserva originada en Odoo' };
  const fp = fingerprint(booking);
  const prev = ledger.get(Number(booking.id));
  if (prev?.fingerprint === fp) return { action: 'IGNORE_DUPLICATE' };
  const stay = stayId(booking.id);
  if (booking.type === 'cancellation') {
    return prev ? { action: 'CANCEL', stayId: stay, slotKeys: prev.slotKeys, fingerprint: fp }
      : { action: 'IGNORE_DUPLICATE', reason: 'cancelacion de reserva nunca importada' };
  }
  const slots = nightlySlots({ arrival: booking.arrival, departure: booking.departure })
    .map((s) => ({ ...s, roleId: unit.odooRoleId, key: `${stay}:${unit.unit}:${s.night}` }));
  const keys = new Set(slots.map((s) => s.key));
  const prevKeys = new Set(prev?.slotKeys ?? []);
  return {
    action: prev ? 'UPDATE' : 'CREATE',
    stayId: stay, unit: unit.unit, fingerprint: fp,
    create: slots.filter((s) => !prevKeys.has(s.key)),           // idempotente: clave ya existente no se duplica
    remove: [...prevKeys].filter((k) => !keys.has(k)),
    blocks: conflictsWith(unit.unit),
  };
}

/** Aplica en memoria el resultado de un plan al ledger (la fase real lo hara tras escribir con exito). */
export function commit(ledger, booking, plan) {
  const id = Number(booking.id);
  if (plan.action === 'CREATE' || plan.action === 'UPDATE') {
    const prev = new Set(ledger.get(id)?.slotKeys ?? []);
    plan.remove.forEach((k) => prev.delete(k));
    plan.create.forEach((s) => prev.add(s.key));
    ledger.set(id, { fingerprint: plan.fingerprint, slotKeys: [...prev] });
  } else if (plan.action === 'CANCEL') {
    ledger.set(id, { fingerprint: plan.fingerprint, slotKeys: [] });
  }
}

/** Cuarentena de errores: registro estructurado sin datos de huesped. */
export function errorRecord(bookingId, error, at = new Date().toISOString()) {
  return { bookingId: Number(bookingId) || null, code: error?.code ?? 'UNKNOWN', retryable: Boolean(error?.retryable), at };
}

/**
 * Odoo -> Smoobu. Maquina de estados: la reserva en Odoo NO se confirma hasta
 * que el PMS responde positivo. PENDING_PMS -> CONFIRMED | REJECTED | FAILED_RETRY.
 */
export function planOutbound({ unit, arrival, departure, requestId }) {
  const u = { unit, smoobuApartmentId: requireUnitByName(unit) };
  nightlySlots({ arrival, departure });
  if (!requestId) throw new ConnectorError('REQUEST_ID_REQUIRED'); // clave de idempotencia
  return { state: 'PENDING_PMS', requestId, unit: u.unit, smoobuApartmentId: u.smoobuApartmentId, arrival, departure, blocks: conflictsWith(unit), writesEnabled: false };
}

function requireUnitByName(name) {
  const u = UNITS.find((x) => x.unit === name);
  if (!u) throw new ConnectorError('UNIT_NOT_MAPPED');
  return u.smoobuApartmentId;
}

export function resolveOutbound(request, pmsResponse) {
  if (request.state !== 'PENDING_PMS') throw new ConnectorError('INVALID_TRANSITION');
  if (pmsResponse?.ok === true && Number.isInteger(Number(pmsResponse.reservationId))) {
    return { ...request, state: 'CONFIRMED', smoobuReservationId: Number(pmsResponse.reservationId), originMark: stayId(pmsResponse.reservationId) };
  }
  if (pmsResponse?.retryable) return { ...request, state: 'FAILED_RETRY' };
  return { ...request, state: 'REJECTED' };
}
