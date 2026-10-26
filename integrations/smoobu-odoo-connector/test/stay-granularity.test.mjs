import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcile, simulateApply, defaultNightWindow, stayKey } from '../src/reconcile.mjs';
import { ODOO_FACTS } from '../src/odoo-facts.mjs';

const real = JSON.parse(readFileSync(new URL('../fixtures/real-calibration-2026-10-26.json', import.meta.url)));
const A = { 201: 3557506, 202: 3557511, 301: 3557521, CASA: 3557501 };
const bk = (id, apt, arrival, departure, extra = {}) => ({ id, apartment: { id: apt }, arrival, departure, ...extra });
const stay = (o) => reconcile({ granularity: 'stay', allowStayMode: true, ...o });
const night = (o) => reconcile({ granularity: 'night', ...o });
const mk = (id, roleId, n0, n1, extra = {}) => ({ id, roleId, start: defaultNightWindow(n0)[0], end: defaultNightWindow(n1)[1], key: null, active: true, ...extra });

test('hechos verificados en Odoo: recurso por rol, compania y estado publicado', () => {
  assert.deepEqual(ODOO_FACTS.roleResources, { 29: 28, 19: 29, 30: 30, 37: 31, 18: 32, 69: 79 });
  assert.deepEqual([ODOO_FACTS.companyId, ODOO_FACTS.slotState], [5, 'published']);
});

test('PILOTO por estancia: un turno 15:00 Bogota 26/10 -> 11:00 Bogota 27/10 con datos reales', () => {
  const r = stay({ bookings: [bk(161419736, A[301], '2026-10-26', '2026-10-27')], slots: real.slots });
  assert.equal(r.proposals.length, 1);
  const [p] = r.proposals;
  assert.deepEqual([p.op, p.externalKey, p.roleId, p.resourceId, p.companyId, p.state, p.nights, p.writesEnabled],
    ['CREATE_SLOT', stayKey(161419736, '301'), 37, 31, 5, 'published', 1, false]);
  assert.equal(p.startUtc, '2026-10-26T20:00:00.000Z'); assert.equal(p.endUtc, '2026-10-27T16:00:00.000Z');
  assert.equal(r.conflicts.length, 0);
});

test('varias noches: estancia = 1 turno; por noche = N turnos; mismo intervalo total', () => {
  const b = [bk(1, A[301], '2026-11-10', '2026-11-13')];
  const s = stay({ bookings: b, slots: [] }); const n = night({ bookings: b, slots: [] });
  assert.equal(s.proposals.length, 1); assert.equal(s.proposals[0].nights, 3); assert.equal(s.proposals[0].externalKey, 'SMOOBU-1:301');
  assert.equal(n.proposals.length, 3);
  assert.equal(s.proposals[0].startUtc, n.proposals[0].startUtc); assert.equal(s.proposals[0].endUtc, n.proposals[2].endUtc);
});

test('idempotencia por estancia: aplicar y repetir da cero propuestas', () => {
  const b = [bk(1, A[301], '2026-11-10', '2026-11-13'), bk(2, A[201], '2026-11-10', '2026-11-11')];
  const s1 = stay({ bookings: b, slots: [] });
  const slots = simulateApply([], s1);
  for (let i = 0; i < 3; i += 1) { const r = stay({ bookings: b, slots }); assert.equal(r.proposals.length, 0); assert.equal(r.matched.length, 2); }
});

test('cambio de fechas: UPDATE_SLOT propuesto (no borrado ni recreacion), idempotente despues', () => {
  const slots = simulateApply([], stay({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-12')], slots: [] }));
  const moved = [bk(1, A[301], '2026-11-11', '2026-11-14')];
  const r = stay({ bookings: moved, slots });
  assert.deepEqual(r.proposals.map((p) => p.op), ['UPDATE_SLOT']);
  assert.equal(r.proposals[0].autoApply, false); assert.equal(r.proposals[0].nights, 3);
  assert.equal(stay({ bookings: moved, slots: simulateApply(slots, r) }).proposals.length, 0);
});

test('cancelacion y cambio de unidad: solo propuestas RELEASE_SLOT sin aplicar automaticamente', () => {
  const slots = simulateApply([], stay({ bookings: [bk(1, A[201], '2026-11-10', '2026-11-12')], slots: [] }));
  const cancel = stay({ bookings: [bk(1, A[201], '2026-11-10', '2026-11-12', { type: 'cancellation' })], slots });
  assert.deepEqual(cancel.proposals.map((p) => [p.op, p.autoApply, p.mechanism]), [['RELEASE_SLOT', false, 'TO_BE_DECIDED']]);
  const moveUnit = stay({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-12')], slots });
  assert.deepEqual(moveUnit.proposals.map((p) => p.op).sort(), ['CREATE_SLOT', 'RELEASE_SLOT']);
  assert.ok(stay({ bookings: [], slots }).warnings.some((w) => w.code === 'ORPHAN_KEYED_SLOT'));
});

test('conflicto por noche: una sola noche ocupada bloquea toda la estancia', () => {
  const slots = [mk(50, 37, '2026-11-11', '2026-11-11')];
  const r = stay({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-13')], slots });
  assert.equal(r.proposals.length, 0);
  assert.deepEqual(r.conflicts[0].nights.map((n) => [n.code, n.night]), [['ODOO_OCCUPIED', '2026-11-11']]);
});

test('sobreventa interna de Smoobu y Carrera 19 igual que por noche', () => {
  const r = stay({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-12'), bk(2, A[301], '2026-11-11', '2026-11-13'), bk(3, 3567496, '2026-11-10', '2026-11-12')], slots: [] });
  assert.equal(r.proposals.length, 0); assert.equal(r.conflicts.length, 2);
  assert.deepEqual(r.ignored.map((i) => i.reason), ['EXCLUDED_CARRERA_19']);
});

test('INCOMPATIBILIDAD con la regla 169: estancia que solapa un espejo parcial deja noches de Casa sin bloquear', () => {
  // 201 ocupa 26->27 y la regla ya creo el espejo de Casa solo para esa noche (39648). Una estancia de 301 de 3 noches
  // se solapa con ese espejo: la regla 169 omitiria el espejo y Casa quedaria libre el 27 y el 28.
  const r = stay({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-29')], slots: real.slots });
  assert.equal(r.proposals.length, 0);
  assert.equal(r.conflicts[0].nights.at(-1).code, 'AUTOMATION_169_MIRROR_GAP');
  assert.deepEqual(r.conflicts[0].nights.at(-1).uncoveredNights, ['2026-10-27', '2026-10-28']);
  // por noche, la misma reserva funciona: la regla crea un espejo por cada turno de una noche libre
  const n = night({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-29')], slots: real.slots });
  assert.equal(n.proposals.length, 3); assert.equal(n.conflicts.length, 0);
});

test('sin turnos de Casa solapados, la estancia es compatible (la regla crea un espejo de todo el intervalo)', () => {
  const r = stay({ bookings: [bk(1, A[301], '2026-11-20', '2026-11-24')], slots: real.slots });
  assert.equal(r.proposals.length, 1); assert.equal(r.conflicts.length, 0);
});

test('x_bloqueo_ref identifica espejos: Casa con marca no bloquea; Casa sin marca (reserva real) si', () => {
  const casaMirror = mk(70, 69, '2026-11-10', '2026-11-10', { mirror: true });
  const casaReal = mk(71, 69, '2026-11-10', '2026-11-10', { mirror: false });
  const ok = night({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11')], slots: [casaMirror, mk(72, 29, '2026-11-10', '2026-11-10', { mirror: false })] });
  assert.equal(ok.proposals.length, 1);
  const bad = night({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11')], slots: [casaReal] });
  assert.equal(bad.proposals.length, 0); assert.equal(bad.conflicts[0].code, 'ODOO_CASA_CROSS_OCCUPIED');
  const badStay = stay({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11')], slots: [casaReal] });
  assert.equal(badStay.proposals.length, 0);
});

test('modo por noche sigue siendo el predeterminado', () => {
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-12')], slots: [] });
  assert.equal(r.proposals.length, 2); assert.match(r.proposals[0].externalKey, /^SMOOBU-1:301:2026-11-10$/);
});

test('el modo por estancia esta BLOQUEADO salvo aceptacion explicita', () => {
  assert.throws(() => reconcile({ granularity: 'stay', bookings: [], slots: [] }), { code: 'STAY_MODE_DISABLED' });
});
