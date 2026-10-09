#!/usr/bin/env node
/**
 * HOTEL-017 — importador generico por unidad/feed (Booking o Airbnb).
 *
 * DRY-RUN por defecto (solo lectura):
 *   .\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/hotel017-import.mjs --unit 203"
 *
 * Escritura (una importacion; sin adopcion automatica):
 *   ... -Command "node scripts/hotel017-import.mjs --unit 203 --apply --confirm-staging"
 *   ... -Command "node scripts/hotel017-import.mjs --unit 203 --apply --confirm-staging --replay-check"
 *
 * Imprime solo conteos, rangos y clasificacion. Nunca URLs, tokens, UIDs ni datos de huespedes.
 */
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { createGatewayOdooPort } from '../../odoo-hotel-ical/src/gateway-odoo-port.mjs';
import { createOdooInboundFeedStore } from '../../odoo-hotel-ical/src/inbound-odoo-feed-store.mjs';
import { runConfiguredInbound, downloadIcal, normalizeFeedConfig } from '../../odoo-hotel-ical/src/inbound-importer.mjs';
import { parseIcal } from '../../odoo-hotel-ical/src/ical-import.mjs';
import { normalizeReservation } from '../../odoo-hotel-ical/src/ota-adapters.mjs';
import { assertStagingOnly, resolveRoom, redact, summarizeImport, isIdempotentReplay } from '../src/hotel017-tooling.mjs';
import { classifyEvents, summarizeClassification, assertIdempotentPlan, bindingsFromAuditRows } from '../src/hotel017-ops.mjs';

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

/** Parametros del importador. Sin numeros de habitacion fijos: todo sale de --unit o --feed-id. */
export function parseImportArgs(argv) {
  const apply = argv.includes('--apply');
  const confirmed = argv.includes('--confirm-staging');
  if (apply && !confirmed) throw new Error('APPLY_REQUIRES_CONFIRM_STAGING');
  const unit = argValue(argv, '--unit');
  const feedId = argValue(argv, '--feed-id');
  if (!unit && !feedId) throw new Error('UNIT_OR_FEED_REQUIRED');
  return {
    apply,
    replayCheck: argv.includes('--replay-check'),
    unit,
    feedId: feedId ? Number(feedId) : null,
    channel: argValue(argv, '--channel') || 'booking',
  };
}

/** Feed resuelto por id o por canonico+canal. Debe ser unico y coincidir con la unidad. */
export function resolveImportFeed(feeds, { feedId, canonical, channel }) {
  const rows = feedId
    ? feeds.filter((f) => f.id === feedId)
    : feeds.filter((f) => f.x_canonical_unit_id === canonical && f.x_source === channel);
  if (rows.length !== 1) throw new Error('FEED_NOT_UNIQUE');
  return rows[0];
}

export async function runImport(argv = process.argv.slice(2), env = process.env) {
  const args = parseImportArgs(argv);
  const cfg = loadGuardedConfig(env);
  assertStagingOnly({ database: cfg.database, baseUrl: cfg.baseUrl });
  const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
  if (!uid) throw new Error('LOGIN_FAILED');
  const ex = (model, method, args2, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args2, kwargs]);

  const room = args.unit ? resolveRoom(args.unit) : null;
  const feeds = await ex('x_hotel_ota_feed', 'search_read', [[]], { fields: ['id', 'x_name', 'x_source', 'x_canonical_unit_id', 'x_odoo_unit_id', 'x_external_property_id', 'x_external_listing_id', 'x_inbound_feed_reference'], limit: 100, order: 'id asc' });
  const row = resolveImportFeed(feeds, { feedId: args.feedId, canonical: room?.canonical, channel: args.channel });
  const feed = normalizeFeedConfig(row);
  const unitId = Number(Array.isArray(row.x_odoo_unit_id) ? row.x_odoo_unit_id[0] : row.x_odoo_unit_id);
  if (room && unitId !== room.odooUnit) throw new Error('FEED_UNIT_MISMATCH');

  let rows;
  let eventsCount;
  {
    const events = parseIcal(await downloadIcal(feed.reference, feed.source));
    const mapping = { [feed.canonical_unit_id]: { odoo_unit_id: unitId, external_property_id: feed.external_property_id, external_listing_id: feed.external_listing_id } };
    const keyed = events.map((e) => ({ dtstart: e.dtstart, dtend: e.dtend, key: normalizeReservation(e, { source: feed.source, canonical_unit_id: feed.canonical_unit_id, mapping }).idempotency_key }));
    const resource = (await ex('x_hotel_unit', 'search_read', [[['id', '=', unitId]]], { fields: ['x_resource_id'], limit: 1 }))[0]?.x_resource_id?.[0];
    const slots = await ex('planning.slot', 'search_read', [[['resource_id', '=', resource], ['state', '=', 'published']]], { fields: ['id', 'start_datetime', 'end_datetime'], limit: 2000 });
    const adopts = await ex('x_hotel_api_log', 'search_read', [[['x_operation', '=', 'ota_block_adopt'], ['x_result', '=', 'ok']]], { fields: ['x_idempotency_key', 'x_request'], limit: 500 });
    const applies = await ex('x_hotel_api_log', 'search_read', [[['x_operation', '=', 'ota_block_apply'], ['x_result', '=', 'ok']]], { fields: ['x_idempotency_key', 'x_response'], limit: 2000 });
    const bindings = bindingsFromAuditRows(adopts, applies);
    rows = classifyEvents(keyed, slots, bindings);
    eventsCount = events.length;
  }
  if (!args.apply) {
    return { mode: 'DRY_RUN', feed_id: row.id, unit: unitId, events: eventsCount, rows: rows.map((r) => ({ window: r.window, verdict: r.verdict })), counts: summarizeClassification(rows) };
  }
  // Guarda: solo se escribe si todos los eventos ya son DUPLICATE. Sin adopcion automatica.
  assertIdempotentPlan(rows);

  // Escritura: mismo motor de importacion validado. Ningun paso adopta automaticamente.
  const built = buildGatewayFromEnv({ ...env, DRY_RUN: 'false' });
  const rawKey = randomUUID();
  const agentId = `hotel017-import-${row.id}`;
  built.identityStore.register({ agentId, actor: 'codex', rawKey });
  const operations = ['ota_blocks_list', 'ota_block_apply', 'ota_snapshot_list', 'ota_snapshot_put'];
  const client = Object.fromEntries(operations.map((operation) => [operation, async (body) => (await built.gateway.handle({ operation, agentId, rawKey, body })).envelope]));
  const odoo = createGatewayOdooPort({ client });
  const feedStore = createOdooInboundFeedStore({ config: cfg, transport });
  const scoped = { ...feedStore, listConfigured: async () => [row] };
  const first = summarizeImport(await runConfiguredInbound({ feedStore: scoped, odoo, onlyFeedId: row.id }));
  const out = { mode: 'WRITE', feed_id: row.id, first };
  if (args.replayCheck) {
    const second = summarizeImport(await runConfiguredInbound({ feedStore: scoped, odoo, onlyFeedId: row.id }));
    out.replay = second;
    out.replay_idempotent = isIdempotentReplay(second);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runImport().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    const msg = redact(error?.message ?? 'IMPORT_FAILED');
    console.error(/^[A-Z][A-Z0-9_]{2,64}$/.test(msg) ? msg : 'IMPORT_FAILED');
    process.exitCode = 2;
  });
}
