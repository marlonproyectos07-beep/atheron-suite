import test from 'node:test';
import assert from 'node:assert/strict';
import { readControlCenterInputs } from '../src/control-center-reader.mjs';
import { mapProjectTaskToHousekeeping, HOUSEKEEPING_TASK_DOMAIN } from '../src/odoo-reporting-reader.mjs';

const auth = { database: 'atheron1-hotel-staging-20260923', uid: 7, technicalSecret: 'x' };

function transport(handler) {
  const calls = [];
  return {
    calls,
    async call(service, method, args) {
      calls.push({ service, method, args });
      return handler(args[3], args);
    },
  };
}

test('el lector del Control Center SOLO usa search_read (ni create, write, unlink ni acciones)', async () => {
  const t = transport((model) => {
    if (model === 'sale.order') return [{ id: 1, name: 'COT/1', x_reservation_status: 'confirmed' }];
    if (model === 'account.payment') return [{ id: 1, date: '2026-10-03', amount: 10, x_hotel_sale_order_id: [1, 'COT/1'] }];
    if (model === 'x_hotel_unit') return [{ id: 1, x_name: '201', x_resource_id: [28, 'R'], x_property_id: [1, 'HOTEL ATHERON SUITE'] }];
    if (model === 'project.task') return [{ id: 5, stage_id: [2, 'POR LIMPIAR'], x_resource_id: [28, 'R'], user_ids: [], write_date: '2026-10-03 10:00:00' }];
    return [];
  });
  const out = await readControlCenterInputs(t, auth);
  assert.ok(t.calls.filter((c) => c.service === 'object').every((c) => c.args[4] === 'search_read'));
  assert.equal(out.housekeepingTasks[0].unit, '201');
  assert.equal(out.housekeepingTasks[0].stage, 'POR LIMPIAR');
  assert.equal(out.payments.length, 1);
  assert.equal(out.reservations.length, 1);
  const sale = t.calls.find((c) => c.args[3] === 'sale.order');
  assert.deepEqual(sale.args[5][0].find((c) => c[0] === 'x_order_involves_room'), ['x_order_involves_room', '=', true]); // dominio hotelero fijo
});

test('si pagos o aseo no se pueden leer, se degrada a null + gap explicito (nunca datos inventados)', async () => {
  const t = transport((model) => {
    if (model === 'sale.order') return [];
    throw new Error('ACCESS_DENIED');
  });
  const out = await readControlCenterInputs(t, auth);
  assert.equal(out.payments, null);
  assert.equal(out.housekeepingTasks, null);
  assert.equal(out.gaps.length, 2);
});

test('tareas de aseo: solo abiertas y sin campos personales del cliente', () => {
  assert.deepEqual(HOUSEKEEPING_TASK_DOMAIN, [['state', 'not in', ['1_done', '1_canceled']]]);
  const m = mapProjectTaskToHousekeeping({ id: 1, stage_id: [3, 'LISTA'], x_resource_id: 9, user_ids: [4], write_date: 'd' }, { unitByResourceId: { 9: '302' }, userNameById: { 4: 'Rosa' } });
  assert.deepEqual([m.unit, m.stage, m.assignee], ['302', 'LISTA', 'Rosa']);
});
