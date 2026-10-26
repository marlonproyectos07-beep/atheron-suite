import { stayId, nightlySlots } from './sync-plan.mjs';
import { ODOO_FACTS, RELEASE_UNLOCKED, RELEASE_MECHANISM_ANALYSIS, UNVERIFIED_SLOT_FIELDS } from './odoo-facts.mjs';
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
// Clave de turno por estancia completa: sin fecha (la fecha puede cambiar sin cambiar la identidad)
export const STAY_KEY_RE = /^SMOOBU-(\d+):([A-Z0-9]+)(?![\w:-])/;
export const stayKey = (reservationId, unit) => `${stayId(reservationId)}:${unit}`;

export const slotKey = (reservationId, unit, night) => `${stayId(reservationId)}:${unit}:${night}`;

/** [inicio, fin) en ms UTC: 15:00 de la noche -> 11:00 del dia siguiente, hora de Bogota (UTC-5, sin DST). */
export function defaultNightWindow(night) {
  const start = Date.parse(`${night}T00:00:00Z`) + CHECKIN_HOUR * HOUR - BOGOTA_OFFSET_MS;
  return [start, start + (24 - CHECKIN_HOUR + CHECKOUT_HOUR) * HOUR];
}

const toMs = (v) => (typeof v === 'number' ? v : Date.parse(String(v).includes('T') ? v : `${String(v).replace(' ', 'T')}Z`));

const slotMirrorState = (all, id) => all.find((x) => x.id === id)?.mirror;

/** Acepta un registro crudo de planning.slot (JSON-2) o uno ya normalizado. */
export function normalizeSlot(rec, { keyField = 'name' } = {}) {
  const role = Array.isArray(rec.role_id) ? rec.role_id[0] : (rec.role_id ?? rec.roleId);
  const text = rec[keyField] === false || rec[keyField] == null ? '' : String(rec[keyField]);
  const m = KEY_RE.exec(text);
  const sm = m ? null : STAY_KEY_RE.exec(text);
  return {
    id: rec.id,
    roleId: Number(role),
    start: toMs(rec.start_datetime ?? rec.start),
    end: toMs(rec.end_datetime ?? rec.end),
    key: 'key' in rec ? rec.key : (m ? `SMOOBU-${m[1]}:${m[2]}:${m[3]}` : (sm ? `SMOOBU-${sm[1]}:${sm[2]}` : null)),
    active: rec.active !== false,
    blockRef: rec[ODOO_FACTS.mirrorMarkerField] ? String(rec[ODOO_FACTS.mirrorMarkerField]) : (rec.blockRef ?? null),
    checkinState: rec[ODOO_FACTS.checkinStateField] ?? rec.checkinState ?? null,
    mirror: rec.mirror !== undefined ? rec.mirror : (rec[ODOO_FACTS.mirrorMarkerField] === undefined ? undefined : Boolean(rec[ODOO_FACTS.mirrorMarkerField])),
  };
}

const overlapMs = (aS, aE, bS, bE) => Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
const CASA_ROLE = unitForName('CASA').odooRoleId;
const unitOfKey = (u) => (u.startsWith('COVER') ? 'CASA' : u);

/** Subintervalos de [ws,we) que NO cubre ningun turno de la lista (tolerancia 1 min). */
export function uncoveredIntervals(ws, we, list) {
  const spans = list.map((x) => [Math.max(x.start, ws), Math.min(x.end, we)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const gaps = []; let cur = ws;
  for (const [a, b] of spans) { if (a - cur > 60000) gaps.push([cur, a]); cur = Math.max(cur, b); }
  if (we - cur > 60000) gaps.push([cur, we]);
  return gaps;
}
const iso = (ms) => new Date(ms).toISOString();

/**
 * Regla 169 (habitacion -> Casa): crea el espejo SOLO si Casa no tiene ningun turno solapado. Devuelve los
 * tramos de la ventana que Casa Completa dejaria sin bloquear. [] = bloqueo correcto.
 */
export function casaMirrorGap(all, ws, we, stay) {
  const overlapping = all.filter((c) => c.roleId === CASA_ROLE && !(c.key && c.key.startsWith(`${stay}:COVER`)) && overlapMs(c.start, c.end, ws, we) > 0);
  return overlapping.length ? uncoveredIntervals(ws, we, overlapping) : [];
}

/** Regla 167 (Casa -> habitaciones): omite una habitacion con cualquier solape. Devuelve habitaciones con bloqueo incompleto. */
export function roomMirrorGaps(all, ws, we, stay) {
  const out = [];
  for (const u of PHYSICAL_UNITS) {
    const role = unitForName(u).odooRoleId;
    const overlapping = all.filter((x) => x.roleId === role && !(x.key && x.key.startsWith(`${stay}:`)) && overlapMs(x.start, x.end, ws, we) > 0);
    if (!overlapping.length) continue;
    const gaps = uncoveredIntervals(ws, we, overlapping);
    if (gaps.length) out.push({ unit: u, uncovered: gaps.map(([a, b]) => [iso(a), iso(b)]) });
  }
  return out;
}

/** Propuesta de liberacion de un turno PROPIO (con clave). Bloqueada hasta prueba en staging. */
function releaseProposal(s, key, all, reason, out) {
  if (s.checkinState === 'checked_in' || s.checkinState === 'checked_out') {
    out.warnings.push({ code: 'RELEASE_REFUSED_GUEST_PRESENT_OR_DEPARTED', key, slotId: s.id, checkinState: s.checkinState });
    return;
  }
  const dependentMirrors = all.filter((m) => m.blockRef === String(s.id)).map((m) => ({
    slotId: m.id, roleId: m.roleId, startUtc: iso(m.start), endUtc: iso(m.end),
    sharedWith: all.filter((o) => o.id !== m.id && o.id !== s.id && o.roleId !== CASA_ROLE && o.roleId !== s.roleId && overlapMs(o.start, o.end, m.start, m.end) > 0).map((o) => o.id),
  }));
  out.proposals.push(proposal('RELEASE_SLOT', {
    externalKey: key, slotId: s.id, roleId: s.roleId, reason, autoApply: false, ownSlot: true,
    status: RELEASE_UNLOCKED ? 'PENDING_APPROVAL' : 'BLOCKED_UNTIL_STAGING_PROOF',
    mechanism: 'TO_BE_DECIDED', candidates: Object.keys(RELEASE_MECHANISM_ANALYSIS),
    dependentMirrors, mirrorPolicy: 'NUNCA_LIBERAR_AUTOMATICAMENTE_REVISION_MANUAL',
  }));
  if (dependentMirrors.length) out.warnings.push({ code: 'MIRROR_REMAINS_AFTER_RELEASE', key, slotId: s.id, mirrors: dependentMirrors.map((m) => ({ slotId: m.slotId, shared: m.sharedWith.length > 0 })) });
}
const proposal = (op, extra) => ({ op, status: 'PENDING_APPROVAL', writesEnabled: false, ...extra });

export function reconcile(opts) {
  if (opts.granularity === 'stay') {
    // Bloqueado: tiene brechas con la regla 169 (ver CALIBRACION.md). Solo para estudio, con aceptacion explicita.
    if (opts.allowStayMode !== true) { const e = new Error('STAY_MODE_DISABLED'); e.code = 'STAY_MODE_DISABLED'; throw e; }
    return reconcileStays(opts);
  }
  return reconcileNights(opts);
}

function reconcileNights({ bookings, slots, nightWindow = defaultNightWindow, minOverlapMinutes = 60, keyField = 'name', roleResources = ODOO_FACTS.roleResources, coverGaps = false }) {
  const out = { proposals: [], matched: [], conflicts: [], warnings: [], ignored: [] };
  const all = slots.map((s) => normalizeSlot(s, { keyField })).filter((s) => s.active);
  const minOverlap = minOverlapMinutes * 60000;

  // 1) Indice de turnos con clave; duplicados se reportan y NUNCA se borran solos.
  const keyed = new Map();
  for (const s of all) if (s.key && KEY_RE.test(s.key)) keyed.set(s.key, [...(keyed.get(s.key) ?? []), s]);
  for (const [key, list] of keyed) {
    if (list.length > 1) out.warnings.push({ code: 'DUPLICATE_KEYED_SLOTS', key, slotIds: list.map((x) => x.id) });
  }
  const unkeyed = all.filter((s) => !s.key || !KEY_RE.test(s.key));

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

  // Cobertura de huecos de la regla 169 SIN tocarla: un turno de Casa propio con x_bloqueo_ref no vacio
  // (las reglas no lo procesan) que cubre exactamente los tramos que el espejo omitido dejaria libres.
  const coverWanted = new Set();
  const wantCovers = (d, gaps) => {
    const stayP = stayId(d.reservationId);
    gaps.forEach(([a, b], i) => {
      const coverKey = `${stayP}:COVER${i + 1}:${d.night}`;
      coverWanted.add(coverKey);
      const ex = keyed.get(coverKey);
      if (ex && ex.length === 1 && Math.abs(ex[0].start - a) < 60000 && Math.abs(ex[0].end - b) < 60000) { out.matched.push({ key: coverKey, slotIds: [ex[0].id] }); return; }
      if (ex) { out.warnings.push({ code: 'COVER_SLOT_DIFFERS', key: coverKey, slotIds: ex.map((x) => x.id) }); return; }
      out.proposals.push(proposal('COVER_CASA_GAP', {
        externalKey: coverKey, stayId: stayP, forKey: slotKey(d.reservationId, d.unit.unit, d.night), night: d.night,
        roleId: CASA_ROLE, resourceId: roleResources[CASA_ROLE] ?? null, companyId: ODOO_FACTS.companyId, state: ODOO_FACTS.slotState,
        startUtc: iso(a), endUtc: iso(b), blockRef: coverKey, status: 'BLOCKED_UNTIL_STAGING_PROOF', autoApply: false,
        requiresStagingProof: ['otras automatizaciones sobre planning.slot (12, 22, 55, 157, 164, 170, 171) no producen efectos laterales con un turno marcado', 'el calculo real de disponibilidad (Booking Engine / reglas ATHERON) cuenta el turno de cobertura como ocupado'],
        unverifiedFields: Object.keys(UNVERIFIED_SLOT_FIELDS),
      }));
    });
  };

  // 3) Crear / emparejar.
  for (const [key, d] of desired) {
    const existing = keyed.get(key);
    if (existing) {
      out.matched.push({ key, slotIds: existing.map((x) => x.id) });
      if (coverGaps && d.unit.unit !== 'CASA') { const [ws0, we0] = nightWindow(d.night); wantCovers(d, casaMirrorGap(all, ws0, we0, stayId(d.reservationId))); }
      continue;
    }

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
      const casaHits = clash.filter((c) => c.unit === 'CASA' && slotMirrorState(all, c.slotId) !== false);
      const realCasa = clash.filter((c) => c.unit === 'CASA' && slotMirrorState(all, c.slotId) === false);
      // un turno de Casa con x_bloqueo_ref vacio es una reserva real de Casa: sigue siendo conflicto
      if (!realCasa.length && casaHits.length) {
        const others = PHYSICAL_UNITS.filter((u) => u !== d.unit.unit);
        const knownMirror = casaHits.every((c) => slotMirrorState(all, c.slotId) === true);
        const allOthersBusy = others.every((u) => occupiedBy(unitForName(u).odooRoleId, d.night, own).length > 0);
        if (knownMirror || !allOthersBusy) {
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
    // Bloqueo espejo incompleto: toda noche que no quede bloqueada correctamente en Casa (o en las habitaciones) se RECHAZA.
    let coverFor = null;
    if (d.unit.unit !== 'CASA') {
      const gap = casaMirrorGap(all, ws, we, stayId(d.reservationId));
      if (gap.length && !coverGaps) {
        out.conflicts.push({ code: 'MIRROR_GAP_CASA', key, reservationId: d.reservationId, unit: d.unit.unit, night: d.night,
          uncovered: gap.map(([a, b]) => [iso(a), iso(b)]), casaSlotIds: all.filter((c) => c.roleId === CASA_ROLE && overlapMs(c.start, c.end, ws, we) > 0).map((c) => c.id),
          hint: 'la regla 169 omite el espejo ante cualquier solape; use coverGaps tras prueba en staging' });
        continue;
      }
      if (gap.length) coverFor = gap;
    } else {
      const rg = roomMirrorGaps(all, ws, we, stayId(d.reservationId));
      if (rg.length) {
        out.conflicts.push({ code: 'MIRROR_GAP_ROOM', key, reservationId: d.reservationId, unit: 'CASA', night: d.night, rooms: rg,
          hint: 'la regla 167 omite una habitacion con cualquier solape; resolver a mano' });
        continue;
      }
    }
    if (coverFor) wantCovers(d, coverFor);
    out.proposals.push(proposal('CREATE_SLOT', {
      externalKey: key, stayId: stayId(d.reservationId), reservationId: d.reservationId, unit: d.unit.unit,
      roleId: d.unit.odooRoleId, night: d.night, startUtc: new Date(ws).toISOString(), endUtc: new Date(we).toISOString(),
      resourceId: roleResources[d.unit.odooRoleId] ?? null, resourceIdPending: roleResources[d.unit.odooRoleId] == null,
      companyId: ODOO_FACTS.companyId, state: ODOO_FACTS.slotState,
      virtualUnit: d.unit.unit === 'CASA', // Casa Completa es un solo turno en el rol 69; no se generan turnos en las fisicas
    }));
  }

  // 4) Turnos con clave que ya no corresponden (modificacion, cancelacion, cambio de unidad).
  for (const [key, list] of keyed) {
    if (desired.has(key) || coverWanted.has(key)) continue;
    const m = KEY_RE.exec(key);
    const stay = `SMOOBU-${m[1]}`;
    if (!seenStays.has(stay)) {
      out.warnings.push({ code: 'ORPHAN_KEYED_SLOT', key, slotIds: list.map((x) => x.id), hint: 'reserva fuera de la ventana consultada; no se propone nada' });
      continue;
    }
    if (list.length > 1) continue; // duplicados con clave: solo advertencia, nunca liberar
    for (const s of list) releaseProposal(s, key, all, 'STAY_CANCELLED_OR_CHANGED', out);
  }

  // 5) Coherencia rol <-> unidad de los turnos con clave.
  for (const [key, list] of keyed) {
    const unit = unitOfKey(KEY_RE.exec(key)[2]);
    for (const s of list) {
      if (unitForOdooRole(s.roleId)?.unit !== unit) out.warnings.push({ code: 'KEYED_SLOT_WRONG_ROLE', key, slotId: s.id });
    }
  }
  return out;
}

/**
 * GRANULARIDAD POR ESTANCIA (objetivo aprobado en ATH-DEV-012): UN turno por reserva
 * (15:00 de llegada -> 11:00 de salida, Bogota), clave `SMOOBU-<reserva>:<unidad>`.
 * La comprobacion de conflictos sigue siendo POR NOCHE. Cambios de fechas -> `UPDATE_SLOT`
 * (propuesta); nunca se borra, archiva ni desasigna nada: las liberaciones son
 * `RELEASE_SLOT` con `autoApply:false` y mecanismo por decidir.
 */
function reconcileStays({ bookings, slots, nightWindow = defaultNightWindow, minOverlapMinutes = 60, keyField = 'name', roleResources = ODOO_FACTS.roleResources }) {
  const out = { proposals: [], matched: [], conflicts: [], warnings: [], ignored: [] };
  const all = slots.map((s) => normalizeSlot(s, { keyField })).filter((s) => s.active);
  const minOverlap = minOverlapMinutes * 60000;
  const keyed = new Map();
  for (const s of all) if (s.key && STAY_KEY_RE.test(s.key) && !KEY_RE.test(s.key)) keyed.set(s.key, [...(keyed.get(s.key) ?? []), s]);
  for (const [key, list] of keyed) if (list.length > 1) out.warnings.push({ code: 'DUPLICATE_KEYED_SLOTS', key, slotIds: list.map((x) => x.id) });
  for (const s of all) if (s.key && KEY_RE.test(s.key)) out.warnings.push({ code: 'NIGHT_GRANULARITY_SLOT_PRESENT', key: s.key, slotId: s.id });

  const desired = new Map(); const seenStays = new Set(); const byUnitNight = new Map();
  for (const b of bookings) {
    const id = Number(b?.id);
    if (!Number.isInteger(id)) { out.warnings.push({ code: 'INVALID_BOOKING' }); continue; }
    seenStays.add(stayId(id));
    if (isExcludedApartment(b.apartment?.id)) { out.ignored.push({ reservationId: id, reason: 'EXCLUDED_CARRERA_19' }); continue; }
    const unit = unitForSmoobuApartment(b.apartment?.id);
    if (!unit) { out.ignored.push({ reservationId: id, reason: 'UNMAPPED_APARTMENT' }); continue; }
    if (b.type === 'cancellation') continue;
    let nights;
    try { nights = nightlySlots({ arrival: b.arrival, departure: b.departure }); } catch { out.warnings.push({ code: 'INVALID_STAY_WINDOW', reservationId: id }); continue; }
    const key = stayKey(id, unit.unit);
    if (desired.has(key)) { out.warnings.push({ code: 'DUPLICATE_BOOKING', key }); continue; }
    desired.set(key, { reservationId: id, unit, nights: nights.map((n) => n.night) });
    for (const n of nights) { const un = `${unit.unit}|${n.night}`; byUnitNight.set(un, [...(byUnitNight.get(un) ?? []), id]); }
  }
  const occupiedBy = (roleId, night, stay) => {
    const [ws, we] = nightWindow(night);
    return all.filter((s) => s.roleId === roleId && !(s.key && s.key.startsWith(`${stay}:`)) && overlapMs(s.start, s.end, ws, we) >= minOverlap);
  };

  for (const [key, d] of desired) {
    const stay = stayId(d.reservationId);
    const startMs = nightWindow(d.nights[0])[0]; const endMs = nightWindow(d.nights[d.nights.length - 1])[1];
    const existing = keyed.get(key);
    if (existing && existing.length === 1 && Math.abs(existing[0].start - startMs) < 60000 && Math.abs(existing[0].end - endMs) < 60000) {
      out.matched.push({ key, slotIds: [existing[0].id] }); continue;
    }
    // choques internos de Smoobu y con Odoo, noche por noche; una noche en conflicto bloquea toda la estancia
    const blocked = [];
    for (const night of d.nights) {
      const rivals = new Set();
      for (const other of conflictsWith(d.unit.unit).concat(d.unit.unit)) for (const rid of byUnitNight.get(`${other}|${night}`) ?? []) if (rid !== d.reservationId) rivals.add(rid);
      if (rivals.size) { blocked.push({ code: 'SMOOBU_OVERLAP', night, withReservations: [...rivals] }); continue; }
      const clash = [];
      for (const other of [d.unit.unit, ...conflictsWith(d.unit.unit)]) {
        const role = unitForName(other).odooRoleId;
        for (const sl of occupiedBy(role, night, stay)) clash.push({ slotId: sl.id, unit: other, roleId: role, keyed: Boolean(sl.key) });
      }
      if (d.unit.unit !== 'CASA' && clash.some((c) => c.unit === 'CASA')) {
        const casaIds = clash.filter((c) => c.unit === 'CASA').map((c) => c.slotId);
        const anyReal = casaIds.some((id) => slotMirrorState(all, id) === false);
        const allKnownMirror = casaIds.every((id) => slotMirrorState(all, id) === true);
        const allOthersBusy = PHYSICAL_UNITS.filter((u) => u !== d.unit.unit).every((u) => occupiedBy(unitForName(u).odooRoleId, night, stay).length > 0);
        if (!anyReal && (allKnownMirror || !allOthersBusy)) {
          out.warnings.push({ code: 'CASA_SLOT_TREATED_AS_MIRROR', key, night, slotIds: clash.filter((c) => c.unit === 'CASA').map((c) => c.slotId) });
          for (let i = clash.length - 1; i >= 0; i -= 1) if (clash[i].unit === 'CASA') clash.splice(i, 1);
        }
      }
      if (clash.length) blocked.push({ code: clash.some((c) => c.unit === d.unit.unit) ? 'ODOO_OCCUPIED' : 'ODOO_CASA_CROSS_OCCUPIED', night, slots: clash });
    }
    // Brecha de la regla 169: crea el espejo de Casa solo si NO hay ningun turno solapado. Si ya hay uno que
    // no cubre toda la estancia, el espejo se omite y las noches restantes de Casa quedan libres.
    if (d.unit.unit !== 'CASA') {
      const casaRole = unitForName('CASA').odooRoleId;
      const casaOverlap = all.filter((c) => c.roleId === casaRole && overlapMs(c.start, c.end, startMs, endMs) > 0);
      if (casaOverlap.length) {
        const uncovered = d.nights.filter((n) => { const [ws, we] = nightWindow(n); return !casaOverlap.some((c) => c.start <= ws + 60000 && c.end >= we - 60000); });
        if (uncovered.length) blocked.push({ code: 'AUTOMATION_169_MIRROR_GAP', uncoveredNights: uncovered, casaSlotIds: casaOverlap.map((c) => c.id) });
      }
    }
    if (blocked.length) { out.conflicts.push({ key, reservationId: d.reservationId, unit: d.unit.unit, nights: blocked }); continue; }
    const base = { externalKey: key, stayId: stay, reservationId: d.reservationId, unit: d.unit.unit, roleId: d.unit.odooRoleId,
      firstNight: d.nights[0], lastNight: d.nights[d.nights.length - 1], nights: d.nights.length,
      startUtc: new Date(startMs).toISOString(), endUtc: new Date(endMs).toISOString(),
      resourceId: roleResources[d.unit.odooRoleId] ?? null, resourceIdPending: roleResources[d.unit.odooRoleId] == null,
      companyId: ODOO_FACTS.companyId, state: ODOO_FACTS.slotState, virtualUnit: d.unit.unit === 'CASA' };
    if (existing?.length === 1) out.proposals.push(proposal('UPDATE_SLOT', { ...base, slotId: existing[0].id, autoApply: false,
      previous: { startUtc: new Date(existing[0].start).toISOString(), endUtc: new Date(existing[0].end).toISOString() } }));
    else if (!existing) out.proposals.push(proposal('CREATE_SLOT', base));
  }

  for (const [key, list] of keyed) {
    if (desired.has(key)) continue;
    const stay = `SMOOBU-${STAY_KEY_RE.exec(key)[1]}`;
    if (!seenStays.has(stay)) { out.warnings.push({ code: 'ORPHAN_KEYED_SLOT', key, slotIds: list.map((x) => x.id), hint: 'reserva fuera de la ventana consultada; no se propone nada' }); continue; }
    if (list.length > 1) continue;
    for (const sl of list) releaseProposal(sl, key, all, 'STAY_CANCELLED_OR_CHANGED', out);
  }
  for (const [key, list] of keyed) {
    const unit = STAY_KEY_RE.exec(key)[2];
    for (const sl of list) if (unitForOdooRole(sl.roleId)?.unit !== unit) out.warnings.push({ code: 'KEYED_SLOT_WRONG_ROLE', key, slotId: sl.id });
  }
  return out;
}

/** Aplica las propuestas EN MEMORIA (solo para pruebas de idempotencia). */
export function simulateApply(slots, result, startId = 900000) {
  let next = startId;
  const released = new Set(result.proposals.filter((p) => p.op === 'RELEASE_SLOT').map((p) => p.slotId));
  const updated = new Map(result.proposals.filter((p) => p.op === 'UPDATE_SLOT').map((p) => [p.slotId, p]));
  const kept = slots.filter((s) => !released.has(s.id)).map((s) => {
    const u = updated.get(s.id);
    return u ? { ...s, start: Date.parse(u.startUtc), end: Date.parse(u.endUtc) } : s;
  });
  const created = result.proposals.filter((p) => p.op === 'CREATE_SLOT' || p.op === 'COVER_CASA_GAP').map((p) => ({
    id: next++, roleId: p.roleId, start: Date.parse(p.startUtc), end: Date.parse(p.endUtc), key: p.externalKey, active: true,
    ...(p.op === 'COVER_CASA_GAP' ? { mirror: true, blockRef: p.blockRef } : {}),
  }));
  return [...kept, ...created];
}

export { UNITS };
