import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, unitForSmoobuApartment, unitForOdooRole } from '../src/unit-map.mjs';
import { nightlySlots, planInbound, commit, planOutbound, resolveOutbound, stayId } from '../src/sync-plan.mjs';

test('mapa de seis unidades exacto y sin Carrera 19', () => {
  assert.deepEqual(UNITS.map((u) => [u.unit, u.smoobuApartmentId, u.odooRoleId]), [
    ['201', 3557506, 29], ['202', 3557511, 19], ['203', 3557516, 30], ['301', 3557521, 37], ['302', 3557526, 18], ['CASA', 3557501, 69]]);
  assert.equal(unitForSmoobuApartment(3557521).odooRoleId, 37);
  assert.equal(unitForOdooRole(37).unit, '301');
  assert.equal(unitForSmoobuApartment(999), null);
  assert.equal(new Set(UNITS.map((u) => u.odooRoleId)).size, 6);
});

test('un turno por noche, salida exclusiva', () => {
  assert.deepEqual(nightlySlots({ arrival: '2026-03-30', departure: '2026-04-02' }).map((s) => s.night), ['2026-03-30', '2026-03-31', '2026-04-01']);
  assert.throws(() => nightlySlots({ arrival: '2026-04-02', departure: '2026-04-02' }), { code: 'INVALID_STAY_WINDOW' });
});

const booking = (o = {}) => ({ id: 161419736, apartment: { id: 3557521 }, arrival: '2026-05-01', departure: '2026-05-03', ...o });

test('entrante: crear, duplicado, modificar sin duplicar slots, cancelar', () => {
  const ledger = new Map();
  const p1 = planInbound(booking(), { ledger });
  assert.equal(p1.action, 'CREATE'); assert.equal(p1.create.length, 2); assert.equal(p1.create[0].roleId, 37);
  assert.equal(p1.stayId, stayId(161419736));
  commit(ledger, booking(), p1);
  assert.equal(planInbound(booking(), { ledger }).action, 'IGNORE_DUPLICATE');
  const p2 = planInbound(booking({ departure: '2026-05-04' }), { ledger });
  assert.equal(p2.action, 'UPDATE'); assert.equal(p2.create.length, 1); assert.equal(p2.remove.length, 0);
  commit(ledger, booking({ departure: '2026-05-04' }), p2);
  assert.equal(ledger.get(161419736).slotKeys.length, 3);
  const p3 = planInbound(booking({ type: 'cancellation' }), { ledger });
  assert.equal(p3.action, 'CANCEL'); assert.equal(p3.slotKeys.length, 3);
});

test('entrante: apartamento no mapeado, eco propio y Casa bloquea las cinco', () => {
  const ledger = new Map();
  assert.equal(planInbound(booking({ apartment: { id: 42 } }), { ledger }).action, 'IGNORE_UNMAPPED');
  assert.equal(planInbound(booking(), { ledger, ownOrigin: new Set([161419736]) }).action, 'IGNORE_ECHO');
  assert.deepEqual(planInbound(booking({ apartment: { id: 3557501 } }), { ledger }).blocks, ['201', '202', '203', '301', '302']);
  assert.deepEqual(planInbound(booking(), { ledger }).blocks, ['CASA']);
});

test('saliente: PENDING_PMS hasta respuesta positiva; escrituras desactivadas', () => {
  const req = planOutbound({ unit: '301', arrival: '2026-05-01', departure: '2026-05-03', requestId: 'r1' });
  assert.equal(req.state, 'PENDING_PMS'); assert.equal(req.writesEnabled, false); assert.equal(req.smoobuApartmentId, 3557521);
  assert.equal(resolveOutbound(req, { ok: true, reservationId: 7 }).state, 'CONFIRMED');
  assert.equal(resolveOutbound(req, { ok: false }).state, 'REJECTED');
  assert.equal(resolveOutbound(req, { ok: false, retryable: true }).state, 'FAILED_RETRY');
  assert.throws(() => resolveOutbound(resolveOutbound(req, { ok: false }), { ok: true, reservationId: 1 }), { code: 'INVALID_TRANSITION' });
  assert.throws(() => planOutbound({ unit: 'X', arrival: '2026-05-01', departure: '2026-05-03', requestId: 'r' }), { code: 'UNIT_NOT_MAPPED' });
  assert.throws(() => planOutbound({ unit: '301', arrival: '2026-05-01', departure: '2026-05-03' }), { code: 'REQUEST_ID_REQUIRED' });
});
