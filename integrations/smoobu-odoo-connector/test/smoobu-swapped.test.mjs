import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-diagnose.yml', import.meta.url), 'utf8');
const steps = wf.split(/\n      - /).slice(1);
const stepOf = (re) => steps.filter((s) => re.test(s));

test('el cruce de secretos existe SOLO en el paso del modo apartments-once-swapped', () => {
  const crossed = steps.filter((s) => /SMOOBU_API_KEY: \$\{\{ secrets\.SMOOBU_API_SECRET \}\}/.test(s) || /SMOOBU_API_SECRET: \$\{\{ secrets\.SMOOBU_API_KEY \}\}/.test(s));
  assert.equal(crossed.length, 1);
  assert.match(crossed[0], /inputs\.mode == 'apartments-once-swapped'/);
  assert.match(crossed[0], /SMOOBU_API_KEY: \$\{\{ secrets\.SMOOBU_API_SECRET \}\}[\s\S]*SMOOBU_API_SECRET: \$\{\{ secrets\.SMOOBU_API_KEY \}\}/);
});
test('el modo original usa la asignacion sin cruzar y los dos modos son excluyentes', () => {
  const orig = stepOf(/inputs\.mode == 'apartments-once'\s/)[0];
  assert.match(orig, /SMOOBU_API_KEY: \$\{\{ secrets\.SMOOBU_API_KEY \}\}/);
  assert.match(orig, /SMOOBU_API_SECRET: \$\{\{ secrets\.SMOOBU_API_SECRET \}\}/);
  assert.ok(!/SMOOBU_ASSIGNMENT/.test(orig));
  for (const s of steps.filter((x) => /inputs\.mode/.test(x) && !/swapped/.test(x))) assert.ok(!/secrets\.SMOOBU_API_SECRET \}\}\n[\s\S]*?SMOOBU_API_SECRET: \$\{\{ secrets\.SMOOBU_API_KEY/.test(s));
  assert.equal((wf.match(/smoobu-once/g) ?? []).length, 2); // un paso por modo
  assert.ok(!/GITHUB_ENV|gh secret|secrets:\s*write/.test(wf)); // no modifica secretos
});
test('smoobu-once: una sola solicitud GET, sin reintentos ni escrituras, y etiqueta la asignacion', () => {
  const src = readFileSync(new URL('../scripts/smoobu-once.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal((src.match(/listProperties\(\)/g) ?? []).length, 1);
  assert.ok(!/for \(|while|retry|setTimeout|POST|PUT|DELETE|Odoo|getReservation/.test(src));
  assert.match(src, /ASIGNACION_INVERTIDA/);
});
test('el script, sin credenciales, no hace solicitud y sale con codigo 2', () => {
  let out = ''; let code = 0;
  try { out = execFileSync('node', ['scripts/smoobu-once.mjs'], { env: { PATH: process.env.PATH, SMOOBU_ASSIGNMENT: 'swapped' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = String(e.stdout); code = e.status; }
  assert.equal(code, 2); assert.match(out, /CONFIG_ERROR/); assert.match(out, /"requests":0/);
});
