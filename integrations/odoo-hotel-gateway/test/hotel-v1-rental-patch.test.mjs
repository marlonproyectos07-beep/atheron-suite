import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isAvailable, ROOM_UNITS } from '../../odoo-hotel-ical/src/inventory-model.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'odoo-patches');
const manifest = JSON.parse(readFileSync(join(root, 'hotel-v1-reservas-action.json'), 'utf8'));
const code = readFileSync(join(root, 'hotel-v1-confirm-rental.py'), 'utf8');

test('parche local apunta solo a menu Hotel 1909 y boton CONFIRMAR 1899 de STAGING', () => {
  assert.equal(manifest.database, 'atheron1-hotel-staging-20260923');
  assert.equal(manifest.id, 1909);
  assert.equal(manifest.server_action_id, 1899);
  assert.equal(manifest.apply_automatically, false);
  assert.match(manifest.proposed_context, /in_rental_app/);
  assert.match(manifest.proposed_context, /default_is_rental_order/);
  assert.ok(code.indexOf("'is_rental_order': True") < code.indexOf('order.action_confirm()'));
  assert.ok(code.indexOf("'rental_start_date': start") < code.indexOf('order.action_confirm()'));
  assert.doesNotMatch(code, /action_open_pickup|action_open_return|unlink\(/);
});

test('reserva Hotel v1 301 04/10 cierra 301 y CASA; una segunda venta Casa es incompatible', () => {
  const reserved = [{ unit: '301', checkIn: '2026-10-04', checkOut: '2026-10-05' }];
  assert.equal(isAvailable(reserved, '301', '2026-10-04', '2026-10-05'), false);
  assert.equal(isAvailable(reserved, 'CASA_COMPLETA', '2026-10-04', '2026-10-05'), false);
  assert.equal(isAvailable(reserved, '202', '2026-10-04', '2026-10-05'), true);
});

test('reserva Hotel v1 CASA 04/10 cierra las cinco habitaciones sin Recoleccion', () => {
  const reserved = [{ unit: 'CASA_COMPLETA', checkIn: '2026-10-04', checkOut: '2026-10-05' }];
  for (const room of ROOM_UNITS) {
    assert.equal(isAvailable(reserved, room, '2026-10-04', '2026-10-05'), false, room);
  }
});
