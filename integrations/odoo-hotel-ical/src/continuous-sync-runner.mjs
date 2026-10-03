/** PHASE B local: runner con puertos inyectados; no URLs, red ni credenciales. */
import { createHash } from 'node:crypto';
import { parseIcal } from './ical-import.mjs';
import { canonicalFromIcal } from './canonical-event.mjs';
import { createSyncLedger, exportCalendar, preventLoop } from './ota-adapters.mjs';
import { reconcileSnapshot } from './snapshot-reconcile.mjs';
import { reconcileInventories, RECONCILIATION } from './reconciliation.mjs';
import { classifySyncOutcome } from './conflict-engine.mjs';
import { summarizeCoverage } from './phase-a-inventory.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const keyFor = (job) => `${job.source}:${job.unit}`;
const asIcsDate = (date) => date.replaceAll('-', '');
const asIcsInstant = (instant) => instant.replaceAll('-', '').replaceAll(':', '');

export function createMemoryJournal() {
  const pending = new Map();
  const versions = new Map();
  const quarantined = [];
  return Object.freeze({
    enqueue(scope, batch) {
      const id = sha(`${scope}:${batch.complete}:${batch.ical}`);
      const queue = pending.get(scope) ?? [];
      if (!queue.some((entry) => entry.id === id)) queue.push({ ...batch, id });
      pending.set(scope, queue);
      return id;
    },
    list: (scope) => (pending.get(scope) ?? []).map((entry) => ({ ...entry })),
    ack(scope, id) { pending.set(scope, (pending.get(scope) ?? []).filter((entry) => entry.id !== id)); },
    versionFor: (idempotencyKey) => versions.get(idempotencyKey) ?? null,
    setVersion(idempotencyKey, version) { versions.set(idempotencyKey, version); },
    quarantine(batch, reason) { quarantined.push({ scope: batch.scope, id: batch.id, reason }); },
    quarantined: () => quarantined.map((entry) => ({ ...entry })),
  });
}

/** Descarta SUMMARY/DESCRIPTION; conserva UID tecnico sensible solo en memoria local. */
export function sanitizeIcalBatch(ical, job, receivedAt, { complete = false } = {}) {
  if (typeof ical !== 'string' || !ical.includes('BEGIN:VCALENDAR') || !ical.includes('END:VCALENDAR')) {
    throw new Error('INVALID_ICAL_FEED');
  }
  const linesIn = ical.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  if (linesIn[0] !== 'BEGIN:VCALENDAR' || linesIn.at(-1) !== 'END:VCALENDAR') throw new Error('INVALID_ICAL_FEED');
  let eventDepth = 0;
  for (const line of linesIn) {
    if (line === 'BEGIN:VEVENT') eventDepth += 1;
    if (line === 'END:VEVENT') eventDepth -= 1;
    if (eventDepth < 0 || eventDepth > 1) throw new Error('INVALID_ICAL_FEED');
  }
  if (eventDepth !== 0) throw new Error('INVALID_ICAL_FEED');
  const raw = parseIcal(ical).filter((event) => !preventLoop(event));
  const events = raw.map((event) => canonicalFromIcal(event, {
    source: job.source, canonical_unit_id: job.unit, mapping: job.mapping, received_at: receivedAt,
  }));
  const byKey = new Map();
  for (const event of events) {
    const signature = `${event.START}|${event.END}|${event.STATUS}|${event.UPDATED_AT ?? ''}`;
    const prior = byKey.get(event.IDEMPOTENCY_KEY);
    if (prior && prior !== signature) throw new Error('CONFLICTING_DUPLICATE_UID');
    byKey.set(event.IDEMPOTENCY_KEY, signature);
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
  for (const event of events) {
    if (/[\r\n]/.test(event.EXTERNAL_REF)) throw new Error('INVALID_EVENT_UID');
    lines.push('BEGIN:VEVENT', `UID:${event.EXTERNAL_REF}`,
      `DTSTART;VALUE=DATE:${asIcsDate(event.START)}`, `DTEND;VALUE=DATE:${asIcsDate(event.END)}`);
    if (event.STATUS === 'CANCELLED') lines.push('STATUS:CANCELLED');
    if (event.UPDATED_AT) lines.push(`LAST-MODIFIED:${asIcsInstant(event.UPDATED_AT)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return Object.freeze({ ical: lines.join('\r\n'), events, received_at: receivedAt, complete: complete === true });
}

function utcDay(instant) { return instant.slice(0, 10); }
function plusDays(day, count) {
  const end = new Date(`${day}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + count);
  return end.toISOString().slice(0, 10);
}

export function createContinuousSyncRunner({
  jobs, outboundTargets = [], adapters, odoo, snapshotStore, journal, clock = () => new Date().toISOString(),
  intervalMs = 300_000, horizonDays = 30, staleAfterSeconds = 900, cutoffAt = null, audit, onAlert,
}) {
  if (!Array.isArray(jobs) || !Array.isArray(outboundTargets) || !odoo || !snapshotStore || !journal) {
    throw new Error('RUNNER_PORTS_REQUIRED');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 1 || !Number.isInteger(horizonDays) || horizonDays < 1 ||
      !Number.isInteger(staleAfterSeconds) || staleAfterSeconds < 1) {
    throw new Error('INVALID_POLLING_INTERVAL');
  }
  for (const job of jobs) {
    if (!['booking', 'airbnb'].includes(job.source) || !job.unit || !job.mapping?.[job.unit]) throw new Error('INVALID_SYNC_JOB');
  }
  let timer = null;
  let running = false;
  const ledger = createSyncLedger();
  const metrics = {
    last_successful_sync: {}, last_event_received: null, sync_lag_seconds: {},
    conflict_count: 0, new_overbooking_count: 0, stale_event_count: 0,
    at_risk_units: summarizeCoverage().AT_RISK, adapter_health: {},
  };
  const alerts = [];
  function alert(severity, code, scope) {
    const row = Object.freeze({ severity, code, scope, at: clock() });
    alerts.push(row);
    onAlert?.(row);
    audit?.record?.({ operation: 'continuousSync', result: code, severity, scope });
  }

  async function processPending(job) {
    const scope = keyFor(job);
    const outcomes = [];
    for (const batch of journal.list(scope)) {
      const stale = batch.events.some((event) => {
        const saved = journal.versionFor(event.IDEMPOTENCY_KEY);
        return saved && (!event.UPDATED_AT || Date.parse(event.UPDATED_AT) < Date.parse(saved));
      });
      if (stale) {
        journal.quarantine({ ...batch, scope }, 'STALE_EVENT');
        journal.ack(scope, batch.id);
        metrics.stale_event_count += 1;
        alert('P1', 'STALE_EVENT', scope);
        outcomes.push({ status: 'STALE_EVENT' });
        continue;
      }
      let result;
      try {
        result = await reconcileSnapshot({
          feed: { ok: true, ical: batch.ical }, source: job.source, canonical_unit_id: job.unit,
          mapping: job.mapping, odoo, ledger, snapshotStore, now: batch.received_at, audit,
          allow_empty: batch.complete,
        });
        metrics.adapter_health.odoo = 'UP';
      } catch (error) {
        if (error && typeof error === 'object') error.sync_layer = 'BACKEND';
        throw error;
      }
      for (let index = 0; index < (result.imported?.results?.length ?? 0); index += 1) {
        const operation = result.imported.results[index];
        if (operation?.status !== 'CONFLICT') continue;
        metrics.conflict_count += 1;
        const event = batch.events[index];
        const decision = classifySyncOutcome({ status: 'CONFLICT', event, cutoffAt });
        if (decision.code === 'NEW_OVERBOOKING') metrics.new_overbooking_count += 1;
        alert(decision.severity, decision.code, scope);
      }
      if (result.status === 'OK') {
        for (const event of batch.events) {
          if (event.UPDATED_AT) journal.setVersion(event.IDEMPOTENCY_KEY, event.UPDATED_AT);
        }
        metrics.last_successful_sync[scope] = clock();
      }
      journal.ack(scope, batch.id);
      outcomes.push(result);
    }
    return outcomes;
  }

  async function inbound(job) {
    const scope = keyFor(job);
    const adapter = adapters?.[job.source];
    try {
      await processPending(job);
      const response = await adapter.fetchReservations({ unit: job.unit });
      if (!response?.ok) throw new Error('ADAPTER_FETCH_FAILED');
      const batch = sanitizeIcalBatch(response.ical, job, clock(), { complete: response.complete });
      journal.enqueue(scope, batch);
      if (batch.events.length > 0) metrics.last_event_received = clock();
      const outcomes = await processPending(job);
      metrics.adapter_health[job.source] = 'UP';
      return { scope, outcomes };
    } catch (error) {
      if (error?.code === 'CONFLICT') {
        metrics.conflict_count += 1;
        alert('CRITICAL', 'UNCLASSIFIED_CONFLICT', scope);
      } else if (error?.sync_layer === 'BACKEND') {
        metrics.adapter_health.odoo = 'DOWN';
        alert('P1', 'SYNC_BACKEND_DOWN', scope);
      } else {
        metrics.adapter_health[job.source] = 'DOWN';
        alert('P1', error?.code === 'UNSUPPORTED_OPERATION' ? 'AT_RISK_INVENTORY' : 'ADAPTER_DOWN', scope);
      }
      try {
        await reconcileSnapshot({ feed: { ok: false }, source: job.source, canonical_unit_id: job.unit,
          mapping: job.mapping, odoo, ledger, snapshotStore, now: clock(), audit });
      } catch { /* Odoo caido: el lote pendiente sigue en journal para reintento. */ }
      return { scope, error: error?.code ?? error?.message ?? 'ERROR' };
    }
  }

  async function outbound(target) {
    const scope = keyFor(target);
    const adapter = adapters?.[target.source];
    try {
      const today = utcDay(clock());
      const desiredIcal = await exportCalendar({ canonical_unit_id: target.unit, from: today,
        to: plusDays(today, horizonDays), stamp: today, odoo, destination_channel: target.source });
      const fingerprint = sha(desiredIcal);
      await adapter.reconcile({ unit: target.unit, desiredIcal, idempotency_key: fingerprint });
      const availability = await adapter.fetchAvailability({ unit: target.unit });
      const desired = parseIcal(desiredIcal).map((event) => ({
        source: target.source.toUpperCase(), unit: target.unit, start: event.dtstart, end: event.dtend,
      }));
      const rows = reconcileInventories({ odooBlocks: [],
        scopes: [{ source: target.source.toUpperCase(), unit: target.unit }],
        snapshots: [{ source: target.source.toUpperCase(), unit: target.unit, events: [],
          blocked_windows: availability?.blocked_windows, complete: availability?.complete === true,
          captured_at: availability?.captured_at }],
        expectedOutbound: desired, now: clock() });
      if (rows.some((row) => row.status !== RECONCILIATION.MATCH) && desired.length > 0) {
        alert('P1', 'AT_RISK_INVENTORY', scope);
      }
      return { scope, fingerprint, rows };
    } catch (error) {
      alert('P1', error?.code === 'UNSUPPORTED_OPERATION' ? 'AT_RISK_INVENTORY' : 'ADAPTER_DOWN', scope);
      return { scope, error: error?.code ?? error?.message ?? 'ERROR' };
    }
  }

  async function tick() {
    if (running) return { status: 'SKIPPED_OVERLAP' };
    running = true;
    try {
      const alertStart = alerts.length;
      const inboundResults = [];
      for (const job of jobs) inboundResults.push(await inbound(job));
      const outboundResults = [];
      for (const target of outboundTargets) outboundResults.push(await outbound(target));
      const nowMs = Date.parse(clock());
      for (const job of jobs) {
        const scope = keyFor(job);
        const last = metrics.last_successful_sync[scope];
        metrics.sync_lag_seconds[scope] = last ? Math.max(0, Math.floor((nowMs - Date.parse(last)) / 1000)) : null;
        if (metrics.sync_lag_seconds[scope] !== null && metrics.sync_lag_seconds[scope] > staleAfterSeconds) {
          alert('P1', 'SYNC_STALE', scope);
        }
      }
      const degraded = inboundResults.some((result) => result.error) ||
        outboundResults.some((result) => result.error) || alerts.length > alertStart;
      return { status: degraded ? 'DEGRADED' : 'OK', inbound: inboundResults,
        outbound: outboundResults, metrics: health() };
    } finally { running = false; }
  }

  function health() {
    return structuredClone(metrics);
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => {
      void tick().catch(() => { alert('P1', 'RUNNER_CRASH', 'runner'); });
    }, intervalMs);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return Object.freeze({ tick, start, stop, health, alerts: () => [...alerts] });
}
