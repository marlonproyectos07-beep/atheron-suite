import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyWindowEnv, classifyFailure, buildDailySummary, renderMarkdown, runDaily, EXIT, DAILY_MAX_DAYS } from '../src/daily-run.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-108 — Datos SINTETICOS (ids 17xxxxxxx, nombres y montos inventados).
const ok = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
const APT = { 201: 3557506, 202: 3557511, 301: 3557521, 302: 3557526 };
const booking = (id, unit, arrival, departure, extra = {}) => ({ id, type: 'reservation', arrival, departure, apartment: { id: APT[unit] }, channel: { id: 7192171 }, 'guest-name': 'NOMBRE_PRIVADO', email: 'privado@example.invalid', phone: '+57 300 000 0000', price: 123457, ...extra });

function fakes({ bookings, orders = [], slots = [], smoobuStatus = 200, odooStatus = 200, pages } = {}) {
  const calls = { smoobu: [], odoo: [] };
  const sFetch = async (url, init) => {
    const u = new URL(url); calls.smoobu.push(`${init.method} ${u.pathname}`);
    if (smoobuStatus !== 200) return ok({ detail: 'NOMBRE_PRIVADO' }, smoobuStatus);
    if (pages) return ok(pages(Number(u.searchParams.get('page'))));
    return ok({ page: 1, page_count: 1, total_items: bookings.length, bookings });
  };
  const F = { 'planning.slot': ['id', 'name', 'role_id', 'start_datetime', 'end_datetime', 'state', 'sale_line_id'], 'sale.order': ['id', 'state', 'x_pms_reference', 'x_checkin', 'x_checkout', 'amount_untaxed', 'amount_tax', 'amount_total', 'invoice_ids'], 'sale.order.line': ['id', 'order_id', 'product_template_id', 'price_unit', 'x_precio_manual'], 'product.template': ['id', 'default_code', 'planning_role_id'], 'account.move': ['id', 'state', 'move_type', 'amount_total'] };
  const oFetch = async (url, init) => {
    const [, , , model, method] = new URL(url).pathname.split('/'); const body = JSON.parse(init.body);
    calls.odoo.push(`${init.method} ${model}/${method}`);
    if (odooStatus !== 200) return ok({ message: 'clave_prueba' }, odooStatus);
    if (method === 'fields_get') return ok(Object.fromEntries(F[model].map((f) => [f, { type: 'char' }])));
    if (model === 'planning.slot') return ok(JSON.stringify(body.domain).includes('DAYUSE') ? [] : slots);
    if (model === 'sale.order') return ok(orders.map(({ lines, ...o }) => o));
    if (model === 'sale.order.line') return ok(orders.flatMap((o) => (o.lines ?? [])));
    if (model === 'product.template') return ok([{ id: 12135, default_code: 'MAGIA-201', planning_role_id: [29, 'x'] }, { id: 12139, default_code: 'MAGIA-202', planning_role_id: [19, 'x'] }]);
    if (model === 'account.move') return ok([]);
    throw new Error(`no simulado: ${model}/${method}`);
  };
  return {
    calls,
    smoobu: new SmoobuClient({ apiKey: 'k_prueba', apiSecret: 's_prueba', fetchImpl: sFetch, pathPrefix: '/api' }),
    odoo: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'prueba', apiKey: 'clave_prueba', fetchImpl: oFetch }),
  };
}
const NOW = new Date('2026-10-31T03:30:00Z'); // 30/10 22:30 en Bogota: la ventana empieza el 30/10, no el 31
const secrets = ['k_prueba', 's_prueba', 'clave_prueba'];

test('ventana diaria: empieza HOY en Bogota (UTC-5) y dura N noches; limites 1..120', () => {
  assert.deepEqual(dailyWindowEnv(NOW, 90), { RECONCILE_FROM: '2026-10-30', RECONCILE_TO: '2027-01-27' });
  assert.deepEqual(dailyWindowEnv(new Date('2026-10-31T05:00:00Z'), 1), { RECONCILE_FROM: '2026-10-31', RECONCILE_TO: '2026-10-31' });
  assert.deepEqual(dailyWindowEnv(new Date('2026-12-31T12:00:00Z'), 2), { RECONCILE_FROM: '2026-12-31', RECONCILE_TO: '2027-01-01' });
  for (const bad of [0, 121, -1, 1.5, 'x', '']) assert.throws(() => dailyWindowEnv(NOW, bad), /DAILY_DAYS_INVALID/);
  assert.equal(DAILY_MAX_DAYS, 120);
});

test('clasificacion de fallos: credenciales, configuracion, API incompleta, red y seguridad', () => {
  assert.equal(classifyFailure('SMOOBU_AUTH_REJECTED'), 'CREDENCIALES_RECHAZADAS');
  assert.equal(classifyFailure('ODOO_AUTH_REJECTED'), 'CREDENCIALES_RECHAZADAS');
  assert.equal(classifyFailure('SMOOBU_ENV_MISSING'), 'CONFIGURACION');
  for (const c of ['SMOOBU_PAGINATION_INVALID', 'SMOOBU_PAGINATION_LIMIT', 'SMOOBU_INCOMPLETE_READ', 'ODOO_SLOT_LIMIT', 'ODOO_FIELDS_MISSING', 'ODOO_RESPONSE_INVALID']) assert.equal(classifyFailure(c), 'API_INCOMPLETA', c);
  for (const c of ['SMOOBU_TIMEOUT', 'ODOO_NETWORK_ERROR', 'SMOOBU_UPSTREAM_UNAVAILABLE']) assert.equal(classifyFailure(c), 'RED_O_SERVICIO', c);
  assert.equal(classifyFailure('ODOO_READ_ONLY_VIOLATION'), 'SEGURIDAD');
  assert.equal(classifyFailure(undefined), 'OTRO');
});

test('ejecucion correcta: resumen ATENCION con faltantes y borradores; solo lecturas; nada personal en la salida', async () => {
  const f = fakes({
    bookings: [booking(170200001, '201', '2026-11-03', '2026-11-05'), booking(170200002, '202', '2026-11-07', '2026-11-08')],
    orders: [{ id: 1, state: 'draft', x_pms_reference: 'SMOOBU-170200002 pago Nequi 0000000000', x_checkin: '2026-11-07', x_checkout: '2026-11-08', amount_untaxed: 123457, amount_tax: 0, amount_total: 123457, invoice_ids: [], lines: [{ id: 10, order_id: [1, 'x'], product_template_id: [12139, 'x'], price_unit: 123457, x_precio_manual: 123457 }] }],
  });
  const res = await runDaily({ ...f, env: { RECONCILE_DAYS: '30' }, now: NOW, secrets });
  assert.equal(res.exitCode, EXIT.OK);
  const s = res.stdout;
  assert.equal(s.result, 'ATENCION');
  assert.deepEqual([s.window.from, s.window.to], ['2026-10-30', '2026-11-28']);
  assert.deepEqual(s.missing.map((m) => [m.ref, m.unit, m.arrival, m.channel]), [['SM*...0001', '201', '2026-11-03', 'DIRECTA']]);
  assert.deepEqual(s.drafts.map((m) => [m.ref, m.reason]), [['SM*...0002', 'PEDIDO_EN_BORRADOR']]);
  assert.deepEqual([s.safety.writesEnabled, s.safety.releaseUnlocked, s.safety.odooWrites], [false, false, 0]);
  assert.ok(f.calls.smoobu.every((c) => c === 'GET /api/reservations'));
  assert.ok(f.calls.odoo.every((c) => /^POST [a-z._]+\/(fields_get|search_read)$/.test(c)), f.calls.odoo.join(','));
  const all = JSON.stringify(s) + res.markdown + JSON.stringify(res.report);
  for (const banned of ['NOMBRE_PRIVADO', 'privado@', '+57', '123457', 'Nequi', '0000000000', '170200001', '170200002', 'k_prueba', 's_prueba', 'clave_prueba']) assert.ok(!all.includes(banned), banned);
  assert.match(res.markdown, /Faltan en Odoo \(1\)/); assert.match(res.markdown, /Borradores sin turno \(1\)/);
});

test('sin pendientes: resultado OK y markdown sin tablas de pendientes', async () => {
  const f = fakes({ bookings: [] });
  const res = await runDaily({ ...f, env: { RECONCILE_DAYS: '7' }, now: NOW, secrets });
  assert.deepEqual([res.exitCode, res.stdout.result], [EXIT.OK, 'OK']);
  assert.ok(!/Faltan en Odoo/.test(res.markdown));
});

test('fallo seguro: credenciales rechazadas (Smoobu u Odoo) -> codigo 1, categoria explicita, sin detalle ni secretos', async () => {
  for (const [opt, code] of [[{ smoobuStatus: 401 }, 'SMOOBU_AUTH_REJECTED'], [{ odooStatus: 401 }, 'ODOO_AUTH_REJECTED']]) {
    const f = fakes({ bookings: [booking(170200003, '201', '2026-11-03', '2026-11-04')], ...opt });
    const res = await runDaily({ ...f, env: {}, now: NOW, secrets });
    assert.equal(res.exitCode, EXIT.FAILED);
    assert.deepEqual([res.stdout.result, res.stdout.failure.category, res.stdout.failure.code, res.stdout.failure.httpStatus], ['FALLO', 'CREDENCIALES_RECHAZADAS', code, 401]);
    assert.equal(res.report, null);
    const all = JSON.stringify(res.stdout) + res.markdown;
    for (const banned of ['NOMBRE_PRIVADO', 'clave_prueba', 'k_prueba', '170200003']) assert.ok(!all.includes(banned), banned);
    assert.match(res.markdown, /No se escribio nada/);
  }
});

test('fallo seguro: paginacion defectuosa o API incompleta -> codigo 1, API_INCOMPLETA; nunca un informe parcial', async () => {
  const f = fakes({ pages: (p) => ({ page: p, page_count: 3, total_items: p === 1 ? 250 : 251, bookings: [booking(170200100 + p, '201', '2026-11-03', '2026-11-04')] }) });
  const res = await runDaily({ ...f, env: { RECONCILE_DAYS: '7' }, now: NOW, secrets });
  assert.deepEqual([res.exitCode, res.stdout.failure.category, res.report], [EXIT.FAILED, 'API_INCOMPLETA', null]);
  const g = fakes({ pages: () => ({ page: 1, page_count: 1, total_items: 5, bookings: [booking(170200200, '201', '2026-11-03', '2026-11-04')] }) });
  const r2 = await runDaily({ ...g, env: { RECONCILE_DAYS: '7' }, now: NOW, secrets });
  assert.deepEqual([r2.exitCode, r2.stdout.failure.code], [EXIT.FAILED, 'SMOOBU_INCOMPLETE_READ']);
});

test('configuracion invalida: noches fuera de rango o ventana mal formada -> codigo 2 sin ninguna lectura', async () => {
  const f = fakes({ bookings: [] });
  for (const env of [{ RECONCILE_DAYS: '500' }, { RECONCILE_FROM: '2026-13-01', RECONCILE_TO: '2026-12-01' }, { RECONCILE_FROM: '2026-11-01' }]) {
    const res = await runDaily({ ...f, env, now: NOW, secrets });
    assert.deepEqual([res.exitCode, res.stdout.failure.category], [EXIT.CONFIG, 'CONFIGURACION'], JSON.stringify(env));
  }
  assert.deepEqual([f.calls.smoobu.length, f.calls.odoo.length], [0, 0]);
});

test('barrera de privacidad: si un secreto apareciera en la salida, no se publica nada (codigo 3)', async () => {
  const f = fakes({ bookings: [] });
  const res = await runDaily({ ...f, env: { RECONCILE_DAYS: '7' }, now: NOW, secrets: ['2026-10-30'] });
  // la fecha de inicio de ventana SI sale en el resumen: simula un secreto filtrado y comprueba que se retiene todo
  assert.deepEqual([res.exitCode, res.stdout.failure.code, res.report], [EXIT.PRIVACY, 'PRIVACY_GUARD_TRIPPED', null]);
});

test('interruptores de escritura siguen en false; el codigo diario no usa metodos de escritura', () => {
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
  for (const f of ['../src/daily-run.mjs', '../scripts/reconcile-daily.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/\.(create|write|unlink|executeKw|_request)\(|P0WriteClient|recompute-client|p0-client|method:\s*'(POST|PUT|DELETE)'/.test(src), f);
  }
});

test('workflow diario: programado + manual, solo lectura, sin simultaneidad y con doble candado', () => {
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-reconcile-daily.yml', import.meta.url), 'utf8');
  assert.match(wf, /\n {2}schedule:\n(?: {4}#[^\n]*\n)* {4}- cron: '\d+ \d+ \* \* \*'/);
  assert.match(wf, /\n {2}workflow_dispatch:/);
  assert.match(wf, /\npermissions:\n {2}contents: read\n/);
  assert.ok(!/(contents|actions|pull-requests|issues|packages|id-token): write/.test(wf));
  assert.match(wf, /\nconcurrency:\n {2}group: smoobu-odoo-reconcile-daily\n {2}cancel-in-progress: false/);
  assert.match(wf, /if: \$\{\{ github\.event_name == 'workflow_dispatch' \|\| vars\.RECONCILE_DAILY_ENABLED == 'true' \}\}/);
  assert.match(wf, /run: npm test/);
  assert.match(wf, /run: npm run --silent reconcile-daily/);
  assert.match(wf, /RECONCILE_DAYS: \$\{\{ inputs\.days \|\| '90' \}\}/);
  assert.ok(!/run:.*\$\{\{/.test(wf), 'ningun valor interpolado dentro de un run');
  assert.match(wf, /retention-days: 14/);
  for (const forbidden of ['p0', 'recompute', 'pilot', 'reservation-once', 'gh secret', 'git push', 'WRITES_ENABLED: true']) assert.ok(!wf.includes(forbidden), forbidden);
});
