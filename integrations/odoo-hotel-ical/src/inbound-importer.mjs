/** P0 OTA inbound. Odoo owns inventory; this worker only reads configured iCal
 * feeds and submits calendar blocks through HOTEL-017's existing Gateway port.
 * The worker never creates sale.order and never releases a missing event.
 */
import { createHash, randomUUID } from 'node:crypto';
import { parseIcal } from './ical-import.mjs';
import { applyBlock, createSyncLedger, normalizeReservation, preventLoop } from './ota-adapters.mjs';

const SOURCES = new Set(['booking', 'airbnb']);
const UNITS = new Set(['AHS-201', 'AHS-202', 'AHS-203', 'AHS-301', 'AHS-302', 'AHS-CASA']);
const HOSTS = Object.freeze({
  booking: new Set(['ical.booking.com']),
  airbnb: new Set(['www.airbnb.com', 'www.airbnb.com.co']),
});
const MAX_ICAL_BYTES = 2_000_000;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const safeError = (error) => /^[A-Z][A-Z0-9_]{2,64}$/.test(error?.code ?? error?.message ?? '')
  ? (error.code ?? error.message) : 'INBOUND_IMPORT_FAILED';

export class InboundError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Validate before network I/O; never include the private URL in an error. */
export function validateFeedUrl(reference, source, listingId = null) {
  if (!SOURCES.has(source)) throw new InboundError('UNKNOWN_OTA_SOURCE');
  let url;
  try { url = new URL(reference); } catch { throw new InboundError('INVALID_FEED_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || !HOSTS[source].has(url.hostname.toLowerCase())) {
    throw new InboundError('INVALID_FEED_URL');
  }
  if (source === 'booking' && url.pathname !== '/v1/export') throw new InboundError('INVALID_FEED_URL');
  if (source === 'airbnb' && (!/^\/calendar\/ical\/\d+\.ics$/.test(url.pathname)
      || (listingId && url.pathname !== `/calendar/ical/${listingId}.ics`))) {
    throw new InboundError('INVALID_FEED_URL');
  }
  return url;
}

/** Bounded, no-redirect HTTPS fetch. Headers and URL are never logged. */
export async function downloadIcal(reference, source, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const url = validateFeedUrl(reference, source);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/calendar', 'cache-control': 'no-cache' },
    });
  } catch (error) {
    throw new InboundError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'FEED_TIMEOUT' : 'FEED_FETCH_FAILED');
  }
  if (response?.redirected) throw new InboundError('FEED_REDIRECT_REJECTED');
  if (!response?.ok) throw new InboundError('FEED_HTTP_ERROR');
  const declared = Number(response.headers?.get?.('content-length') ?? 0);
  if (declared > MAX_ICAL_BYTES) throw new InboundError('FEED_TOO_LARGE');
  try {
    const reader = response.body?.getReader?.();
    if (!reader) {
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_ICAL_BYTES) throw new InboundError('FEED_TOO_LARGE');
      return text;
    }
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ICAL_BYTES) {
        await reader.cancel();
        throw new InboundError('FEED_TOO_LARGE');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } catch (error) {
    if (error instanceof InboundError) throw error;
    throw new InboundError('FEED_READ_FAILED');
  }
}

function many2oneId(value) { return Array.isArray(value) ? value[0] : value; }

export function normalizeFeedConfig(row) {
  const source = row?.x_source;
  const canonical_unit_id = row?.x_canonical_unit_id;
  const odoo_unit_id = Number(many2oneId(row?.x_odoo_unit_id));
  if (!Number.isInteger(row?.id) || !SOURCES.has(source) || !UNITS.has(canonical_unit_id)
      || !Number.isSafeInteger(odoo_unit_id) || odoo_unit_id < 1) {
    throw new InboundError('FEED_MAPPING_INVALID');
  }
  const reference = row.x_inbound_feed_reference;
  if (typeof reference !== 'string' || !reference.trim()) throw new InboundError('FEED_NOT_CONFIGURED');
  validateFeedUrl(reference, source, row.x_external_listing_id || null);
  return {
    id: row.id, source, canonical_unit_id, odoo_unit_id,
    external_property_id: row.x_external_property_id || null,
    external_listing_id: row.x_external_listing_id || null,
    reference,
  };
}

function preparedEvent(event, feed) {
  if (event.uid && typeof event.uid !== 'string') throw new InboundError('INVALID_EVENT_UID');
  const uid = event.uid?.trim() || `fallback-${sha(JSON.stringify([
    feed.source, feed.canonical_unit_id, event.dtstart, event.dtend, event.summary ?? '',
  ]))}@atheron-inbound.local`;
  return { ...event, uid };
}

function mapReservation(event, feed, correlation_id) {
  return normalizeReservation(preparedEvent(event, feed), {
    source: feed.source, canonical_unit_id: feed.canonical_unit_id, correlation_id,
    mapping: { [feed.canonical_unit_id]: {
      odoo_unit_id: feed.odoo_unit_id,
      external_property_id: feed.external_property_id,
      external_listing_id: feed.external_listing_id,
    } },
  });
}

function overlaps(a, b) { return a.check_in < b.check_out && b.check_in < a.check_out; }

function snapshotEntry(reservation, previous, now, state) {
  return {
    source: reservation.source, canonical_unit_id: reservation.canonical_unit_id,
    idempotency_key: reservation.idempotency_key, external_uid: reservation.external_reservation_id,
    check_in: reservation.check_in, check_out: reservation.check_out,
    correlation_id: reservation.correlation_id,
    first_seen_at: previous?.first_seen_at || now, last_seen_at: now,
    missing_count: 0, state,
  };
}

/** One configured feed. Results contain counts/codes only, never URL, UID or guest data. */
export async function importInboundFeed(row, {
  odoo, feedStore, download = downloadIcal, now = () => new Date().toISOString(),
  correlationId = () => `ath-ota-inbound-${randomUUID()}`,
} = {}) {
  if (!odoo?.snapshotStore?.list || !odoo?.snapshotStore?.put || !odoo?.listBlocks || !odoo?.applyBlock
      || !feedStore?.updateStatus) throw new InboundError('INBOUND_PORT_REQUIRED');
  let feed;
  try { feed = normalizeFeedConfig(row); }
  catch (error) {
    const code = safeError(error);
    if (Number.isInteger(row?.id)) await feedStore.updateStatus(row.id, { status: 'ERROR', error: code });
    return { feed_id: row?.id ?? null, status: 'ERROR', error: code };
  }
  const at = now();
  try {
    const ical = await download(feed.reference, feed.source);
    if (typeof ical !== 'string' || !/^BEGIN:VCALENDAR\r?$/m.test(ical)
        || !/^END:VCALENDAR\r?$/m.test(ical)) throw new InboundError('INVALID_ICAL_FEED');
    const opened = (ical.match(/^BEGIN:VEVENT\r?$/gm) ?? []).length;
    const closed = (ical.match(/^END:VEVENT\r?$/gm) ?? []).length;
    if (opened !== closed) throw new InboundError('INVALID_ICAL_FEED');
    const raw = parseIcal(ical);
    const correlation_id = correlationId();
    const events = raw.filter((e) => !preventLoop(e));
    const reservations = events.map((e) => mapReservation(e, feed, correlation_id));
    const prior = await odoo.snapshotStore.list(feed.source, feed.canonical_unit_id);
    const byKey = new Map(prior.map((e) => [e.idempotency_key, e]));
    const current = await odoo.listBlocks();
    const unique = new Map();
    const conflicting = new Set();
    for (const r of reservations) {
      const earlier = unique.get(r.idempotency_key);
      if (earlier && (earlier.check_in !== r.check_in || earlier.check_out !== r.check_out
          || earlier.status !== r.status)) conflicting.add(r.idempotency_key);
      else unique.set(r.idempotency_key, r);
    }
    const candidates = [...unique.values()];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (candidates[i].status === 'blocked' && candidates[j].status === 'blocked'
            && overlaps(candidates[i], candidates[j])) {
          conflicting.add(candidates[i].idempotency_key);
          conflicting.add(candidates[j].idempotency_key);
        }
      }
    }
    const counts = { APPLIED: 0, DUPLICATE: reservations.length - unique.size,
      CONFLICT: 0, CANCELLED_PENDING: 0, MISSING_PENDING: 0, LOOP_DISCARDED: raw.length - events.length,
      ODOO_OVERRIDE: 0 };
    const seen = new Set();
    for (const r of candidates) {
      seen.add(r.idempotency_key);
      const old = byKey.get(r.idempotency_key);
      const owned = current.find((b) => b.idempotency_key === r.idempotency_key);
      let state;
      if (conflicting.has(r.idempotency_key)
          || (old && (old.check_in !== r.check_in || old.check_out !== r.check_out))) {
        state = 'CONFLICT';
      } else if (r.status === 'cancelled') {
        state = 'CANCELLED_PENDING';
      } else if (owned && owned.source === r.source && owned.canonical_unit_id === r.canonical_unit_id
          && owned.check_in === r.check_in && owned.check_out === r.check_out) {
        state = 'DUPLICATE';
      } else if (old && !['PRE_APPLY', 'ACTIVE', 'MISSING_PENDING'].includes(old.state)) {
        state = old.state;
      } else if (old?.state === 'ACTIVE' || old?.state === 'MISSING_PENDING' || owned) {
        state = 'ODOO_OVERRIDE';
      } else {
        await odoo.snapshotStore.put(snapshotEntry(r, old, at, 'PRE_APPLY'));
        const outcome = await applyBlock(r, { odoo, ledger: createSyncLedger() });
        state = outcome.status;
      }
      const entry = snapshotEntry(r, old, at,
        state === 'APPLIED' || state === 'DUPLICATE' ? 'ACTIVE' : state);
      if (old && (old.check_in !== r.check_in || old.check_out !== r.check_out)) {
        entry.check_in = old.check_in;
        entry.check_out = old.check_out;
        entry.observed_check_in = r.check_in;
        entry.observed_check_out = r.check_out;
      }
      await odoo.snapshotStore.put(entry);
      counts[state] = (counts[state] ?? 0) + 1;
    }
    for (const old of prior) {
      if (seen.has(old.idempotency_key) || !['ACTIVE', 'MISSING_PENDING'].includes(old.state)) continue;
      await odoo.snapshotStore.put({ ...old, missing_count: (old.missing_count ?? 0) + 1,
        state: 'MISSING_PENDING' });
      counts.MISSING_PENDING += 1;
    }
    const status = counts.CONFLICT || counts.ODOO_OVERRIDE ? 'REVIEW'
      : raw.length === 0 ? 'EMPTY' : 'OK';
    await feedStore.updateStatus(feed.id, { status, error: null, last_sync_at: at });
    return { feed_id: feed.id, status, events: raw.length, counts };
  } catch (error) {
    const code = safeError(error);
    await feedStore.updateStatus(feed.id, { status: 'ERROR', error: code });
    return { feed_id: feed.id, status: 'ERROR', error: code };
  }
}

/** Cron entry point and manual one-feed entry point; failures are isolated. */
export async function runConfiguredInbound({ feedStore, odoo, onlyFeedId = null, ...deps } = {}) {
  if (!feedStore?.listConfigured) throw new InboundError('FEED_STORE_REQUIRED');
  const feeds = await feedStore.listConfigured();
  const selected = onlyFeedId == null ? feeds : feeds.filter((f) => f.id === onlyFeedId);
  if (onlyFeedId != null && selected.length !== 1) throw new InboundError('FEED_NOT_FOUND');
  const results = [];
  for (const feed of selected) {
    try {
      results.push(await importInboundFeed(feed, { feedStore, odoo, ...deps }));
    } catch (error) {
      results.push({ feed_id: feed?.id ?? null, status: 'ERROR', error: safeError(error) });
    }
  }
  return { feeds: results.length, results };
}
