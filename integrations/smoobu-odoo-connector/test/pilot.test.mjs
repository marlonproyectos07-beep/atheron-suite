import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readPilotState, selectCandidates, predictCreate, feedMembership, availabilityFor, toPilotSlot, assertNoDestructiveOps, FICTIONAL_RESERVATION_ID } from '../src/pilot-dryrun.mjs';
import { echoVerdict, filterBookings } from '../src/echo-guard.mjs';
import { evaluateOperation, evaluateAll, FACTS } from '../src/authorization-matrix.mjs';
import { reconcile, defaultNightWindow } from '../src/reconcile.mjs';
import { unitForSmoobuApartment, UNITS } from '../src/unit-map.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';

const H = 3600000;
const roles = [
  { id: 69, name: 'Casa Completa', x_casa: 'La Magia', isRoomOffer: true, resourceIds: [79] },
  { id: 29, name: '201 Hab', x_casa: 'La Magia', isRoomOffer: true, resourceIds: [28] },
  { id: 37, name: '301 Hab', x_casa: 'La Magia', isRoomOffer: true, resourceIds: [31] },
];
const win = (n) => defaultNightWindow(n);
const mk = (id, roleId, resourceId, n, extra = {}) => ({ id, roleId, resourceId, start: win(n)[0], end: win(n)[1], state: 'published', blockRef: null, hasNobeds: false, hasSaleLine: false, hasGuest: false, ...extra });
const state = (slots, extra = {}) => ({ roles, slots, recurrence: [{ pickup_time: 15, return_time: 11 }], offers: [{ id: 5, resourceIds: [31] }, { id: 6, resourceIds: [79, 28, 31] }], availability: [], leaves: [], feeds: [], ...extra });

test('replica del feed iCal (1654): habitacion publicada entra en su .ics y en el de Casa; borrador no; espejo solo en el de Casa', () => {
  const room = mk(1, 37, 31, '2026-09-01'); const mirror = mk(2, 69, 79, '2026-09-01', { blockRef: '1' }); const draft = mk(3, 37, 31, '2026-09-05', { state: 'draft' });
  const f = feedMembership([room, mirror, draft], roles);
  assert.deepEqual(f[37], [1]); assert.deepEqual(f[69], [1, 2]); assert.deepEqual(f[29], []);
});

test('replica de disponibilidad (1493): ignora state; noches [inicio, fin); hojas de cierre restan unidades', () => {
  const s = [mk(1, 37, 31, '2026-09-01', { state: 'draft' })];
  const a = availabilityFor({ slots: s, offers: [{ id: 5, resourceIds: [31] }], dates: ['2026-09-01', '2026-09-02'] });
  assert.deepEqual(a.map((x) => [x.date, x.booked]), [['2026-09-01', 1], ['2026-09-02', 0]]);
  const l = availabilityFor({ slots: s, offers: [{ id: 5, resourceIds: [31] }], leaves: { 31: new Set(['2026-09-01']) }, dates: ['2026-09-01'] });
  assert.deepEqual([l[0].total, l[0].booked], [0, 0]);
});

test('PREDICCION P0 (borrador, noche pasada libre): sin espejo, sin iCal, sin ventas; solo 12 y 22', () => {
  const p = predictCreate({ state: state([]), night: '2026-09-10', variant: 'draft' });
  assert.equal(p.created.length, 1); assert.deepEqual(p.feedsChanged, []); assert.equal(p.ical.reachesPublicFeedWithinMinutes, null);
  assert.deepEqual(p.triggers.filter((t) => t.fires).map((t) => t.automation), [12, 22]);
  assert.deepEqual(p.sideEffects, { saleOrders: 0, partners: 0, emails: 0, webhooksFromOdoo: 0 });
  assert.equal(p.key, `SMOOBU-${FICTIONAL_RESERVATION_ID}:301:2026-09-10`); assert.notEqual(FICTIONAL_RESERVATION_ID, 161419736);
  assert.match(p.echoWithSmoobu, /no aplica/);
});

test('PREDICCION P1 (publicado): espejo de Casa, iCal de 301 y Casa cambian en <= 5 min, clave visible, eco no descartable', () => {
  const p = predictCreate({ state: state([]), night: '2026-09-10', variant: 'published' });
  assert.equal(p.created.length, 2); assert.equal(p.mirror.created, true);
  assert.deepEqual(p.feedsChanged.map((f) => f.unit).sort(), ['301', 'CASA']);
  assert.equal(p.ical.reachesPublicFeedWithinMinutes, 5); assert.equal(p.ical.keyVisibleInPublicIcal, true);
  assert.match(p.ical.summaryWouldShow, /ODOO/); assert.match(p.echoWithSmoobu, /NO DESCARTABLE/);
  const gp = predictCreate({ state: state([]), night: '2026-09-10', variant: 'published', guestPlaceholder: true });
  assert.equal(gp.ical.keyVisibleInPublicIcal, false);
  const gap = predictCreate({ state: state([mk(9, 69, 79, '2026-09-10', { blockRef: '8', start: win('2026-09-10')[0], end: win('2026-09-10')[0] + 8 * H })]), night: '2026-09-10', variant: 'published' });
  assert.equal(gap.mirror.created, false); assert.equal(gap.mirror.gaps.length, 1);
});

test('PREDICCION con noche ocupada en otra habitacion: el espejo se omite y no se crea nada mas', () => {
  const p = predictCreate({ state: state([mk(1, 29, 28, '2026-09-10'), mk(2, 69, 79, '2026-09-10', { blockRef: '1' })]), night: '2026-09-10', variant: 'published' });
  assert.equal(p.mirror.created, false); assert.deepEqual(p.mirror.gaps, []);
  assert.deepEqual(p.availabilityChange.map((a) => a.offerId), [5, 6]);
});

test('candidatos: noche pasada libre vs futura comercializable; fechas ocupadas o con cierre se excluyen', () => {
  const today = '2026-10-26';
  const st = state([mk(1, 29, 28, '2026-10-20')], { availability: [{ date: '2026-11-05', offerId: 5, total: 1, booked: 0 }] });
  st.leaves = [{ resourceId: 31, calendarId: null, from: '2026-10-21 00:00:00', to: '2026-10-21 23:00:00' }];
  const c = selectCandidates({ state: st, today, max: 500 });
  assert.ok(c.past.length && c.past.every((x) => x.past && x.free && !x.hasLeave));
  assert.ok(!c.past.some((x) => ['2026-10-20', '2026-10-21'].includes(x.night)));
  assert.equal(c.future.find((x) => x.night === '2026-11-05').commerciallySellable, true);
  assert.equal(c.future.find((x) => x.night === '2026-11-06').commerciallySellable, false);
});

test('el ensayo SOLO llama a fieldsGet/searchRead: cliente real con fetch simulado rechaza cualquier mutacion', async () => {
  const methods = new Set(); const urls = [];
  const client = new OdooJson2Client({ baseUrl: 'https://o.test', database: 'db', apiKey: 'k', fetchImpl: async (u, i) => {
    urls.push(u); const m = u.split('/').pop(); methods.add(m);
    const body = JSON.parse(i.body);
    if (m === 'fields_get') return { ok: true, json: async () => ({ id: {}, name: {}, role_id: {}, resource_id: {}, start_datetime: {}, end_datetime: {}, state: {}, x_casa: {}, x_is_a_room_offer: {}, resource_ids: {}, x_resource_ids: {}, x_date: {}, x_stay_offer_id: {}, x_total_units: {}, x_booked: {}, x_to_recompute: {}, tz: {}, pickup_time: {}, return_time: {}, date_from: {}, date_to: {}, calendar_id: {} }) };
    return { ok: true, json: async () => (u.includes('/planning.role/') ? [{ id: 37, name: '301', x_casa: 'c', x_is_a_room_offer: true, resource_ids: [31] }] : u.includes('sale.temporal') ? [{ id: 1, name: 'n', pickup_time: 15, return_time: 11 }] : []) };
  } });
  const r = await readPilotState({ odoo: client, today: '2026-10-26' });
  assert.ok([...methods].every((m) => m === 'fields_get' || m === 'search_read'), [...methods].join());
  assert.ok(!urls.some((u) => /\/(create|write|unlink|action|button|run|trigger)/.test(u)));
  assert.ok(r.steps.every((s) => s.status === 'OK'), JSON.stringify(r.steps.filter((s) => s.status !== 'OK')));
  await assert.rejects(client.call('planning.slot', 'create', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  await assert.rejects(client.call('ir.actions.server', 'run', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  await assert.rejects(client.call('ir.cron', 'method_direct_trigger', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
});

test('analisis estatico del modulo del ensayo: ninguna llamada a Odoo fuera de searchRead/fieldsGet', () => {
  for (const f of ['pilot-dryrun.mjs', 'echo-guard.mjs', 'authorization-matrix.mjs']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const calls = new Set([...src.matchAll(/\bodoo\.(\w+)\(/g)].map((m) => m[1]));
    for (const c of calls) assert.ok(['searchRead', 'fieldsGet'].includes(c), `${f}: odoo.${c}`);
    assert.ok(!/\.(create|write|unlink)\(['"]/.test(src) && !/execute_kw|\/jsonrpc|\.run\(\)|_trigger\(\)/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), f);
  }
});

test('anti-eco: bloqueos, marcador ODOO, canales de calendario, coincidencia exacta con turno ajeno y reimportacion', () => {
  const ctx = { ownReservationIds: new Set([7]), unitForApartment: unitForSmoobuApartment,
    odooSlots: [{ id: 50, roleId: 37, start: defaultNightWindow('2026-11-10')[0], end: defaultNightWindow('2026-11-10')[1], key: null }] };
  const apt = { id: 3557521 };
  const v = (b) => echoVerdict({ id: 1, apartment: apt, arrival: '2026-11-20', departure: '2026-11-21', ...b }, ctx);
  assert.equal(v({ 'is-blocked-booking': true }).reason, 'BLOCKED_ENTRY');
  assert.equal(v({ 'guest-name': 'ODOO 301 - X' }).reason, 'ODOO_MARKER');
  assert.equal(v({ channel: { name: 'iCal import' } }).reason, 'CALENDAR_CHANNEL');
  assert.equal(v({ id: 7 }).reason, 'ALREADY_IMPORTED');
  assert.equal(v({ arrival: '2026-11-10', departure: '2026-11-11' }).reason, 'MATCHES_EXISTING_FOREIGN_SLOT');
  assert.equal(v({}).reason, 'PASS');
  const f = filterBookings([{ id: 1, apartment: apt, arrival: '2026-11-20', departure: '2026-11-21' }, { id: 2, apartment: apt, arrival: '2026-11-22', departure: '2026-11-23', 'is-blocked-booking': true }], ctx);
  assert.deepEqual([f.pass.length, f.ignored.map((i) => i.reason)], [1, ['BLOCKED_ENTRY']]);
});

test('conciliacion nunca propone borrar ni liberar espejos compartidos; toda liberacion queda bloqueada', () => {
  const key = `SMOOBU-1:301:2026-11-10`;
  const own = { id: 10, roleId: 37, start: win('2026-11-10')[0], end: win('2026-11-10')[1], key, active: true };
  const sharedMirror = { id: 20, roleId: 69, start: win('2026-11-10')[0], end: win('2026-11-10')[1], key: null, active: true, mirror: true, blockRef: '10' };
  const other = { id: 21, roleId: 29, start: win('2026-11-10')[0], end: win('2026-11-10')[1], key: null, active: true };
  const r = reconcile({ bookings: [{ id: 1, apartment: { id: 3557521 }, arrival: '2026-11-10', departure: '2026-11-11', type: 'cancellation' }], slots: [own, sharedMirror, other] });
  assert.ok(assertNoDestructiveOps(r.proposals));
  assert.deepEqual(r.proposals.map((p) => p.slotId), [10]);
  assert.deepEqual(r.proposals[0].dependentMirrors.map((m) => [m.slotId, m.sharedWith]), [[20, [21]]]);
  assert.ok(!r.proposals.some((p) => p.slotId === 20));
  assert.throws(() => assertNoDestructiveOps([{ op: 'DELETE_SLOT', status: 'PENDING_APPROVAL', writesEnabled: false }]), { code: 'DESTRUCTIVE_OR_UNBLOCKED_OPERATION' });
  assert.throws(() => assertNoDestructiveOps([{ op: 'RELEASE_SLOT', status: 'PENDING_APPROVAL', writesEnabled: false }]), { code: 'DESTRUCTIVE_OR_UNBLOCKED_OPERATION' });
});

test('matriz de autorizaciones: P0 REFUTADO por la observacion real; P1/P2 NO seguros; resto bloqueado', () => {
  const m = Object.fromEntries(evaluateAll().map((o) => [o.id, o.verdict]));
  assert.equal(m.P0, 'NO_SEGURO');
  assert.equal(m.P1, 'PILOTO_PRODUCTIVO_NO_SEGURO'); assert.equal(m.P2, 'PILOTO_PRODUCTIVO_NO_SEGURO');
  assert.deepEqual([m.P3, m.P4, m.P5, m.P6, m.P7, m.P8], ['BLOQUEADA', 'BLOQUEADA', 'INEFICAZ_Y_BLOQUEADA', 'SOLO_MANUAL_NUNCA_AUTOMATICA', 'PROHIBIDA', 'BLOQUEADA']);
  // los veredictos dependen de los hechos
  assert.equal(evaluateOperation('P1', { ...FACTS, cron147CanBeDisabledSelectively: true }).verdict, 'REQUIERE_PRUEBA_EN_STAGING');
  assert.equal(evaluateOperation('P0', { ...FACTS, draftSlotFiresMirrorsOrIcal: false, draftSlotStaysDraftOnCreate: true }).verdict, 'AUTORIZABLE_CON_APROBACION_EXPRESA');
  assert.ok(evaluateOperation('P0', { ...FACTS, draftSlotFiresMirrorsOrIcal: false, draftSlotStaysDraftOnCreate: true }).conditions.some((c) => /autorizacion expresa/.test(c)));
});
