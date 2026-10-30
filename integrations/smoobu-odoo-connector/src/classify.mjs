import { unitForSmoobuApartment, isExcludedApartment } from './unit-map.mjs';

/**
 * ATH-DEV-029 — clasificacion de registros de reservas de Smoobu. Pura, sin red, sin datos personales:
 * solo mira id, type, is-blocked-booking, apartment.id, arrival, departure y channel.id.
 *
 * Hechos observados (ATH-DEV-028): `type` toma tres valores ('reservation', 'cancellation', 'modification of booking')
 * y los 14 ids de la ventana son distintos: cada id aparece UNA vez con su tipo mas reciente.
 * HIPOTESIS: 'modification of booking' es una reserva VIGENTE ya modificada; 'is-blocked-booking' marca bloqueos de
 * calendario (no huespedes). Ninguna de las dos esta confirmada por la documentacion oficial (no accesible).
 */
export const KINDS = Object.freeze({ RESERVATION: 'RESERVATION', MODIFICATION: 'MODIFICATION', CANCELLATION: 'CANCELLATION', BLOCK: 'BLOCK', EXCLUDED: 'EXCLUDED', UNMAPPED: 'UNMAPPED', OTHER_TYPE: 'OTHER_TYPE', INVALID: 'INVALID' });
const KNOWN_TYPES = new Set(['reservation', 'cancellation', 'modification of booking']);

export function classifyBooking(b) {
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return { kind: KINDS.INVALID, id: null };
  const apt = Number(b?.apartment?.id);
  const base = { id, type: typeof b?.type === 'string' ? b.type : null, apartmentId: Number.isInteger(apt) ? apt : null, arrival: String(b?.arrival ?? '').slice(0, 10) || null, departure: String(b?.departure ?? '').slice(0, 10) || null };
  const unit = unitForSmoobuApartment(apt);
  if (isExcludedApartment(apt)) return { ...base, kind: KINDS.EXCLUDED, reason: 'CARRERA_19' };
  if (!unit) return { ...base, kind: KINDS.UNMAPPED };
  const withUnit = { ...base, unit: unit.unit, roleId: unit.odooRoleId };
  if (b?.['is-blocked-booking'] === true) return { ...withUnit, kind: KINDS.BLOCK, blockedActive: base.type !== 'cancellation' };
  if (base.type === 'cancellation') return { ...withUnit, kind: KINDS.CANCELLATION };
  if (base.type === 'modification of booking') return { ...withUnit, kind: KINDS.MODIFICATION };
  if (base.type === 'reservation') return { ...withUnit, kind: KINDS.RESERVATION };
  return { ...withUnit, kind: KINDS.OTHER_TYPE };
}

const isGuestStay = (c) => c.kind === KINDS.RESERVATION || c.kind === KINDS.MODIFICATION;

export function classifyAll(bookings) {
  const items = bookings.map(classifyBooking);
  const count = (f) => items.filter(f).length;
  const byKind = {}; for (const c of items) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const byType = {}; for (const c of items) byType[c.type ?? 'null'] = (byType[c.type ?? 'null'] ?? 0) + 1;
  const byUnit = {}; for (const c of items) if (c.unit) byUnit[c.unit] = (byUnit[c.unit] ?? 0) + 1;
  const ids = items.map((c) => c.id).filter((x) => x != null);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  // misma estancia (unidad + llegada + salida) con ids distintos entre estancias de huesped vigentes: posible duplicado
  const sameStay = new Map();
  for (const c of items.filter(isGuestStay)) { const k = `${c.unit}|${c.arrival}|${c.departure}`; sameStay.set(k, [...(sameStay.get(k) ?? []), c.id]); }
  const possibleDuplicateStays = [...sameStay.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ stay: k, ids: v }));
  return {
    items, total: items.length, byKind, byType, byUnit,
    guestStays: count(isGuestStay), blocksActive: count((c) => c.kind === KINDS.BLOCK && c.blockedActive), blocksCancelled: count((c) => c.kind === KINDS.BLOCK && !c.blockedActive),
    cancellations: count((c) => c.kind === KINDS.CANCELLATION), excluded: count((c) => c.kind === KINDS.EXCLUDED), unmapped: count((c) => c.kind === KINDS.UNMAPPED),
    unknownTypes: [...new Set(items.filter((c) => c.type && !KNOWN_TYPES.has(c.type)).map((c) => c.type))],
    duplicateIds: [...new Set(dupIds)], possibleDuplicateStays,
  };
}
