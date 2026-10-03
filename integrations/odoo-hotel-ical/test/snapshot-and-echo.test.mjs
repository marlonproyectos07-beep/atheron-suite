import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncLedger, exportCalendar, importCalendar } from '../src/ota-adapters.mjs';
import { createSnapshotStore, reconcileSnapshot } from '../src/snapshot-reconcile.mjs';
import { createGatewayOdooPort } from '../src/gateway-odoo-port.mjs';
import { buildPublicFeed, tokenMatches } from '../src/public-feed.mjs';
import { parseIcal } from '../src/ical-import.mjs';

const mapping = {
  booking: { 'AHS-302': { external_property_id: '16559325', external_listing_id: 'T-B-302', odoo_unit_id: 5 } },
  airbnb: { 'AHS-302': { external_property_id: null, external_listing_id: 'T-A-302', odoo_unit_id: 5 } },
};
const ev = (uid, start, end) => ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, 'END:VEVENT'];
const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const A1 = ev('a-1@airbnb.test', '20270110', '20270112');
const A2 = ev('a-2@airbnb.test', '20270201', '20270203');
const B1 = ev('b-1@booking.test', '20270301', '20270303');

function fakeOdoo() {
  const blocks = new Map(); const writes = [];
  return { blocks, writes,
    async listBlocks() { return [...blocks.values()]; },
    async applyBlock(r) { blocks.set(r.idempotency_key, { ...r }); writes.push(['apply', r.idempotency_key]); },
    async releaseBlock(k) { blocks.delete(k); writes.push(['release', k]); } };
}
function rig() {
  const odoo = fakeOdoo(); const ledger = createSyncLedger(); const snapshotStore = createSnapshotStore(); const audit = [];
  const run = (source, feed, now, extra = {}) => reconcileSnapshot({
    feed, source, canonical_unit_id: 'AHS-302', mapping: mapping[source], odoo, ledger, snapshotStore, now,
    audit: { record: (a) => audit.push(a) }, ...extra });
  return { odoo, snapshotStore, audit, run };
}
const ok = (ical) => ({ ok: true, ical });
const releases = (odoo) => odoo.writes.filter((w) => w[0] === 'release').length;

test('A: una sola ausencia no libera', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1, A2)), 't1');
  const out = await r.run('airbnb', ok(cal(A2)), 't2');
  assert.equal(out.pending.length, 1); assert.equal(releases(r.odoo), 0); assert.equal(r.odoo.blocks.size, 2);
  const entry = (await r.snapshotStore.list('airbnb', 'AHS-302')).find((e) => e.external_uid === 'a-1@airbnb.test');
  assert.equal(entry.state, 'MISSING_PENDING'); assert.equal(entry.missing_count, 1); assert.equal(entry.first_seen_at, 't1');
});

test('B: dos ausencias validas consecutivas liberan solo ese bloqueo', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1, A2)), 't1');
  await r.run('airbnb', ok(cal(A2)), 't2');
  const out = await r.run('airbnb', ok(cal(A2)), 't3');
  assert.equal(out.released.length, 1); assert.equal(releases(r.odoo), 1); assert.equal(r.odoo.blocks.size, 1);
  assert.equal([...r.odoo.blocks.values()][0].check_in, '2027-02-01');
  assert.ok(r.audit.some((a) => a.result === 'RELEASED_BY_DISAPPEARANCE'));
});

test('C: error, timeout, feed invalido o vacio inesperado no incrementan missing_count', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1)), 't1');
  for (const bad of [{ ok: false }, { ok: true, ical: 'not ical' }, { ok: true, ical: '' }, ok(cal())]) {
    const out = await r.run('airbnb', bad, 't2');
    assert.match(out.status, /FEED_ERROR_NO_CHANGE|EMPTY_FEED_HELD/);
  }
  const [entry] = await r.snapshotStore.list('airbnb', 'AHS-302');
  assert.equal(entry.missing_count, 0); assert.equal(entry.state, 'ACTIVE'); assert.equal(releases(r.odoo), 0);
});

test('C2: un error entre dos ausencias no cuenta como segunda lectura', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1, A2)), 't1');
  await r.run('airbnb', ok(cal(A2)), 't2');
  await r.run('airbnb', { ok: false }, 't3');
  const afterError = (await r.snapshotStore.list('airbnb', 'AHS-302')).find((e) => e.external_uid === 'a-1@airbnb.test');
  assert.equal(afterError.missing_count, 0);
  assert.equal(afterError.state, 'ACTIVE');
  const firstAfterError = await r.run('airbnb', ok(cal(A2)), 't4');
  assert.equal(firstAfterError.pending.length, 1);
  assert.equal(releases(r.odoo), 0);
  const secondAfterError = await r.run('airbnb', ok(cal(A2)), 't5');
  assert.equal(secondAfterError.released.length, 1);
  assert.equal(releases(r.odoo), 1);
});

test('C3: feed vacio inesperado rompe la secuencia de ausencias', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1, A2)), 't1');
  await r.run('airbnb', ok(cal(A2)), 't2');
  assert.equal((await r.run('airbnb', ok(cal()), 't3')).status, 'EMPTY_FEED_HELD');
  const next = await r.run('airbnb', ok(cal(A2)), 't4');
  assert.equal(next.pending.length, 1);
  assert.equal(releases(r.odoo), 0);
});

test('D: el evento reaparece antes del segundo ciclo y se conserva', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1, A2)), 't1');
  await r.run('airbnb', ok(cal(A2)), 't2');
  await r.run('airbnb', ok(cal(A1, A2)), 't3');
  await r.run('airbnb', ok(cal(A2)), 't4');
  const entry = (await r.snapshotStore.list('airbnb', 'AHS-302')).find((e) => e.external_uid === 'a-1@airbnb.test');
  assert.equal(entry.missing_count, 1); assert.equal(entry.first_seen_at, 't1');
  assert.equal(releases(r.odoo), 0); assert.equal(r.odoo.blocks.size, 2);
});

test('E: Airbnb nunca libera Booking y viceversa', async () => {
  const r = rig();
  await r.run('booking', ok(cal(B1)), 't1');
  await r.run('airbnb', ok(cal(A1)), 't1');
  await r.run('airbnb', ok(cal(A2)), 't2'); await r.run('airbnb', ok(cal(A2)), 't3');
  assert.equal(releases(r.odoo), 1);
  assert.ok([...r.odoo.blocks.values()].some((b) => b.source === 'booking' && b.check_in === '2027-03-01'));
  await r.run('booking', ok(cal(ev('b-9@booking.test', '20270501', '20270502'))), 't4');
  await r.run('booking', ok(cal(ev('b-9@booking.test', '20270501', '20270502'))), 't5');
  assert.ok([...r.odoo.blocks.values()].some((b) => b.source === 'airbnb' && b.check_in === '2027-02-01'));
  assert.ok(![...r.odoo.blocks.values()].some((b) => b.check_in === '2027-03-01'));
});

test('bloqueo sustituido en Odoo no se libera', async () => {
  const r = rig();
  await r.run('airbnb', ok(cal(A1)), 't1');
  const [key] = [...r.odoo.blocks.keys()];
  r.odoo.blocks.set(key, { ...r.odoo.blocks.get(key), source: 'odoo' });
  await r.run('airbnb', ok(cal(A2)), 't2'); const out = await r.run('airbnb', ok(cal(A2)), 't3');
  assert.equal(out.kept.length, 1); assert.equal(releases(r.odoo), 0);
});

async function seeded() {
  const odoo = fakeOdoo(); const ledger = createSyncLedger();
  await importCalendar({ ical: cal(B1), source: 'booking', canonical_unit_id: 'AHS-302', mapping: mapping.booking, odoo, ledger });
  await importCalendar({ ical: cal(A1), source: 'airbnb', canonical_unit_id: 'AHS-302', mapping: mapping.airbnb, odoo, ledger });
  odoo.blocks.set('manual-1', { canonical_unit_id: 'AHS-302', check_in: '2027-06-01', check_out: '2027-06-03', status: 'blocked', source: 'odoo', idempotency_key: 'manual-1' });
  odoo.blocks.set('casa-b', { canonical_unit_id: 'AHS-CASA', check_in: '2027-08-01', check_out: '2027-08-02', status: 'blocked', source: 'booking', idempotency_key: 'casa-b' });
  return { odoo, ledger };
}
const starts = (ical) => parseIcal(ical).map((e) => e.dtstart);
const window = { canonical_unit_id: 'AHS-302', from: '2027-01-01', to: '2027-12-31', stamp: '2027-01-01' };

test('eco: bloqueo Booking ausente del feed Booking y presente en el de Airbnb', async () => {
  const { odoo, ledger } = await seeded();
  const toBooking = starts(await exportCalendar({ ...window, odoo, ledger, destination_channel: 'booking' }));
  const toAirbnb = starts(await exportCalendar({ ...window, odoo, ledger, destination_channel: 'airbnb' }));
  assert.ok(!toBooking.includes('2027-03-01')); assert.ok(toAirbnb.includes('2027-03-01'));
});

test('eco: bloqueo Airbnb ausente del feed Airbnb y presente en el de Booking', async () => {
  const { odoo, ledger } = await seeded();
  const toBooking = starts(await exportCalendar({ ...window, odoo, ledger, destination_channel: 'booking' }));
  const toAirbnb = starts(await exportCalendar({ ...window, odoo, ledger, destination_channel: 'airbnb' }));
  assert.ok(toBooking.includes('2027-01-10')); assert.ok(!toAirbnb.includes('2027-01-10'));
});

test('eco: bloqueo Odoo/manual y efecto CASA presentes en ambos, sin duplicados', async () => {
  const { odoo, ledger } = await seeded();
  for (const destination_channel of ['booking', 'airbnb']) {
    const ical = await exportCalendar({ ...window, odoo, ledger, destination_channel });
    const s = starts(ical); const uids = parseIcal(ical).map((e) => e.uid);
    assert.ok(s.includes('2027-06-01')); assert.ok(s.includes('2027-08-01'));
    assert.equal(new Set(uids).size, uids.length);
  }
});

test('puerto Gateway: falla cerrado si la operacion OTA no existe', async () => {
  const port = createGatewayOdooPort({ client: { availability: async () => ({ ok: true }) } });
  await assert.rejects(port.listBlocks(), (e) => e.code === 'GATEWAY_OPERATION_UNSUPPORTED');
  await assert.rejects(port.releaseBlock('k'), (e) => e.code === 'GATEWAY_OPERATION_UNSUPPORTED');
  await assert.rejects(port.snapshotStore.list('airbnb', 'AHS-302'), (e) => e.code === 'GATEWAY_OPERATION_UNSUPPORTED');
});

test('puerto Gateway: mapea operaciones y propaga error del Gateway', async () => {
  const calls = [];
  const client = {
    ota_blocks_list: async () => ({ ok: true, data: { blocks: [{ canonical_unit_id: 'AHS-302', check_in: '2027-01-10', check_out: '2027-01-12', source: 'airbnb', idempotency_key: 'k1' }] } }),
    ota_block_apply: async (p) => { calls.push(p); return { ok: true, data: {} }; },
    ota_block_release: async () => ({ ok: false, error: { code: 'NOT_FOUND' } }),
  };
  const port = createGatewayOdooPort({ client });
  assert.equal((await port.listBlocks())[0].status, 'blocked');
  await port.applyBlock({ idempotency_key: 'k2', source: 'booking', canonical_unit_id: 'AHS-302', odoo_unit_id: 5, external_reservation_id: 'u', check_in: '2027-02-01', check_out: '2027-02-02', correlation_id: 'c' });
  assert.equal(calls[0].external_uid, 'u');
  await assert.rejects(port.releaseBlock('k1'), (e) => e.code === 'NOT_FOUND');
});

test('puerto Gateway LIVE: extrae datos del sobre 1967 y falla cerrado ante error interno', async () => {
  const port = createGatewayOdooPort({ client: {
    ota_blocks_list: async () => ({ ok: true, data: { ok: true, data: { blocks: [
      { canonical_unit_id: 'AHS-302', check_in: '2027-01-10', check_out: '2027-01-12', source: 'odoo' },
    ] } } }),
    ota_snapshot_list: async () => ({ ok: true, data: { ok: false, error_code: 'NOT_FOUND' } }),
  } });
  assert.equal((await port.listBlocks())[0].canonical_unit_id, 'AHS-302');
  await assert.rejects(port.snapshotStore.list('booking', 'AHS-302'), (e) => e.code === 'NOT_FOUND');
});

test('feed publico: sin PII ni motivos internos, UID estable, falla cerrado', async () => {
  const { odoo } = await seeded();
  const a = await buildPublicFeed({ unit: '302', channel: 'booking', odoo, today: '2027-01-01' });
  const b = await buildPublicFeed({ unit: '302', channel: 'booking', odoo, today: '2027-01-01' });
  assert.equal(a, b); assert.match(a, /^BEGIN:VCALENDAR/); assert.ok(!/own_booking|casa_completa|https?:|X-ATHERON/i.test(a));
  assert.ok(parseIcal(a).every((e) => e.summary === 'Not available'));
  await assert.rejects(buildPublicFeed({ unit: '302', channel: 'booking', today: '2027-01-01', odoo: { listBlocks: async () => { throw new Error('down'); } } }));
  await assert.rejects(buildPublicFeed({ unit: '999', channel: 'booking', odoo, today: '2027-01-01' }));
  assert.equal(tokenMatches('', ''), false); assert.equal(tokenMatches('abc', 'abd'), false); assert.equal(tokenMatches('abc', 'abc'), true);
});
