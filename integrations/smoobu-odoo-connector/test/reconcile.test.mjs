import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcile, simulateApply, normalizeSlot, slotKey, defaultNightWindow } from '../src/reconcile.mjs';

const A = { 201: 3557506, 202: 3557511, 301: 3557521, CASA: 3557501, C19: 3567496 };
const bk = (id, apt, arrival, departure, extra = {}) => ({ id, apartment: { id: apt }, arrival, departure, ...extra });
const slot = (id, roleId, night, key = null) => {
  const [s, e] = defaultNightWindow(night);
  return { id, roleId, start: s, end: e, key, active: true };
};
const ops = (r, op) => r.proposals.filter((p) => p.op === op);

test('PILOTO 161419736 (301, 26-27 oct): exactamente un turno propuesto en rol 37, sin crearlo', () => {
  const fx = JSON.parse(readFileSync(new URL('../fixtures/pilot-161419736.json', import.meta.url)));
  const real = JSON.parse(readFileSync(new URL('../fixtures/real-calibration-2026-10-26.json', import.meta.url)));
  const r = reconcile({ bookings: [fx.booking], slots: real.slots });
  assert.equal(r.proposals.length, 1);
  const [p] = r.proposals;
  assert.deepEqual([p.op, p.roleId, p.night, p.externalKey, p.status, p.writesEnabled],
    ['CREATE_SLOT', 37, '2026-10-26', 'SMOOBU-161419736:301:2026-10-26', 'PENDING_APPROVAL', false]);
  assert.equal(p.startUtc, '2026-10-26T20:00:00.000Z'); // 15:00 Bogota, como los turnos reales
  assert.equal(p.endUtc, '2026-10-27T16:00:00.000Z');   // 11:00 Bogota del dia siguiente
  assert.deepEqual([p.resourceId, p.resourceIdPending, p.companyId, p.state], [31, false, 5, 'published']); // verificado en Odoo
  assert.equal(r.conflicts.length, 0);
  // el turno de Casa (39648) de esa noche es un espejo de 201/302, no una reserva de Casa
  assert.deepEqual(r.warnings, [{ code: 'CASA_SLOT_TREATED_AS_MIRROR', key: p.externalKey, slotIds: [39648] }]);
});

test('REGRESION con datos reales: 203 ocupada por turno largo, Casa bloqueada por habitaciones, mismo horario', () => {
  const real = JSON.parse(readFileSync(new URL('../fixtures/real-calibration-2026-10-26.json', import.meta.url)));
  const r203 = reconcile({ bookings: [bk(1, 3557516, '2026-10-26', '2026-10-27')], slots: real.slots });
  assert.equal(r203.conflicts[0].code, 'ODOO_OCCUPIED'); assert.equal(r203.conflicts[0].slots[0].slotId, 39670);
  assert.equal(reconcile({ bookings: [bk(2, A.CASA, '2026-10-26', '2026-10-27')], slots: real.slots }).conflicts[0].code, 'ODOO_OCCUPIED');
  const r202 = reconcile({ bookings: [bk(3, A[202], '2026-10-25', '2026-10-26')], slots: real.slots }); // 202 libre esa noche; solo hay espejo de Casa
  assert.equal(r202.proposals.length, 1);
  // turnos reales de 20 h consecutivos no chocan con la noche vecina (hueco 11:00-15:00)
  const [s0, e0] = defaultNightWindow('2026-10-26'); const [s1] = defaultNightWindow('2026-10-27');
  assert.equal((e0 - s0) / 3600000, 20); assert.equal((s1 - e0) / 3600000, 4);
  const applied = simulateApply(real.slots, reconcile({ bookings: [bk(161419736, A[301], '2026-10-26', '2026-10-27')], slots: real.slots }));
  assert.equal(reconcile({ bookings: [bk(161419736, A[301], '2026-10-26', '2026-10-27')], slots: applied }).proposals.length, 0);
});

test('repeticion de importacion: aplicar y volver a conciliar da cero propuestas', () => {
  const bookings = [bk(1, A[301], '2026-10-26', '2026-10-29'), bk(2, A[201], '2026-10-26', '2026-10-27')];
  const r1 = reconcile({ bookings, slots: [] });
  assert.equal(ops(r1, 'CREATE_SLOT').length, 4);
  const slots = simulateApply([], r1);
  const r2 = reconcile({ bookings, slots });
  assert.equal(r2.proposals.length, 0); assert.equal(r2.matched.length, 4);
  assert.equal(reconcile({ bookings, slots }).proposals.length, 0); // tercera vez igual
});

test('modificacion: extender anade solo la noche nueva; acortar libera solo la sobrante', () => {
  const base = [bk(1, A[301], '2026-10-26', '2026-10-28')];
  const slots = simulateApply([], reconcile({ bookings: base, slots: [] }));
  const ext = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-29')], slots });
  assert.deepEqual(ext.proposals.map((p) => [p.op, p.night]), [['CREATE_SLOT', '2026-10-28']]);
  const cut = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27')], slots });
  assert.deepEqual(cut.proposals.map((p) => [p.op, p.externalKey]), [['RELEASE_SLOT', 'SMOOBU-1:301:2026-10-27']]);
});

test('modificacion: cambio de habitacion libera el rol anterior y crea en el nuevo', () => {
  const slots = simulateApply([], reconcile({ bookings: [bk(1, A[201], '2026-10-26', '2026-10-27')], slots: [] }));
  const r = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27')], slots });
  assert.deepEqual(r.proposals.map((p) => [p.op, p.roleId]).sort(), [['CREATE_SLOT', 37], ['RELEASE_SLOT', 29]]);
});

test('cancelacion: libera los turnos con clave; sin turnos no propone nada', () => {
  const slots = simulateApply([], reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-28')], slots: [] }));
  const r = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-28', { type: 'cancellation' })], slots });
  assert.equal(ops(r, 'RELEASE_SLOT').length, 2); assert.equal(ops(r, 'CREATE_SLOT').length, 0);
  assert.equal(reconcile({ bookings: [bk(9, A[301], '2026-10-26', '2026-10-28', { type: 'cancellation' })], slots: [] }).proposals.length, 0);
  assert.equal(reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-28', { type: 'cancellation' })], slots: simulateApply(slots, r) }).proposals.length, 0);
});

test('conflicto de ocupacion: turno ajeno (p. ej. NOBEDS) en el mismo rol y noche bloquea la creacion', () => {
  const r = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27')], slots: [slot(77, 37, '2026-10-26')] });
  assert.equal(r.proposals.length, 0);
  assert.equal(r.conflicts[0].code, 'ODOO_OCCUPIED'); assert.equal(r.conflicts[0].slots[0].slotId, 77);
});

test('turno ajeno de la noche vecina (solape menor a 60 min) no es conflicto', () => {
  const [s] = defaultNightWindow('2026-10-25');
  const edge = { id: 5, roleId: 37, start: s, end: defaultNightWindow('2026-10-26')[0] + 30 * 60000, key: null, active: true }; // invade 30 min
  assert.equal(reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27')], slots: [edge] }).proposals.length, 1);
});

test('Casa Completa: un solo turno en rol 69, ninguno en fisicas', () => {
  const r = reconcile({ bookings: [bk(5, A.CASA, '2026-10-26', '2026-10-28')], slots: [] });
  assert.equal(r.proposals.length, 2);
  assert.ok(r.proposals.every((p) => p.roleId === 69 && p.virtualUnit === true && p.unit === 'CASA'));
});

test('Casa Completa cruzada: Casa sobre fisica ocupada -> conflicto; espejo vs reserva real de Casa', () => {
  const a = reconcile({ bookings: [bk(5, A.CASA, '2026-10-26', '2026-10-27')], slots: [slot(1, 29, '2026-10-26')] });
  assert.equal(a.proposals.length, 0); assert.equal(a.conflicts[0].code, 'ODOO_CASA_CROSS_OCCUPIED');
  // fisica con un turno de Casa y las otras fisicas libres: espejo de las reglas, se propone
  const b = reconcile({ bookings: [bk(6, A[301], '2026-10-26', '2026-10-27')], slots: [slot(2, 69, '2026-10-26'), slot(3, 29, '2026-10-26')] });
  assert.equal(b.proposals.length, 1); assert.equal(b.warnings[0].code, 'CASA_SLOT_TREATED_AS_MIRROR');
  // Casa con las otras cuatro fisicas ocupadas y la destino libre: parece reserva real de Casa -> conflicto
  const rooms = [201, 202, 203, 302].map((u, i) => slot(10 + i, { 201: 29, 202: 19, 203: 30, 302: 18 }[u], '2026-10-26'));
  const c = reconcile({ bookings: [bk(7, A[301], '2026-10-26', '2026-10-27')], slots: [slot(2, 69, '2026-10-26'), ...rooms] });
  assert.equal(c.proposals.length, 0); assert.equal(c.conflicts[0].code, 'ODOO_CASA_CROSS_OCCUPIED');
});

test('Casa ya conciliada con turnos espejo sin clave (automatizaciones) no se reporta como conflicto propio', () => {
  const bookings = [bk(5, A.CASA, '2026-10-26', '2026-10-27')];
  const mirror = slot(2, 29, '2026-10-26'); // espejo creado por reglas existentes
  const slots = [slot(1, 69, '2026-10-26', slotKey(5, 'CASA', '2026-10-26')), mirror];
  const r = reconcile({ bookings, slots });
  assert.deepEqual([r.proposals.length, r.conflicts.length, r.matched.length], [0, 0, 1]);
});

test('sobreventa dentro de Smoobu: dos reservas misma noche, o fisica + Casa, no generan turnos', () => {
  const same = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27'), bk(2, A[301], '2026-10-26', '2026-10-27')], slots: [] });
  assert.equal(same.proposals.length, 0); assert.equal(same.conflicts.length, 2);
  assert.ok(same.conflicts.every((c) => c.code === 'SMOOBU_OVERLAP'));
  const cross = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27'), bk(5, A.CASA, '2026-10-26', '2026-10-27')], slots: [] });
  assert.equal(cross.proposals.length, 0); assert.equal(cross.conflicts.length, 2);
});

test('Carrera 19 (3567496) y apartamentos desconocidos se ignoran con motivo', () => {
  const r = reconcile({ bookings: [bk(1, A.C19, '2026-10-26', '2026-10-27'), bk(2, 42, '2026-10-26', '2026-10-27')], slots: [] });
  assert.equal(r.proposals.length, 0);
  assert.deepEqual(r.ignored.map((i) => i.reason), ['EXCLUDED_CARRERA_19', 'UNMAPPED_APARTMENT']);
});

test('duplicados con clave: se reportan y nunca se proponen borrados automaticos', () => {
  const k = slotKey(1, '301', '2026-10-26');
  const r = reconcile({ bookings: [bk(1, A[301], '2026-10-26', '2026-10-27')], slots: [slot(1, 37, '2026-10-26', k), slot(2, 37, '2026-10-26', k)] });
  assert.equal(r.proposals.length, 0);
  assert.deepEqual(r.warnings[0], { code: 'DUPLICATE_KEYED_SLOTS', key: k, slotIds: [1, 2] });
});

test('turno con clave de reserva fuera de la ventana: advertencia, sin liberar', () => {
  const r = reconcile({ bookings: [], slots: [slot(1, 37, '2026-10-26', slotKey(99, '301', '2026-10-26'))] });
  assert.equal(r.proposals.length, 0); assert.equal(r.warnings[0].code, 'ORPHAN_KEYED_SLOT');
});

test('normalizeSlot lee registros JSON-2 crudos (role_id par, fechas UTC, clave en name)', () => {
  const s = normalizeSlot({ id: 3, role_id: [37, '301 ...'], start_datetime: '2026-10-26 20:00:00', end_datetime: '2026-10-27 16:00:00', name: 'SMOOBU-161419736:301:2026-10-26 nota' });
  assert.deepEqual([s.roleId, s.key, s.start], [37, 'SMOOBU-161419736:301:2026-10-26', Date.parse('2026-10-26T20:00:00Z')]);
  assert.equal(normalizeSlot({ id: 4, role_id: false, name: false, start_datetime: '2026-10-26 20:00:00', end_datetime: '2026-10-27 16:00:00' }).key, null);
  const r = reconcile({ bookings: [bk(161419736, A[301], '2026-10-26', '2026-10-27')], slots: [{ id: 3, role_id: [37, 'x'], start_datetime: '2026-10-26 20:00:00', end_datetime: '2026-10-27 16:00:00', name: 'SMOOBU-161419736:301:2026-10-26' }] });
  assert.equal(r.proposals.length, 0);
});

test('la conciliacion no muta sus entradas', () => {
  const bookings = [bk(1, A[301], '2026-10-26', '2026-10-27')]; const slots = [slot(1, 29, '2026-10-26')];
  const snap = JSON.stringify([bookings, slots]);
  reconcile({ bookings, slots });
  assert.equal(JSON.stringify([bookings, slots]), snap);
});
