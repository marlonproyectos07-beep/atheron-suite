import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpaqueCodec, tokenFor, TOKEN_RE } from '../src/opaque-key.mjs';
import { reconcile, simulateApply, defaultNightWindow, slotKey } from '../src/reconcile.mjs';
import { predictCreate } from '../src/pilot-dryrun.mjs';

const SAL = 'SAL-FICTICIA-DE-PRUEBA-0123456789';
const bk = (id, apt, a, d, extra = {}) => ({ id, apartment: { id: apt }, arrival: a, departure: d, ...extra });
const strip = (slots) => slots.map((s) => { const c = { ...s }; delete c.key; return c; }); // como Odoo: solo el texto de name

test('token opaco: determinista, no revela la reserva, depende de la sal y valida contra TOKEN_RE', () => {
  const t = tokenFor(SAL, slotKey(161419736, '301', '2026-10-26'));
  assert.match(t, TOKEN_RE); assert.ok(!t.includes('161419736') && !t.includes('301'));
  assert.equal(t, tokenFor(SAL, slotKey(161419736, '301', '2026-10-26')));
  assert.notEqual(t, tokenFor(SAL + 'x', slotKey(161419736, '301', '2026-10-26')));
  assert.notEqual(t, tokenFor(SAL, slotKey(161419736, '301', '2026-10-27')));
  assert.throws(() => buildOpaqueCodec({ salt: 'corta', bookings: [] }), { code: 'KEY_SALT_TOO_SHORT' });
});

test('conciliacion con nombres opacos: crea con token en name, reconoce sus turnos por el token e idempotente', () => {
  const b = [bk(1, 3557521, '2026-11-10', '2026-11-13')];
  const codec = buildOpaqueCodec({ salt: SAL, bookings: b });
  const r1 = reconcile({ bookings: b, slots: [], keyCodec: codec });
  assert.equal(r1.proposals.length, 3);
  for (const p of r1.proposals) { assert.match(p.nameValue, TOKEN_RE); assert.ok(!p.nameValue.includes('SMOOBU') && p.externalKey.includes('SMOOBU')); }
  const odoo = strip(simulateApply([], r1)).map((s) => ({ ...s, name: s.name })); // Odoo solo guarda name
  for (let i = 0; i < 3; i += 1) { const r = reconcile({ bookings: b, slots: odoo, keyCodec: codec }); assert.equal(r.proposals.length, 0); assert.equal(r.matched.length, 3); }
});

test('cancelacion con nombres opacos: se reconocen los turnos propios y la liberacion sale bloqueada', () => {
  const b = [bk(1, 3557521, '2026-11-10', '2026-11-12')];
  const codec = buildOpaqueCodec({ salt: SAL, bookings: b });
  const odoo = strip(simulateApply([], reconcile({ bookings: b, slots: [], keyCodec: codec })));
  const cancelled = [bk(1, 3557521, '2026-11-10', '2026-11-12', { type: 'cancellation' })];
  const r = reconcile({ bookings: cancelled, slots: odoo, keyCodec: buildOpaqueCodec({ salt: SAL, bookings: cancelled }) });
  assert.equal(r.proposals.length, 2); assert.ok(r.proposals.every((p) => p.op === 'RELEASE_SLOT' && p.status === 'BLOCKED_UNTIL_STAGING_PROOF'));
});

test('token desconocido (otra sal o reserva fuera de la ventana): advertencia y nunca se libera', () => {
  const b = [bk(1, 3557521, '2026-11-10', '2026-11-11')];
  const foreign = { id: 5, roleId: 37, start: defaultNightWindow('2026-12-01')[0], end: defaultNightWindow('2026-12-01')[1], name: tokenFor('OTRA-SAL-DISTINTA-0123456789', 'x'), active: true };
  const r = reconcile({ bookings: b, slots: [foreign], keyCodec: buildOpaqueCodec({ salt: SAL, bookings: b }) });
  assert.ok(r.warnings.some((w) => w.code === 'UNKNOWN_OPAQUE_TOKEN' && w.slotId === 5));
  assert.ok(!r.proposals.some((p) => p.op === 'RELEASE_SLOT'));
});

test('el .ics publico mostraria el token opaco, no la reserva', () => {
  const st = { roles: [{ id: 69, name: 'Casa Completa', x_casa: 'c', isRoomOffer: true, resourceIds: [79] }, { id: 37, name: '301', x_casa: 'c', isRoomOffer: true, resourceIds: [31] }], slots: [], recurrence: [{ pickup_time: 15 }], offers: [] };
  const t = tokenFor(SAL, slotKey(900000001, '301', '2026-10-15'));
  const p = predictCreate({ state: st, night: '2026-10-15', variant: 'published', opaqueToken: t });
  assert.equal(p.ical.keyVisibleInPublicIcal, false); assert.ok(p.ical.summaryWouldShow.includes(t)); assert.ok(!p.ical.summaryWouldShow.includes('900000001'));
  assert.equal(predictCreate({ state: st, night: '2026-10-15', variant: 'published' }).ical.keyVisibleInPublicIcal, true);
});

test('informe guardado del ensayo real: anonimo y consistente con la matriz de autorizaciones', async () => {
  const { readFileSync } = await import('node:fs');
  const { evaluateAll } = await import('../src/authorization-matrix.mjs');
  const fx = JSON.parse(readFileSync(new URL('../fixtures/pilot-dryrun-2026-10-26.json', import.meta.url), 'utf8'));
  const txt = JSON.stringify(fx);
  assert.ok(!/161419736/.test(txt.replace(/distinta de 161419736/, '')) && fx.slotsWindow.withNobedsId === 0);
  const m = Object.fromEntries(evaluateAll().map((o) => [o.id, o.verdict]));
  assert.deepEqual(fx.authorization, m);
  assert.deepEqual(fx.predictions['P0_draft_past_2026-10-15'].feedsChanged, []);
  assert.equal(fx.predictions['P0_draft_past_2026-10-15'].mirror, null);
  assert.ok(fx.candidates.pastFree.every((n) => n < '2026-10-26'));
});
