import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { summarizeReservationsPage } from '../src/reservations-probe.mjs';

const root = new URL('../../../', import.meta.url);
const wf = readFileSync(new URL('.github/workflows/smoobu-odoo-diagnose.yml', root), 'utf8');

test('el cruce de secretos ocurre UNA sola vez, a nivel de job, y ningun paso lo repite', () => {
  const crossedKey = wf.match(/SMOOBU_API_KEY: \$\{\{ secrets\.SMOOBU_API_SECRET \}\}/g) ?? [];
  const crossedSecret = wf.match(/SMOOBU_API_SECRET: \$\{\{ secrets\.SMOOBU_API_KEY \}\}/g) ?? [];
  assert.equal(crossedKey.length, 1); assert.equal(crossedSecret.length, 1);
  const assignments = wf.match(/SMOOBU_API_(KEY|SECRET): \$\{\{ secrets\.[A-Z_]+ \}\}/g) ?? [];
  assert.equal(assignments.length, 2, 'ninguna otra asignacion SMOOBU_API_* en el workflow');
  const jobEnv = wf.slice(wf.indexOf('    env:\n      SMOOBU_API_KEY'), wf.indexOf('    defaults:'));
  assert.match(jobEnv, /SMOOBU_API_KEY: \$\{\{ secrets\.SMOOBU_API_SECRET \}\}/);
  assert.match(jobEnv, /SMOOBU_API_SECRET: \$\{\{ secrets\.SMOOBU_API_KEY \}\}/);
  assert.match(wf, /ADAPTACION TEMPORAL/);
});
test('ningun otro workflow consume los secretos de Smoobu ni hay modo swapped', async () => {
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(new URL('.github/workflows/', root))) {
    const t = readFileSync(new URL(`.github/workflows/${f}`, root), 'utf8');
    if (f !== 'smoobu-odoo-diagnose.yml') assert.ok(!/secrets\.SMOOBU_/.test(t), `${f} usa secretos de Smoobu`);
  }
  assert.ok(!/swapped/.test(wf));
  assert.ok(!/gh secret|secrets:\s*write|GITHUB_ENV/.test(wf));
});
test('los scripts no distinguen ni cruzan asignaciones (el par llega ya correcto al cliente)', () => {
  for (const f of ['smoobu-once.mjs', 'smoobu-reservations.mjs']) {
    const src = readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.ok(!/SMOOBU_API_SECRET\s*[,)]?\s*.*SMOOBU_API_KEY.*apiKey/s.test(src));
    assert.ok(!/swapped|ASSIGNMENT/.test(src));
  }
});
test('reservations: una sola solicitud, solo pagina 1, sin escrituras ni Odoo', () => {
  const src = readFileSync(new URL('../scripts/smoobu-reservations.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal((src.match(/listReservationsPage\(/g) ?? []).length, 1);
  assert.ok(!/listReservations\(|getReservation|for \(|while|retry|POST|PUT|DELETE|Odoo/.test(src));
});
test('el resumen de reservas no filtra datos personales y compara con el mapa', () => {
  const r = summarizeReservationsPage({ page: 1, page_count: 1, page_size: 100, total_items: 3, bookings: [
    { id: 161419736, type: 'reservation', arrival: '2026-10-26', departure: '2026-10-27', apartment: { id: 3557521, name: 'X' }, channel: { id: 70, name: 'Booking' }, 'guest-name': 'Persona Privada', email: 'a@b.co', phone: '123', price: 99 },
    { id: 2, type: 'cancellation', arrival: '2026-10-26', departure: '2026-10-28', apartment: { id: 3567496 } },
    { id: 3, type: 'reservation', arrival: '2026-10-26', departure: '2026-10-28', apartment: { id: 999 } },
  ] });
  const out = JSON.stringify(r);
  for (const leak of ['Persona Privada', 'a@b.co', '"phone":', '"price":']) assert.ok(!out.includes(leak), leak);
  assert.equal(r.pilot.found, true); assert.equal(r.pilot.unit, '301'); assert.equal(r.pilot.roleId, 37);
  assert.equal(r.inUnitMap, 1); assert.equal(r.excludedCarrera19, 1); assert.equal(r.unmapped, 1);
  assert.deepEqual(r.byType, { reservation: 2, cancellation: 1 });
});
test('smoobu-once sin credenciales: sin solicitud y codigo 2', () => {
  let out = ''; let code = 0;
  try { out = execFileSync('node', ['scripts/smoobu-once.mjs'], { env: { PATH: process.env.PATH }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = String(e.stdout); code = e.status; }
  assert.equal(code, 2); assert.match(out, /"requests":0/);
});
