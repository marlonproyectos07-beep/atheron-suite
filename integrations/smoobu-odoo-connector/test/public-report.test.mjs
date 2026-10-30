import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileByIds } from '../src/id-reconcile.mjs';
import { resolveWindow } from '../src/window.mjs';
import { toPublicReport, sensitiveValues, assertPublicSafe, maskSmoobu, maskOta } from '../src/public-report.mjs';
import { SMOOBU_BOOKINGS, ODOO_ORDERS, ODOO_SLOTS, WINDOW_ENV } from './fixtures/reconcile-ids-control.mjs';

const window = resolveWindow(WINDOW_ENV);
const internal = reconcileByIds({ bookings: SMOOBU_BOOKINGS, window, orders: ODOO_ORDERS, slots: ODOO_SLOTS });
const fullIds = [...new Set(SMOOBU_BOOKINGS.flatMap((b) => [String(b.id), b['reference-id']]).filter(Boolean))];
const publicText = JSON.stringify(toPublicReport(internal));

test('enmascarado: solo los 4 ultimos caracteres, con prefijo; nulos quedan en null', () => {
  assert.equal(maskSmoobu(160965781), 'SM*...5781'); assert.equal(maskOta('6044417870'), 'OTA*...7870');
  assert.equal(maskOta(null), null); assert.equal(maskSmoobu(''), null);
});

test('el informe publico no contiene ningun ID completo de Smoobu ni de la OTA (incluidos los tres casos de control)', () => {
  for (const id of fullIds) assert.ok(!publicText.includes(id), `ID completo visible (sufijo ${id.slice(-3)})`);
  for (const id of ['160965781', '6044417870', '161787956', '5122466816', '160829171', '5046108535']) assert.ok(!publicText.includes(id));
  assert.equal(assertPublicSafe(publicText, { identifiers: sensitiveValues(internal) }).safe, true);
});

test('el informe publico no contiene nombres, correos, documentos, textos libres ni IDs internos de pedidos de Odoo', () => {
  for (const banned of ['PRIVADO', 'privado@', '@example', '1014198033', 'Nequi', 'pago ', 'COT/', 'x_pms_reference', 'guest-name']) assert.ok(!publicText.includes(banned), banned);
  const p = toPublicReport(internal);
  assert.ok(p.perReservation.every((r) => !('odooOrders' in r) && !('smoobuId' in r)));
  assert.ok(!('id' in (p.ordersNotReturnedBySmoobu ?? {})) && typeof p.ordersNotReturnedBySmoobu.count === 'number');
});

test('se conserva lo necesario para diagnosticar: resumen, motivos, habitaciones, fechas, ocupacion y alertas', () => {
  const p = toPublicReport(internal);
  assert.deepEqual(p.summary, internal.summary); assert.deepEqual(p.counts, internal.counts);
  assert.equal(p.perReservation.length, internal.perReservation.length);
  const c1 = p.controlCases[0];
  assert.deepEqual([c1.control, c1.smoobuRef, c1.unit, c1.arrival, c1.verdict], ['CONTROL_1', 'SM*...5781', '302', '2026-10-31', 'MISSING_IN_ODOO']);
  const c3 = p.controlCases[2];
  assert.equal(c3.manualReview, 'ALERTA_SOBREVENTA_NO_RESOLVER_AUTOMATICAMENTE'); assert.ok(c3.overbookingWith.every((x) => /^SM\*\.\.\.\d{4}$/.test(x)));
  assert.ok(p.smoobuOverbooking.flat().every((x) => /^SM\*\.\.\.\d{4}$/.test(x)));
  assert.equal(p.safety.writesEnabled, false); assert.equal(p.safety.releaseUnlocked, false);
});

test('ultima barrera: detecta un ID completo o un secreto colado y no revela cual', () => {
  const leaked = `${publicText} 160965781`;
  const g = assertPublicSafe(leaked, { identifiers: sensitiveValues(internal), secrets: ['clave_secreta_prueba'] });
  assert.deepEqual(g, { safe: false, hits: { identifiers: 1, secrets: 0 } });
  assert.equal(assertPublicSafe('x clave_secreta_prueba', { secrets: ['clave_secreta_prueba'] }).hits.secrets, 1);
  assert.ok(!JSON.stringify(g).includes('160965781'));
});

test('el script solo imprime la vista publica y pasa por la barrera (nunca el informe interno)', () => {
  const src = readFileSync(new URL('../scripts/reconcile-ids.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('toPublicReport(out)') && src.includes('assertPublicSafe(') && src.includes('PRIVACY_GUARD_TRIPPED'));
  assert.ok(!/\.\.\.out\b/.test(src), 'no debe esparcir el informe interno en la salida');
  assert.ok(!/console\.log\([^)]*\bout\.(perReservation|controlCases|availabilityRisk|smoobuOverbooking)/.test(src));
});
