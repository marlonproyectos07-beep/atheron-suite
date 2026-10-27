import { randomBytes } from 'node:crypto';
import { classifyAll, KINDS } from './classify.mjs';
import { echoVerdict, defaultWindowOf } from './echo-guard.mjs';
import { reconcile, normalizeSlot, simulateApply, uncoveredIntervals } from './reconcile.mjs';
import { buildOpaqueCodec, TOKEN_RE } from './opaque-key.mjs';
import { feedMembership } from './pilot-dryrun.mjs';
import { unitForSmoobuApartment, unitForOdooRole, UNITS } from './unit-map.mjs';
import { RELEASE_UNLOCKED } from './odoo-facts.mjs';

/**
 * ATH-DEV-029 — conciliacion REAL en MEMORIA: reservas de Smoobu (leidas una vez) contra turnos de Odoo (leidos).
 * Pura: no hace red, no escribe, no ejecuta acciones. Los datos de huespedes pueden existir en `bookings` (memoria)
 * pero NUNCA se copian a la salida: la salida solo lleva ids, tipos, unidades, fechas, banderas y codigos.
 */
export const WRITES_ENABLED = false;
const PILOT = 161419736;
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const iso = (ms) => new Date(ms).toISOString();

function toOdooSlot(raw) {
  const n = normalizeSlot(raw);
  return { ...n, state: raw.state ?? null, hasNobeds: Boolean(raw.x_nobeds_id), hasSaleLine: Boolean(idOf(raw.sale_line_id)), hasGuest: Boolean(idOf(raw.x_guest_id)), channel: raw.x_channel || null };
}
const slotView = (s) => ({ id: s.id, unit: unitForOdooRole(s.roleId)?.unit ?? null, state: s.state, startUtc: iso(s.start), endUtc: iso(s.end), mirror: s.blockRef != null, nobeds: s.hasNobeds, keyed: Boolean(s.key), hasSaleLine: s.hasSaleLine });

/** ¿Los turnos ajenos (sin clave) del mismo rol cubren la ventana completa de la estancia? */
function foreignCoverage(booking, slots, unit) {
  const [ws, we] = defaultWindowOf(booking);
  const same = slots.filter((s) => s.roleId === unit.odooRoleId && !s.key && s.start < we && s.end > ws);
  if (!same.length) return { covered: false, slotIds: [] };
  const gaps = uncoveredIntervals(ws, we, same);
  return { covered: gaps.length === 0, slotIds: same.map((s) => s.id), gaps: gaps.map(([a, b]) => [iso(a), iso(b)]) };
}

export function buildLiveReport({ bookings, rawSlots, rawRoles = [], availability = [], salt = randomBytes(24).toString('hex'), pilotId = PILOT }) {
  const classification = classifyAll(bookings);
  const byId = new Map(bookings.map((b) => [Number(b.id), b]));
  const slots = rawSlots.map(toOdooSlot);
  const codec = buildOpaqueCodec({ salt, bookings });

  // 1) Quien llega al motor: estancias de huesped vigentes, tras el filtro anti-eco y la cobertura por turnos ajenos.
  const verdicts = []; const toEngine = [];
  for (const c of classification.items) {
    if (c.kind === KINDS.BLOCK) { verdicts.push({ id: c.id, unit: c.unit, type: c.type, arrival: c.arrival, departure: c.departure, verdict: 'BLOQUEO_NO_ES_HUESPED', reason: c.blockedActive ? 'is-blocked-booking activo: no crea turno ni venta' : 'bloqueo cancelado', matchesOdoo: null }); continue; }
    if (c.kind === KINDS.CANCELLATION) { verdicts.push({ id: c.id, unit: c.unit, type: c.type, arrival: c.arrival, departure: c.departure, verdict: 'CANCELADA_SIN_ACCION', reason: 'no genera bloqueos; liberar turnos sigue bloqueado (RELEASE_UNLOCKED=false)' }); continue; }
    if (c.kind === KINDS.EXCLUDED || c.kind === KINDS.UNMAPPED || c.kind === KINDS.INVALID || c.kind === KINDS.OTHER_TYPE) { verdicts.push({ id: c.id, type: c.type, verdict: 'IGNORADA', reason: c.reason ?? c.kind }); continue; }
    const b = byId.get(c.id); const unit = unitForSmoobuApartment(b.apartment?.id);
    const echo = echoVerdict(b, { odooSlots: slots, unitForApartment: unitForSmoobuApartment });
    if (echo.echo) { verdicts.push({ id: c.id, unit: c.unit, type: c.type, arrival: c.arrival, departure: c.departure, verdict: echo.reason === 'MATCHES_EXISTING_FOREIGN_SLOT' ? 'MATCH' : 'ECO_IGNORADA', reason: echo.reason, odooSlotIds: echo.slotIds ?? [] }); continue; }
    const cov = foreignCoverage(b, slots, unit);
    if (cov.covered) { verdicts.push({ id: c.id, unit: c.unit, type: c.type, arrival: c.arrival, departure: c.departure, verdict: 'MATCH', reason: 'COBERTURA_COMPLETA_POR_TURNOS_AJENOS', odooSlotIds: cov.slotIds }); continue; }
    toEngine.push(b);
  }

  // 2) Motor en memoria (modo por noche, sin cobertura de huecos, sin liberaciones).
  const result = reconcile({ bookings: toEngine, slots: rawSlots, keyCodec: codec });
  const confl = (rid) => result.conflicts.filter((x) => x.reservationId === rid);
  const props = (rid) => result.proposals.filter((p) => p.reservationId === rid && p.op === 'CREATE_SLOT');
  for (const b of toEngine) {
    const c = classification.items.find((x) => x.id === Number(b.id));
    const cf = confl(Number(b.id)); const pr = props(Number(b.id));
    const mirrorGap = cf.some((x) => /^MIRROR_GAP/.test(x.code));
    const verdict = cf.length ? (mirrorGap ? 'BLOQUEADO' : 'CONFLICTO') : (pr.length ? 'CREATE_SLOT_PROPUESTO' : 'MATCH');
    verdicts.push({ id: c.id, unit: c.unit, type: c.type, arrival: c.arrival, departure: c.departure, verdict,
      reason: cf.length ? [...new Set(cf.map((x) => x.code))].join('+') : (pr.length ? `${pr.length} noche(s) sin turno` : 'TURNOS_CON_CLAVE_EXISTENTES'),
      conflictNights: cf.map((x) => x.night), occupyingSlotIds: [...new Set(cf.flatMap((x) => (x.slots ?? []).map((s) => s.slotId)).concat(cf.flatMap((x) => x.casaSlotIds ?? [])))] });
  }
  verdicts.sort((a, b) => a.id - b.id);

  // 3) Seguridad
  const proposalsView = result.proposals.map((p) => ({ op: p.op, key: p.externalKey, unit: p.unit ?? null, night: p.night ?? null, status: p.status, writesEnabled: p.writesEnabled, nameIsOpaqueToken: TOKEN_RE.test(p.nameValue ?? ''), resourceId: p.resourceId ?? null, startUtc: p.startUtc ?? null, endUtc: p.endUtc ?? null, state: p.state ?? null }));
  const cancelledIds = new Set(classification.items.filter((c) => c.kind === KINDS.CANCELLATION || (c.kind === KINDS.BLOCK)).map((c) => c.id));
  const idempotence = (() => {
    const after = simulateApply(slots, result);
    const again = reconcile({ bookings: toEngine, slots: after, keyCodec: codec });
    return { proposalsAfterApplying: again.proposals.length, newConflictsAfterApplying: again.conflicts.length - result.conflicts.length };
  })();
  const safety = {
    writesEnabled: WRITES_ENABLED, releaseUnlocked: RELEASE_UNLOCKED,
    proposalOps: [...new Set(result.proposals.map((p) => p.op))],
    allProposalsDisabled: result.proposals.every((p) => p.writesEnabled === false),
    proposalForCancelledOrBlocked: result.proposals.filter((p) => cancelledIds.has(p.reservationId)).length,
    releaseProposals: result.proposals.filter((p) => p.op === 'RELEASE_SLOT').map((p) => ({ slotId: p.slotId, status: p.status })),
    engineIgnored: result.ignored, warnings: result.warnings.map((w) => ({ code: w.code, key: w.key ?? null, slotId: w.slotId ?? null })),
    nameValuesAreOpaque: result.proposals.filter((p) => p.nameValue != null).every((p) => TOKEN_RE.test(p.nameValue)),
    readableIdsInSlotName: false, idempotence,
  };

  // 4) iCal: que feeds incluirian los turnos que se crearian (la regla 1654 publica los turnos `published`)
  const roles = rawRoles.map((r) => ({ id: r.id, name: r.name, x_casa: r.x_casa || '' }));
  const hypothetical = result.proposals.filter((p) => p.op === 'CREATE_SLOT').map((p, i) => ({ id: 990000 + i, roleId: p.roleId, state: p.state, hasNobeds: false, blockRef: null }));
  const feeds = roles.length && hypothetical.length ? feedMembership([...slots.map((s) => ({ ...s })), ...hypothetical], roles) : {};
  const icalRisk = {
    newSlotsWouldBePublished: hypothetical.length > 0,
    feedsThatWouldContainNewSlots: Object.entries(feeds).filter(([, ids]) => ids.some((id) => id >= 990000)).map(([role]) => Number(role)),
    note: 'Un turno publicado entra en el .ics de su rol y de Casa por la accion 1654 (cron 147, 5 min): si Smoobu importa ese calendario volveria como bloqueo; el filtro anti-eco lo ignora (is-blocked-booking), pero no se ha probado de extremo a extremo.',
  };

  // 5) Piloto
  const pb = byId.get(pilotId); const pc = classification.items.find((c) => c.id === pilotId);
  let pilot = { id: pilotId, foundInSmoobu: Boolean(pb) };
  if (pb) {
    const unit = unitForSmoobuApartment(pb.apartment?.id); const [ws, we] = defaultWindowOf(pb);
    const rel = (roleId) => slots.filter((s) => s.roleId === roleId && s.start < we && s.end > ws);
    const casa = UNITS.find((u) => u.unit === 'CASA');
    const av = availability.filter((a) => a.date >= pc.arrival && a.date <= pc.departure);
    pilot = { ...pilot, type: pc.type, kind: pc.kind, unit: unit?.unit, roleId: unit?.odooRoleId, arrival: pc.arrival, departure: pc.departure, windowUtc: [iso(ws), iso(we)],
      verdict: verdicts.find((v) => v.id === pilotId)?.verdict, reason: verdicts.find((v) => v.id === pilotId)?.reason,
      odooSlotsRoom: rel(unit.odooRoleId).map(slotView), odooSlotsCasa: rel(casa.odooRoleId).map(slotView),
      availability: av, otherActiveSmoobuStaysSameUnitNights: verdicts.filter((v) => v.id !== pilotId && v.unit === unit?.unit && v.arrival < pc.departure && v.departure > pc.arrival).map((v) => ({ id: v.id, type: v.type, verdict: v.verdict })) };
  }

  const byVerdict = {}; for (const v of verdicts) byVerdict[v.verdict] = (byVerdict[v.verdict] ?? 0) + 1;
  return { classification: { ...classification, items: undefined }, perBooking: verdicts, byVerdict, engine: { proposals: proposalsView, conflicts: result.conflicts.map((c) => ({ code: c.code, key: c.key, unit: c.unit, night: c.night, slots: (c.slots ?? []).map((s) => s.slotId), casaSlotIds: c.casaSlotIds ?? [] })), matched: result.matched.length }, safety, icalRisk, pilot };
}
