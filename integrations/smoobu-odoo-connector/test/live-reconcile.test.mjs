import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBooking, classifyAll } from '../src/classify.mjs';
import { buildLiveReport } from '../src/live-reconcile.mjs';
import { defaultNightWindow } from '../src/reconcile.mjs';

const apt = { 301: 3557521, 201: 3557506, 202: 3557511, CASA: 3557501, CARRERA: 3567496 };
const bk = (id, unit, arrival, departure, extra = {}) => ({ id, type: 'reservation', arrival, departure, apartment: { id: apt[unit], name: 'NombrePrivadoUnidad' }, channel: { id: 7192171, name: 'Canal' }, 'guest-name': 'Huesped Secreto', email: 'secreto@ejemplo.co', phone: '3000000000', price: 777777, 'is-blocked-booking': false, ...extra });
const slot = (id, roleId, night, nights = 1, extra = {}) => { const [s] = defaultNightWindow(night); const e = defaultNightWindow(new Date(Date.parse(`${night}T00:00:00Z`) + (nights - 1) * 86400000).toISOString().slice(0, 10))[1]; const f = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19); return { id, role_id: [roleId, 'x'], resource_id: [31, 'r'], start_datetime: f(s), end_datetime: f(e), state: 'published', x_bloqueo_ref: false, x_nobeds_id: 'NB', ...extra }; };
const roles = [{ id: 37, name: '301', x_casa: 'A' }, { id: 69, name: 'Casa Completa', x_casa: 'A' }, { id: 29, name: '201', x_casa: 'A' }];

test('clasificacion: tipos, bloqueos, canceladas, Carrera 19 y duplicados', () => {
  const list = [bk(1, '301', '2026-10-26', '2026-10-27'), bk(2, '301', '2026-10-26', '2026-10-27', { type: 'cancellation', 'is-blocked-booking': true }),
    bk(3, '202', '2026-10-25', '2026-10-26', { 'is-blocked-booking': true, type: 'modification of booking' }), bk(4, 'CARRERA', '2026-10-26', '2026-10-27'),
    bk(5, '201', '2026-10-26', '2026-10-27', { type: 'modification of booking' }), bk(6, '201', '2026-10-26', '2026-10-27'), bk(7, '301', '2026-10-26', '2026-10-27', { type: 'rara' })];
  const c = classifyAll(list);
  assert.equal(classifyBooking(list[2]).kind, 'BLOCK');
  assert.equal(c.blocksActive, 1); assert.equal(c.blocksCancelled, 1); assert.equal(c.excluded, 1); assert.equal(c.guestStays, 3);
  assert.deepEqual(c.unknownTypes, ['rara']);
  assert.deepEqual(c.possibleDuplicateStays.map((d) => d.ids.sort()), [[5, 6]]);
});

test('piloto: MATCH con turno ajeno exacto; bloqueo y cancelada no crean nada; Carrera 19 excluida', () => {
  const bookings = [bk(161419736, '301', '2026-10-26', '2026-10-27'), bk(10, '301', '2026-10-26', '2026-10-27', { type: 'cancellation', 'is-blocked-booking': true }), bk(11, '202', '2026-10-25', '2026-10-26', { 'is-blocked-booking': true }), bk(12, 'CARRERA', '2026-10-26', '2026-10-27')];
  const r = buildLiveReport({ bookings, rawSlots: [slot(500, 37, '2026-10-26'), slot(501, 69, '2026-10-26', 1, { x_bloqueo_ref: '500', x_nobeds_id: false })], rawRoles: roles });
  const v = Object.fromEntries(r.perBooking.map((x) => [x.id, x.verdict]));
  assert.equal(v[161419736], 'MATCH'); assert.equal(v[10], 'BLOQUEO_NO_ES_HUESPED'); assert.equal(v[11], 'BLOQUEO_NO_ES_HUESPED'); assert.equal(v[12], 'IGNORADA');
  assert.equal(r.engine.proposals.length, 0); assert.equal(r.safety.proposalForCancelledOrBlocked, 0);
  assert.equal(r.pilot.unit, '301'); assert.equal(r.pilot.roleId, 37); assert.equal(r.pilot.odooSlotsRoom.length, 1); assert.equal(r.pilot.odooSlotsCasa[0].mirror, true);
});

test('sin turno en Odoo: CREATE_SLOT propuesto, deshabilitado, nombre opaco, idempotente', () => {
  const r = buildLiveReport({ bookings: [bk(20, '301', '2026-10-30', '2026-10-31')], rawSlots: [], rawRoles: roles });
  assert.equal(r.perBooking[0].verdict, 'CREATE_SLOT_PROPUESTO');
  assert.equal(r.engine.proposals[0].op, 'CREATE_SLOT'); assert.equal(r.engine.proposals[0].writesEnabled, false); assert.equal(r.engine.proposals[0].nameIsOpaqueToken, true);
  assert.equal(r.safety.writesEnabled, false); assert.equal(r.safety.releaseUnlocked, false); assert.equal(r.safety.nameValuesAreOpaque, true);
  assert.equal(r.safety.idempotence.proposalsAfterApplying, 0);
  assert.equal(r.icalRisk.newSlotsWouldBePublished, true);
});

test('turno ajeno que ocupa pero no coincide: CONFLICTO; cancelada no libera nada', () => {
  const r = buildLiveReport({ bookings: [bk(30, '301', '2026-10-30', '2026-10-31')], rawSlots: [slot(600, 37, '2026-10-30', 3)], rawRoles: roles });
  assert.equal(r.perBooking[0].verdict, 'MATCH'); // cubierto por un turno ajeno mas largo
  const r2 = buildLiveReport({ bookings: [bk(31, '301', '2026-10-29', '2026-11-02')], rawSlots: [slot(601, 37, '2026-10-30', 1)], rawRoles: roles });
  assert.equal(r2.perBooking[0].verdict, 'CONFLICTO');
  assert.deepEqual(r2.safety.releaseProposals, []);
});

test('la salida no contiene datos personales ni ids legibles en nombres', () => {
  const r = buildLiveReport({ bookings: [bk(161419736, '301', '2026-10-26', '2026-10-27'), bk(40, '201', '2026-11-05', '2026-11-06')], rawSlots: [slot(500, 37, '2026-10-26')], rawRoles: roles });
  const out = JSON.stringify(r);
  for (const leak of ['Huesped Secreto', 'secreto@ejemplo.co', '3000000000', '777777', 'NombrePrivadoUnidad']) assert.ok(!out.includes(leak), leak);
  assert.equal(r.safety.readableIdsInSlotName, false);
});

test('cancelacion de huesped (no bloqueo): sin accion y sin propuesta', () => {
  const r = buildLiveReport({ bookings: [bk(50, '301', '2026-10-30', '2026-10-31', { type: 'cancellation' })], rawSlots: [], rawRoles: roles });
  assert.equal(r.perBooking[0].verdict, 'CANCELADA_SIN_ACCION'); assert.equal(r.engine.proposals.length, 0);
});
