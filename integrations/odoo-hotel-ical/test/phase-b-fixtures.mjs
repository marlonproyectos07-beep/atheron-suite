import { BookingAdapter, AirbnbAdapter } from '../src/adapter-contracts.mjs';
import { createMemoryJournal, createContinuousSyncRunner } from '../src/continuous-sync-runner.mjs';
import { createSnapshotStore } from '../src/snapshot-reconcile.mjs';
import { parseIcal } from '../src/ical-import.mjs';

export const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0',
  ...events.flatMap(({ uid, start = '20270110', end = '20270112', status, updated }) => [
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
    ...(status ? [`STATUS:${status}`] : []), ...(updated ? [`LAST-MODIFIED:${updated}`] : []),
    'END:VEVENT',
  ]), 'END:VCALENDAR'].join('\r\n');

export function fixtureSystem() {
  let now = '2027-01-01T00:00:00Z';
  const feeds = new Map();
  const otaBlocks = new Map();
  const writes = [];
  const alerts = [];
  const down = { booking: false, airbnb: false, odoo: false };
  const failOutboundOnce = { booking: false, airbnb: false };
  const mapping = Object.fromEntries(['AHS-201', 'AHS-202', 'AHS-203', 'AHS-301', 'AHS-302', 'AHS-CASA']
    .map((unit, index) => [unit, { odoo_unit_id: index + 1, external_listing_id: `FIXTURE-${unit}` }]));
  const blocks = new Map();
  const odoo = {
    async listBlocks() { if (down.odoo) throw new Error('ODOO_DOWN'); return [...blocks.values()]; },
    async applyBlock(event) {
      if (down.odoo) throw new Error('ODOO_DOWN');
      blocks.set(event.idempotency_key, { ...event });
      writes.push(['apply', event.idempotency_key]);
    },
    async releaseBlock(key) {
      if (down.odoo) throw new Error('ODOO_DOWN');
      blocks.delete(key); writes.push(['release', key]);
    },
  };
  const adapterFor = (source, Type) => new Type({
    async fetchReservations({ unit }) {
      if (down[source]) throw new Error(`${source.toUpperCase()}_DOWN`);
      return { ok: true, complete: true, ical: feeds.get(`${source}:${unit}`) ?? cal() };
    },
    async reconcile({ unit, desiredIcal }) {
      if (down[source] || failOutboundOnce[source]) {
        failOutboundOnce[source] = false;
        throw new Error(`${source.toUpperCase()}_OUTBOUND_DOWN`);
      }
      otaBlocks.set(`${source}:${unit}`, parseIcal(desiredIcal).map((event) => ({
        start: event.dtstart, end: event.dtend,
      })));
      return { status: 'ACCEPTED_FIXTURE' };
    },
    async fetchAvailability({ unit }) {
      if (down[source]) throw new Error(`${source.toUpperCase()}_DOWN`);
      return { complete: true, captured_at: now, blocked_windows: otaBlocks.get(`${source}:${unit}`) ?? [] };
    },
    async health() { return { status: down[source] ? 'DOWN' : 'UP' }; },
  });
  const adapters = { booking: adapterFor('booking', BookingAdapter), airbnb: adapterFor('airbnb', AirbnbAdapter) };
  const snapshotStore = createSnapshotStore();
  const journal = createMemoryJournal();
  const createRunner = ({ jobs = [], outboundTargets = [], cutoffAt = null, intervalMs = 20,
    staleAfterSeconds = 900 } = {}) =>
    createContinuousSyncRunner({ jobs: jobs.map((job) => ({ ...job, mapping })), outboundTargets,
      adapters, odoo, snapshotStore, journal, clock: () => now, intervalMs, staleAfterSeconds, cutoffAt,
      onAlert: (alert) => alerts.push(alert) });
  return { feeds, otaBlocks, blocks, writes, alerts, down, failOutboundOnce, mapping,
    odoo, adapters, snapshotStore, journal, createRunner, setNow: (value) => { now = value; } };
}
