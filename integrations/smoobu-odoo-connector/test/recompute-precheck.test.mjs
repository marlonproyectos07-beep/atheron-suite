import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGates } from '../src/recompute-precheck.mjs';

const A1493OK = `if (records := env['x_availability'].search([('x_to_recompute', '=', True)])):\n    for (total, booked), avail_batch in updates.items():\n        avail_batch.write({'x_total_units': total, 'x_booked': booked, 'x_to_recompute': False})\n`;
const CRON = "env['x_availability'].create(to_create)\nenv['x_availability'].search([('x_date', '>=', today)]).write({'x_to_recompute': True})";
const base = () => ({
  steps: [{ name: 'cron.identify', unresolved: [] }, { name: 'cascade.flag-users', cronsRunningThem: [], automationsOnModelXAvailability: [] }],
  ctx: { pendingOnlyExpected: true, targetRowsOfOffer: true, slotsAbsent: true, icalClean: true, realOverlaps: 0,
    cron: { c: { id: 86 }, srv: { code: CRON } }, actions: [{ id: 1493, code: A1493OK }],
    effects: { mods: [{ name: 'booking_engine' }], webhooksOnAvail: [], allCrons: [], autosAll: [], fields: [] } },
});

test('puertas: metodo 1493 limpio y cron global excluido => todo demostrado', () => {
  const r = evaluateGates(base());
  assert.equal(r.gates.methodWritesOnlyAvailabilityFields, true);
  assert.equal(r.gates.cronIsGlobalAndExcluded, true);
  assert.equal(r.allGatesProven, true);
});
test('puertas: modulo de canal, mas pendientes o efectos externos cierran', () => {
  const a = base(); a.ctx.effects.mods.push({ name: 'channex_connector' });
  assert.equal(evaluateGates(a).allGatesProven, false);
  const b = base(); b.ctx.pendingOnlyExpected = false;
  assert.equal(evaluateGates(b).allGatesProven, false);
  const c = base(); c.ctx.actions[0].code += "\nrequests.post('https://x.example/a')";
  assert.equal(evaluateGates(c).gates.methodNoExternalEffects, false);
  const d = base(); delete d.ctx.effects;
  assert.equal(evaluateGates(d).allGatesProven, false);
});
