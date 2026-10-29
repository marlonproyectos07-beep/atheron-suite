import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runReconcileIds, readSmoobuWindow, readOdooWindow, LIMITS } from '../src/reconcile-ids-run.mjs';
import { resolveWindow } from '../src/window.mjs';
import { SMOOBU_BOOKINGS, ODOO_ORDERS, ODOO_SLOTS, WINDOW_ENV } from './fixtures/reconcile-ids-control.mjs';

const window = resolveWindow(WINDOW_ENV);
const ok = (data) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });

/** Smoobu simulado: registra metodo y ruta; pagina de `pageSize` en `pageSize`. */
function fakeSmoobu(bookings, { pageSize = 5, totalItems } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url); calls.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams) });
    const page = Number(u.searchParams.get('page')); const pageCount = Math.max(1, Math.ceil(bookings.length / pageSize));
    return ok({ page, page_count: pageCount, total_items: totalItems ?? bookings.length, bookings: bookings.slice((page - 1) * pageSize, page * pageSize) });
  };
  return { calls, client: new SmoobuClient({ apiKey: 'k_prueba', apiSecret: 's_prueba', fetchImpl }) };
}

/** Odoo simulado: devuelve el fixture; registra modelo/metodo/dominio. Las lineas se reconstruyen desde `units`. */
function fakeOdoo({ orders = ODOO_ORDERS, slots = ODOO_SLOTS } = {}) {
  const calls = [];
  const tmpl = { 201: 12135, 202: 12139, 203: 12140, 301: 12136, 302: 12134, CASA: 58223 };
  const roleOf = { 12135: 29, 12139: 19, 12140: 30, 12136: 37, 12134: 18, 58223: 69 };
  const lines = orders.flatMap((o) => o.units.map((u, i) => ({ id: o.id * 10 + i, order_id: [o.id, o.name], product_template_id: [tmpl[u], 'PRODUCTO'] })));
  const fields = { 'planning.slot': ['id', 'role_id', 'start_datetime', 'end_datetime', 'state', 'x_bloqueo_ref', 'sale_line_id'], 'sale.order': ['id', 'name', 'state', 'x_pms_reference', 'x_booking_source', 'x_checkin', 'x_checkout', 'x_reservation_status'], 'sale.order.line': ['id', 'order_id', 'product_template_id'], 'product.template': ['id', 'default_code', 'planning_role_id'] };
  const fetchImpl = async (url, init) => {
    const [, , , model, method] = new URL(url).pathname.split('/'); const body = JSON.parse(init.body);
    calls.push({ http: init.method, model, method, domain: body.domain });
    if (method === 'fields_get') return ok(Object.fromEntries(fields[model].map((f) => [f, { type: 'char' }])));
    if (model === 'planning.slot') return ok(slots);
    if (model === 'sale.order') return ok(orders.map(({ units, ...o }) => o));
    if (model === 'sale.order.line') return ok(lines);
    if (model === 'product.template') return ok(Object.entries(roleOf).map(([id, role]) => ({ id: Number(id), default_code: false, planning_role_id: [role, 'ROL'] })));
    throw new Error(`no simulado: ${model}/${method}`);
  };
  return { calls, client: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'prueba', apiKey: 'clave_prueba', fetchImpl }) };
}

test('extremo a extremo: solo GET a Smoobu y solo fields_get/search_read a Odoo; paginacion completa; mismo intervalo', async () => {
  const s = fakeSmoobu(SMOOBU_BOOKINGS); const o = fakeOdoo();
  const out = await runReconcileIds({ smoobu: s.client, odoo: o.client, window });
  assert.ok(s.calls.every((c) => c.method === 'GET' && c.path === '/api/reservations'));
  assert.equal(s.calls.length, 4); assert.equal(out.reads.smoobu.requests, 4); assert.equal(out.reads.smoobu.recordsRead, SMOOBU_BOOKINGS.length);
  assert.ok(s.calls.every((c) => c.query.from === '2026-10-27' && c.query.to === '2027-01-06' && c.query.showCancellation === 'true'));
  assert.ok(o.calls.every((c) => c.http === 'POST' && ['fields_get', 'search_read'].includes(c.method)), JSON.stringify(o.calls.map((c) => c.method)));
  const slotCall = o.calls.find((c) => c.model === 'planning.slot' && c.method === 'search_read');
  assert.deepEqual(slotCall.domain.slice(1), [['start_datetime', '<', '2027-01-07 00:00:00'], ['end_datetime', '>', '2026-10-27 00:00:00']]);
  assert.equal(out.reads.odoo.writes, 0);
  assert.deepEqual(out.summary, { MATCH: 1, MISSING_IN_ODOO: 6, CONFLICT: 2, CANCELLED: 1, AMBIGUOUS: 3 });
  const text = JSON.stringify(out);
  for (const banned of ['PRIVADO', 'privado@', '1014198033', 'clave_prueba', 'k_prueba', 's_prueba']) assert.ok(!text.includes(banned), banned);
});

test('paginacion: tope de paginas y lectura incompleta detienen la conciliacion', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ...SMOOBU_BOOKINGS[0], id: 180000000 + i }));
  await assert.rejects(readSmoobuWindow(fakeSmoobu(many, { pageSize: 2 }).client, window, { pageSize: 2, maxPages: 3 }), { code: 'SMOOBU_PAGINATION_LIMIT' });
  await assert.rejects(runReconcileIds({ smoobu: fakeSmoobu(SMOOBU_BOOKINGS, { totalItems: 99 }).client, odoo: fakeOdoo().client, window }), { code: 'SMOOBU_INCOMPLETE_READ' });
});

test('Odoo: llegar al tope de resultados detiene la lectura (nunca un informe parcial)', async () => {
  await assert.rejects(readOdooWindow(fakeOdoo().client, window, { ...LIMITS, odooSlots: 2 }), { code: 'ODOO_SLOT_LIMIT' });
});

test('el cliente Odoo rechaza escrituras antes de la red', async () => {
  const o = fakeOdoo();
  for (const m of ['create', 'write', 'unlink', 'run', 'action_confirm']) await assert.rejects(o.client.call('sale.order', m, {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  assert.equal(o.calls.length, 0);
});

test('codigo nuevo: no usa la peticion sin lista blanca ni nombra metodos de escritura', () => {
  for (const f of ['src/window.mjs', 'src/reference-parse.mjs', 'src/id-reconcile.mjs', 'src/reconcile-ids-run.mjs', 'scripts/reconcile-ids.mjs']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('_request('), `${f}: _request`);
    assert.ok(!/['"](create|write|unlink|run|action_confirm|button_confirm)['"]/.test(src), `${f}: metodo de escritura`);
    assert.ok(!/odoo-json2-(p0|recompute)-client/.test(src), `${f}: cliente con escritura`);
  }
});

test('workflow: reconcile-ids pasa las fechas por entorno (sin interpolarlas en el script) y no toca P0 ni recompute', () => {
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-diagnose.yml', import.meta.url), 'utf8');
  assert.ok(wf.includes('RECONCILE_FROM: ${{ inputs.from }}') && wf.includes('run: npm run --silent reconcile-ids'));
  assert.ok(!/run:.*inputs\.(from|to)/.test(wf));
  assert.ok(wf.includes('contents: read')); assert.ok(!wf.includes('schedule:'));
});
