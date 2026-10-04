import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessStay, classifyBlock, INVENTORY_STATE, inventoryStateFor } from '../src/inventory-control.mjs';
import { ROOM_UNITS, isAvailable } from '../src/inventory-model.mjs';
import { applyBlock, createSyncLedger, exportCalendar, toInventory } from '../src/ota-adapters.mjs';

const START = '2026-12-25';
const END = '2026-12-26';
const capacityFromDocumentedOdoo = { 301: 7, CASA_COMPLETA: 22 };
const block = (canonical_unit_id, source, extras = {}) => ({
  canonical_unit_id, source, check_in: START, check_out: END, status: 'blocked', ...extras,
});

test('reserva DIRECT_WHATSAPP con referencia Odoo cierra 301 y CASA y se exporta a iCal', async () => {
  let otaWrites = 0;
  const odoo = { listBlocks: async () => [block('AHS-301', 'DIRECT_WHATSAPP', {
    reservation_ref: 'TEST-ODOO-DIRECT-301', reason: 'Reserva directa registrada',
  })], applyBlock: async () => { otaWrites++; } };
  const inventory = toInventory(await odoo.listBlocks());
  assert.equal(inventoryStateFor(inventory, '301', START).state, INVENTORY_STATE.RESERVED_DIRECT);
  const casa = inventoryStateFor(inventory, 'CASA_COMPLETA', START);
  assert.equal(casa.state, INVENTORY_STATE.HOUSE_BLOCK);
  assert.equal(casa.blockers[0].cause, INVENTORY_STATE.RESERVED_DIRECT);
  assert.equal(casa.blockers[0].reference, 'TEST-ODOO-DIRECT-301');
  assert.equal(isAvailable(inventory, 'CASA_COMPLETA', START, END), false);
  const ical = await exportCalendar({ canonical_unit_id: 'AHS-CASA', from: START, to: END,
    stamp: START, odoo });
  assert.match(ical, /BEGIN:VEVENT/);
  assert.match(ical, /DTSTART;VALUE=DATE:20261225/);
  assert.doesNotMatch(ical, /TEST-ODOO-DIRECT-301/); // sin referencia interna en feed publico
  const competing = await applyBlock({ canonical_unit_id: 'AHS-CASA', source: 'booking',
    odoo_unit_id: 6, check_in: START, check_out: END, status: 'blocked',
    idempotency_key: 'TEST-BOOKING-CASA' }, { odoo, ledger: createSyncLedger() });
  assert.equal(competing.status, 'CONFLICT');
  assert.equal(otaWrites, 0);
});

test('CLOSED_MANUAL sin motivo y bloque Odoo sin procedencia nunca liberan inventario', () => {
  const unknown = toInventory([block('AHS-301', 'odoo', { status: 'CLOSED_MANUAL' })]);
  assert.equal(classifyBlock(unknown[0]), INVENTORY_STATE.UNEXPLAINED_BLOCK);
  assert.equal(inventoryStateFor(unknown, '301', START).available, false);
  assert.equal(inventoryStateFor(unknown, 'CASA_COMPLETA', START).available, false);
  assert.equal(assessStay(unknown, { unit: 'CASA_COMPLETA', checkIn: START, checkOut: END,
    guests: 20, capacity: capacityFromDocumentedOdoo.CASA_COMPLETA }).status, 'BLOCKED');
  assert.equal(inventoryStateFor([], '301', START, { snapshotComplete: false }).available, false);
  assert.equal(inventoryStateFor([], '301', START).available, false);
  assert.throws(() => inventoryStateFor([{ unit: '301', status: 'CLOSED_MANUAL' }], '301', START),
    /INVENTORY_BLOCK_INVALID/);
  assert.equal(classifyBlock({ source: 'manual', reason: 'Mantenimiento', status: 'CLOSED_MANUAL' }),
    INVENTORY_STATE.MANUAL_BLOCK_EXPLAINED);
  assert.equal(classifyBlock({ source: 'odoo', source_channel: 'DIRECT_WHATSAPP',
    reservation_ref: 'TEST-ODOO-REF', status: 'blocked' }), INVENTORY_STATE.RESERVED_DIRECT);
});

test('20 pax Casa 25/12: inventario completo -> HOLD local -> cinco habitaciones cerradas y trazadas', () => {
  const blocks = [];
  const request = { unit: 'CASA_COMPLETA', checkIn: START, checkOut: END,
    guests: 20, capacity: capacityFromDocumentedOdoo.CASA_COMPLETA, snapshotComplete: true };
  assert.equal(assessStay(blocks, request).status, 'AVAILABLE');
  // Simula solo la respuesta atomica de Odoo; no escribe en STAGING.
  blocks.push(toInventory([block('AHS-CASA', 'HOLD', { status: 'HOLD', hold_id: 'TEST-HOLD-CASA-25' })])[0]);
  assert.equal(assessStay(blocks, request).status, 'BLOCKED');
  assert.equal(inventoryStateFor(blocks, 'CASA_COMPLETA', START).state, INVENTORY_STATE.HOLD);
  for (const room of ROOM_UNITS) {
    const state = inventoryStateFor(blocks, room, START);
    assert.equal(state.state, INVENTORY_STATE.HOUSE_BLOCK, room);
    assert.equal(state.blockers[0].cause, INVENTORY_STATE.HOLD, room);
    assert.equal(state.blockers[0].reference, 'TEST-HOLD-CASA-25', room);
  }
});

test('200 pax Casa: CAPACITY_GAP antes de disponibilidad o HOLD', () => {
  const result = assessStay([], { unit: 'CASA_COMPLETA', checkIn: START, checkOut: END,
    guests: 200, capacity: capacityFromDocumentedOdoo.CASA_COMPLETA });
  assert.deepEqual(result, { status: 'CAPACITY_GAP', unit: 'CASA_COMPLETA',
    requested_guests: 200, capacity: 22 });
});
