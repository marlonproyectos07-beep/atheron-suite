import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGates } from '../src/recompute-precheck.mjs';

const base = () => ({
  steps: [{ name: 'cron.identify', unresolved: [] }, { name: 'cascade.flag-users', actionsMentioningFlag: [], automationsOnModelXAvailability: [] }],
  ctx: { pendingOnlyExpected: true, targetRowsOfOffer: true, slotsAbsent: true, icalClean: true, realOverlaps: 0,
    cron: { c: { id: 9 }, srv: { code: "env['x_availability'].search([('x_to_recompute','=',True)])" } }, actions: [{ id: 1493, code: '' }] },
});

test('puertas: caso limpio aun no basta (metodo minimo lo fija la ejecucion)', () => {
  const r = evaluateGates(base());
  assert.equal(r.gates.noExternalEffects, true);
  assert.equal(r.allGatesProven, false);
});
test('puertas: efecto externo o mas pendientes cierran', () => {
  const a = base(); a.ctx.cron.srv.code += " requests.post('https://x.example/a')";
  assert.equal(evaluateGates(a).gates.noExternalEffects, false);
  const b = base(); b.ctx.pendingOnlyExpected = false;
  assert.equal(evaluateGates(b).gates.onlyTwoPendingRows, false);
});
