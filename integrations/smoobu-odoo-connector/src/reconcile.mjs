import { stayId, nightlySlots } from './sync-plan.mjs';
import { unitForSmoobuApartment, unitForOdooRole, unitForName, isExcludedApartment, conflictsWith, PHYSICAL_UNITS, UNITS } from './unit-map.mjs';

/**
 * MOTOR DE CONCILIACION Smoobu -> Odoo (SOLO SIMULACION).
 *
 * Compara el estado deseado (reservas Smoobu) con el estado real (planning.slot
 * leidos de Odoo) y devuelve PROPUESTAS. Nada se escribe: toda propuesta nace
 * `PENDING_APPROVAL` con `writesEnabled: false`. Es una funcion pura e
 * idempotente: aplicar las propuestas y volver a conciliar produce cero propuestas.
 *
 * Clave externa de turno: `SMOOBU-<reserva>:<unidad>:<noche>` guardada en
 * `planning.slot.name` (texto, no obligatorio, vacio en los 409 turnos observados).
 *
 * CALIBRADO CON DATOS REALES (ATH-DEV-011, lectura de Odoo del 2026-10-26):
 * los turnos reales van de las 15:00 a las 11:00 del dia siguiente, hora de Bogota
 * (20:00Z -> 16:00Z, 20 h), zona America/Bogota en los 26 recursos. Un turno de
 * una noche mide 20 h; las estancias largas aparecen como un solo turno de 44, 68 h...
 *
 * Reglas 167/169 (base.automation activas, al crear/editar planning.slot): una
 * habitacion ocupada genera un turno ESPEJO en Casa Completa y Casa Completa genera
 * turnos en las cinco habitaciones. Un turno de Casa con la habitacion destino
 * libre es por tanto un espejo, no una reserva de Casa.
 */

const HOUR = 3600000;
const BOGOTA_OFFSET_MS = -5 * HOUR;
export const CHECKIN_HOUR = 15;
export const CHECKOUT_HOUR = 11;
export const KEY_RE = /^SMOOBU-(\d+):([A-Z0-9]+):(\d{4}-\d{2}-\d{2})/;

export const slotKey = (reservationId, unit, night) => `${stayId(reservationId)}:${unit}:${night}`;

/** [inicio, fin) en ms UTC: 15:00 de la noche -> 11:00 del dia siguiente, hora de Bogota (UTC-5, sin DST). */
export function defaultNightWindow(night) {
  const start = Date.parse(`${night}T00:00:00Z`) + CHECKIN_HOUR * HOUR - BOGOTA_OFFSET_MS;
  return [start, start + (24 - CHECKIN_HOUR + CHECKOUT_HOUR) * HOUR];
}

const toMs = (v) => (typeof v === 'number' ? v : Date.parse(String(v).includes('T') ? v : `${String(v).replace(' ', 'T')}Z`));

/** Acepta un registro crudo de planning.slot (JSON-2) o uno ya normalizado. */
export function normalizeSlot(rec, { keyField = 'name' } = {}) {
  const role = Array.isArray(rec.role_id) ? rec.role_id[0] : (rec.role_id ?? rec.roleId);
  const text = rec[keyField] === false || rec[keyField] == null ? '' : String(rec[keyField]);
  const m = KEY_RE.exec(text);
  return {
    id: rec.id,
    roleId: Number(role),
    start: toMs(rec.start_datetime ?? rec.start),
    end: toMs(rec.end_datetime ?? rec.end),
    key: 'key' in rec ? rec.key : (m ? `SMOOBU-${m[1]}:${m[2]}:${m[3]}` : null),
    active: rec.active !== false,
  };
}

const overlapMs = (aS, aE, bS, bE) => Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
const proposal = (op, extra) => ({ op, status: 'PENDING_APPROVAL', writesEnabled: false, ...extra });

export function reconcile({ bookings, slots, nightWindow = defaultNightWindow, minOverlapMinutes = 60, keyField = 'name', roleResources = {} }) {
  const out = { proposals: [], matched: [], conflicts: [], warnings: [], ignored: [] };
  const all = slots.map((s) => normalizeSlot(s, { keyField })).filter((s) => s.active);
  const minOverlap = minOverlapMinutes * 60000;

  // 1) Indice de turnos con clave; duplicados se reportan y NUNCA se borran solos.
  const keyed = new Map();
  for (const s of all) if (s.key) keyed.set(s.key, [...(keyed.get(s.key) ?? []), s]);
  for (const [key, list] of keyed) {
    if (list.length > 1) out.warnings.push({ code: 'DUPLICATE_KEYED_SLOTS', key, slotIds: list.map((x) => x.id) });
  }
  const unkeyed = all.filter((s) => !s.key);

  // 2) Estado deseado a partir de Smoobu.
  const desired = new Map(); // clave -> {booking, unit, night}
  const seenStays = new Set();
  const byUnitNight = new Map(); // unidad|noche -> [reservas] para choques internos de Smoobu
  for (const b of bookings) {
    const id = Number(b?.id);
    if (!Number.isInteger(id)) { out.warnings.push({ code: 'INVALID_BOOKING' }); continue; }
    seenStays.add(stayId(id));
    if (isExcludedApartment(b.apartment?.id)) { out.ignored.push({ reservationId: id, reason: 'EXCLUDED_CARRERA_19' }); continue; }
    const unit = unitForSmoobuApartment(b.apartment?.id);
    if (!unit) { out.ignored.push({ reservationId: id, reason: 'UNMAPPED_APARTMENT' }); continue; }
    if (b.type === 'cancellation') continue; // desired vacio: sus turnos con clave quedan obsoletos
    let nights;
    try { nights = nightlySlots({ arrival: b.arrival, departure: b.departure }); } catch {
      out.warnings.push({ code: 'INVALID_STAY_WINDOW', reservationId: id }); continue;
    }
    for (const n of nights) {
      const key = slotKey(id, unit.unit, n.night);
      if (desired.has(key)) { out.warnings.push({ code: 'DUPLICATE_BOOKING_NIGHT', key }); continue; }
      desired.set(key, { reservationId: id, unit, night: n.night });
      const un = `${unit.unit}|${n.night}`;
      byUnitNight.set(un, [...(byUnitNight.get(un) ?? []), id]);
    }
  }

  const occupiedBy = (roleId, night, exceptKeys = new Set()) => {
    const [ws, we] = nightWindow(night);
    return unkeyed.filter((s) => s.roleId === roleId && overlapMs(s.start, s.end, ws, we) >= minOverlap)
      .concat(all.filter((s) => s.key && !exceptKeys.has(s.key) && s.roleId === roleId && overlapMs(s.start, s.end, ws, we) >= minOverlap));
  };

  // 3) Crear / emparejar.
  for (const [key, d] of desired) {
    const existing = keyed.get(key);
    if (existing) { out.matched.push({ key, slotIds: existing.map((x) => x.id) }); continue; }

    const own = new Set([key]);
    // choque interno: otra reserva de Smoobu en la misma unidad/noche, o cruce con Casa Completa
    const rivals = new Set();
    for (const other of conflictsWith(d.unit.unit).concat(d.unit.unit)) {
      for (const rid of byUnitNight.get(`${other}|${d.night}`) ?? []) if (rid !== d.reservationId) rivals.add(rid);
    }
    if (rivals.size) {
      out.conflicts.push({ code: 'SMOOBU_OVERLAP', key, reservationId: d.reservationId, unit: d.unit.unit, night: d.night, withReservations: [...rivals] });
      continue;
    }
    // choque con turnos existentes de Odoo (cualquier origen) en la unidad o en las que bloquea
    const clash = [];
    for (const other of [d.unit.unit, ...conflictsWith(d.unit.unit)]) {
      const role = unitForName(other).odooRoleId;
      for (const s of occupiedBy(role, d.night, own)) clash.push({ slotId: s.id, unit: other, roleId: role, keyed: Boolean(s.key) });
    }
    // Una habitacion con turno de Casa y la habitacion destino LIBRE es un espejo de las reglas 167/169
    // (otra habitacion ocupada), salvo que las otras cuatro fisicas tambien esten ocupadas: entonces
    // parece una reserva real de Casa con el espejo de esta habitacion ausente -> conflicto.
    if (d.unit.unit !== 'CASA') {
      const casaHits = clash.filter((c) => c.unit === 'CASA');
      if (casaHits.length) {
        const others = PHYSICAL_UNITS.filter((u) => u !== d.unit.unit);
        const allOthersBusy = others.every((u) => occupiedBy(unitForName(u).odooRoleId, d.night, own).length > 0);
        if (!allOthersBusy) {
          for (let i = clash.length - 1; i >= 0; i -= 1) if (clash[i].unit === 'CASA') clash.splice(i, 1);
          out.warnings.push({ code: 'CASA_SLOT_TREATED_AS_MIRROR', key, slotIds: casaHits.map((c) => c.slotId) });
        }
      }
    }
    if (clash.length) {
      out.conflicts.push({ code: clash.some((c) => c.unit === d.unit.unit) ? 'ODOO_OCCUPIED' : 'ODOO_CASA_CROSS_OCCUPIED',
        key, reservationId: d.reservationId, unit: d.unit.unit, night: d.night, slots: clash });
      continue;
    }
    const [ws, we] = nightWindow(d.night);
    out.proposals.push(proposal('CREATE_SLOT', {
      externalKey: key, stayId: stayId(d.reservationId), reservationId: d.reservationId, unit: d.unit.unit,
      roleId: d.unit.odooRoleId, night: d.night, startUtc: new Date(ws).toISOString(), endUtc: new Date(we).toISOString(),
      resourceId: roleResources[d.unit.odooRoleId] ?? null, resourceIdPending: roleResources[d.unit.odooRoleId] == null,
      virtualUnit: d.unit.unit === 'CASA', // Casa Completa es un solo turno en el rol 69; no se generan turnos en las fisicas
    }));
  }

  // 4) Turnos con clave que ya no corresponden (modificacion, cancelacion, cambio de unidad).
  for (const [key, list] of keyed) {
    if (desired.has(key)) continue;
    const m = KEY_RE.exec(key);
    const stay = `SMOOBU-${m[1]}`;
    if (!seenStays.has(stay)) {
      out.warnings.push({ code: 'ORPHAN_KEYED_SLOT', key, slotIds: list.map((x) => x.id), hint: 'reserva fuera de la ventana consultada; no se propone nada' });
      continue;
    }
    for (const s of list) out.proposals.push(proposal('RELEASE_SLOT', { externalKey: key, slotId: s.id, roleId: s.roleId, reason: 'STAY_CANCELLED_OR_CHANGED' }));
  }

  // 5) Coherencia rol <-> unidad de los turnos con clave.
  for (const [key, list] of keyed) {
    const unit = KEY_RE.exec(key)[2];
    for (const s of list) {
      if (unitForOdooRole(s.roleId)?.unit !== unit) out.warnings.push({ code: 'KEYED_SLOT_WRONG_ROLE', key, slotId: s.id });
    }
  }
  return out;
}

/** Aplica las propuestas EN MEMORIA (solo para pruebas de idempotencia). */
export function simulateApply(slots, result, startId = 900000) {
  let next = startId;
  const released = new Set(result.proposals.filter((p) => p.op === 'RELEASE_SLOT').map((p) => p.slotId));
  const kept = slots.filter((s) => !released.has(s.id));
  const created = result.proposals.filter((p) => p.op === 'CREATE_SLOT').map((p) => ({
    id: next++, roleId: p.roleId, start: Date.parse(p.startUtc), end: Date.parse(p.endUtc), key: p.externalKey, active: true,
  }));
  return [...kept, ...created];
}

export { UNITS };
