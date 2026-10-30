import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOverbookingType, resolveWatchIds, readWatchlist, AUTHORIZED_WATCH_IDS, WATCH_STATUS } from '../src/overbooking-watch.mjs';
import { reconcileByIds } from '../src/id-reconcile.mjs';
import { runReconcileIds } from '../src/reconcile-ids-run.mjs';
import { toPublicReport, sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';

const window = resolveWindow({ RECONCILE_FROM: '2026-10-28', RECONCILE_TO: '2027-01-05' });
// forma real observada en ATH-DEV-052 (run #20); datos personales inventados para comprobar que no salen
const overbooked = { id: 160829171, type: 'OverBooking', arrival: '2027-01-04', departure: '2027-01-05', apartment: { id: 3557521, name: 'UNIDAD_PRIVADA' }, channel: { id: 7208046, name: 'Booking.com' }, 'reference-id': '5046108535', 'is-blocked-booking': false, 'guest-name': 'NOMBRE_PRIVADO', email: 'privado@example.invalid' };
const casa = { id: 160827596, type: 'reservation', arrival: '2027-01-04', departure: '2027-01-05', apartment: { id: 3557501 }, channel: { id: 7208051 }, 'reference-id': 'HMPRIVADOYBW', 'guest-name': 'OTRO_PRIVADO' };

/** Cliente Smoobu simulado a nivel de metodo: registra cada llamada. */
function stubSmoobu(byId = {}) {
  const calls = [];
  return {
    calls,
    getReservation: async (id) => {
      calls.push(['getReservation', id]);
      const v = byId[id];
      if (v instanceof Error) throw v;
      if (!v) { const e = new Error('SMOOBU_NOT_FOUND'); e.code = 'SMOOBU_NOT_FOUND'; e.status = 404; throw e; }
      return v;
    },
  };
}
const httpErr = (status, code) => Object.assign(new Error(code), { status, code });

test('tipo OverBooking: variantes reconocidas; reserva, cancelacion y nulos no', () => {
  for (const t of ['OverBooking', 'overbooking', 'Over-Booking', 'over booking', ' OVERBOOKING ']) assert.equal(isOverbookingType(t), true, t);
  for (const t of ['reservation', 'cancellation', 'modification of booking', '', null, undefined, 'overbookings']) assert.equal(isOverbookingType(t), false, String(t));
});

test('lista de vigilancia: por defecto solo 160829171; el entorno solo elige subconjunto autorizado', () => {
  assert.deepEqual([...AUTHORIZED_WATCH_IDS], [160829171]);
  assert.deepEqual(resolveWatchIds({}), [160829171]);
  assert.deepEqual(resolveWatchIds({ OVERBOOKING_WATCH_IDS: 'none' }), []);
  assert.deepEqual(resolveWatchIds({ OVERBOOKING_WATCH_IDS: '160829171,160829171' }), [160829171]);
  const code = (env, o) => { try { resolveWatchIds(env, o); return null; } catch (e) { return e.code; } };
  assert.equal(code({ OVERBOOKING_WATCH_IDS: '160827596' }), 'WATCH_ID_NOT_AUTHORIZED');
  assert.equal(code({ OVERBOOKING_WATCH_IDS: '160829171;rm' }), 'WATCH_ID_INVALID');
  assert.equal(code({ OVERBOOKING_WATCH_IDS: '1000001,1000002' }, { authorized: new Set([1000001, 1000002]), max: 1 }), 'WATCH_TOO_MANY');
});

test('lectura individual: OverBooking -> alerta de revision manual, sin accion automatica ni escrituras', async () => {
  const sm = stubSmoobu({ 160829171: overbooked });
  const w = await readWatchlist(sm, [160829171]);
  assert.deepEqual(sm.calls, [['getReservation', 160829171]]);
  const e = w.entries[0];
  assert.deepEqual([e.status, e.source, e.httpStatus, e.unit, e.arrival, e.departure, e.missingFromList], [WATCH_STATUS.OVERBOOKING_ALERT, 'GET_INDIVIDUAL', 200, '301', '2027-01-04', '2027-01-05', true]);
  assert.deepEqual([e.manualReview, e.automaticAction, e.writesEnabled], ['REVISION_MANUAL_SOBREVENTA', 'NINGUNA', false]);
  assert.deepEqual([w.requests, w.alerts, w.errors, w.notFound], [1, 1, 0, 0]);
  assert.ok(!JSON.stringify(w).includes('PRIVADO'));
});

test('errores: 404 -> NOT_FOUND, 500 -> READ_ERROR sin reintento; un error no detiene los demas; duplicados se leen una vez', async () => {
  const authorized = new Set([1000001, 1000002, 1000003]);
  const sm = stubSmoobu({ 1000002: httpErr(500, 'SMOOBU_UPSTREAM_UNAVAILABLE'), 1000003: { ...overbooked, id: 1000003 } });
  const ids = resolveWatchIds({ OVERBOOKING_WATCH_IDS: '1000001,1000002,1000003,1000002' }, { authorized });
  const w = await readWatchlist(sm, ids);
  assert.deepEqual(sm.calls.map((c) => c[1]), [1000001, 1000002, 1000003], 'una lectura por id, sin reintentos');
  assert.deepEqual(w.entries.map((e) => e.status), ['NOT_FOUND', 'READ_ERROR', 'OVERBOOKING_ALERT']);
  assert.deepEqual([w.entries[1].httpStatus, w.entries[1].code], [500, 'SMOOBU_UPSTREAM_UNAVAILABLE']);
  assert.deepEqual([w.alerts, w.errors, w.notFound], [1, 1, 1]);
});

test('si el id vigilado ya vino en el listado no se repite la lectura; reserva normal = NOT_OVERBOOKING', async () => {
  const sm = stubSmoobu({});
  const w = await readWatchlist(sm, [160827596], { listed: new Map([[160827596, casa]]) });
  assert.equal(sm.calls.length, 0);
  assert.deepEqual([w.entries[0].source, w.entries[0].status, w.entries[0].unit, w.entries[0].manualReview], ['LISTADO', 'NOT_OVERBOOKING', 'CASA', null]);
});

test('motor: un OverBooking que llegue en el listado se separa como alerta; no entra en veredictos ni propuestas', () => {
  const r = reconcileByIds({ bookings: [overbooked, casa], window, orders: [], slots: [] });
  assert.equal(r.counts.overbookingInList, 1); assert.equal(r.counts.otherTypes, 0);
  assert.deepEqual(r.overbookingInList.map((x) => [x.smoobuId, x.unit, x.manualReview, x.automaticAction, x.writesEnabled]), [[160829171, '301', 'REVISION_MANUAL_SOBREVENTA', 'NINGUNA', false]]);
  assert.ok(!r.perReservation.some((x) => x.smoobuId === 160829171));
  assert.equal(r.perReservation.find((x) => x.smoobuId === 160827596).verdict, 'MISSING_IN_ODOO');
  assert.equal(r.safety.proposals, 0); assert.equal(r.safety.writesEnabled, false); assert.equal(r.safety.releaseUnlocked, false);
});

test('extremo a extremo: listado sin la sobreventa + GET individual; solo GET y lecturas Odoo; informe publico enmascarado', async () => {
  const smoobuCalls = []; const odooCalls = [];
  const ok = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
  const sFetch = async (url, init) => {
    const u = new URL(url); smoobuCalls.push(`${init.method} ${u.pathname}`);
    if (u.pathname === '/api/reservations') return ok({ page: 1, page_count: 1, total_items: 1, bookings: [casa] });
    if (u.pathname === '/api/reservations/160829171') return ok(overbooked);
    return ok({}, 404);
  };
  const fields = { 'planning.slot': ['id', 'role_id', 'start_datetime', 'end_datetime', 'state'], 'sale.order': ['id', 'state', 'x_pms_reference', 'x_checkin', 'x_checkout'], 'sale.order.line': ['id', 'order_id', 'product_template_id'], 'product.template': ['id', 'default_code', 'planning_role_id'] };
  const oFetch = async (url, init) => {
    const [, , , model, method] = new URL(url).pathname.split('/'); odooCalls.push(`${init.method} ${model}/${method}`);
    if (method === 'fields_get') return ok(Object.fromEntries(fields[model].map((f) => [f, { type: 'char' }])));
    return ok([]);
  };
  const out = await runReconcileIds({
    smoobu: new SmoobuClient({ apiKey: 'k_prueba', apiSecret: 's_prueba', fetchImpl: sFetch }),
    odoo: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'prueba', apiKey: 'clave_prueba', fetchImpl: oFetch }),
    window, watchIds: resolveWatchIds({}),
  });
  assert.deepEqual(smoobuCalls, ['GET /api/reservations', 'GET /api/reservations/160829171']);
  assert.ok(odooCalls.every((c) => /^POST [a-z._]+\/(fields_get|search_read)$/.test(c)), odooCalls.join(','));
  assert.deepEqual([out.overbookingWatch.alerts, out.reads.smoobuWatch.requests], [1, 1]);
  const pub = toPublicReport(out); const text = JSON.stringify(pub);
  assert.deepEqual([pub.overbookingWatch.entries[0].smoobuRef, pub.overbookingWatch.entries[0].status, pub.overbookingWatch.entries[0].type], ['SM*...9171', 'OVERBOOKING_ALERT', 'OverBooking']);
  for (const banned of ['160829171', '160827596', '5046108535', 'HMPRIVADOYBW', 'PRIVADO', 'privado@', 'k_prueba', 's_prueba', 'clave_prueba']) assert.ok(!text.includes(banned), banned);
  assert.equal(assertPublicSafe(text, { identifiers: sensitiveValues(out) }).safe, true);
});

test('codigo de vigilancia: solo getReservation; ningun metodo de escritura ni cliente con escrituras', () => {
  const src = readFileSync(new URL('../src/overbooking-watch.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...new Set(src.match(/smoobu\.\w+\(/g))], ['smoobu.getReservation(']);
  assert.ok(!/odoo|_request\(|['"](create|write|unlink|run|cancel)['"]|p0-client|recompute-client/i.test(src.replace(/cancellation|CANCELLED|NINGUNA/g, '')));
});
