#!/usr/bin/env node
/**
 * HOTEL-017 — revalidador generico de un feed (solo lectura).
 *
 *   .\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/hotel017-revalidate.mjs --unit 203"
 *   .\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/hotel017-revalidate.mjs --feed-id 5"
 *
 * Revalida: clasificacion de cada evento, vinculo OTA unico (binding), y exclusion de Casa Completa.
 * Es de SOLO LECTURA: --apply se rechaza. La replica con escritura es hotel017-import.mjs --replay-check.
 * Imprime conteos y veredictos. Nunca URLs, tokens, UIDs ni datos de huespedes.
 */
import { pathToFileURL } from 'node:url';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { downloadIcal, normalizeFeedConfig } from '../../odoo-hotel-ical/src/inbound-importer.mjs';
import { parseIcal } from '../../odoo-hotel-ical/src/ical-import.mjs';
import { normalizeReservation } from '../../odoo-hotel-ical/src/ota-adapters.mjs';
import { assertStagingOnly, resolveRoom, redact } from '../src/hotel017-tooling.mjs';
import { revalidateFeed, summarizeClassification, bindingsFromAuditRows } from '../src/hotel017-ops.mjs';
import { resolveImportFeed } from './hotel017-import.mjs';

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

export function summarizeRevalidation(rows) {
  const casa = {};
  for (const r of rows) casa[r.casaExclusion] = (casa[r.casaExclusion] || 0) + 1;
  return {
    events: rows.length,
    classification: summarizeClassification(rows.map((r) => ({ verdict: r.classification }))),
    binding_ok: rows.filter((r) => r.bindingOk).length,
    casa_exclusion: casa,
  };
}

export async function runRevalidate(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--apply')) throw new Error('REVALIDATE_IS_READ_ONLY');
  const unit = argValue(argv, '--unit');
  const feedId = argValue(argv, '--feed-id');
  if (!unit && !feedId) throw new Error('UNIT_OR_FEED_REQUIRED');
  const channel = argValue(argv, '--channel') || 'booking';
  const room = unit ? resolveRoom(unit) : null;
  const cfg = loadGuardedConfig(env);
  assertStagingOnly({ database: cfg.database, baseUrl: cfg.baseUrl });
  const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
  if (!uid) throw new Error('LOGIN_FAILED');
  const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

  const feeds = await ex('x_hotel_ota_feed', 'search_read', [[]], { fields: ['id', 'x_name', 'x_source', 'x_canonical_unit_id', 'x_odoo_unit_id', 'x_external_property_id', 'x_external_listing_id', 'x_inbound_feed_reference'], limit: 100, order: 'id asc' });
  const row = resolveImportFeed(feeds, { feedId: feedId ? Number(feedId) : null, canonical: room?.canonical, channel });
  const feed = normalizeFeedConfig(row);
  const unitId = Number(Array.isArray(row.x_odoo_unit_id) ? row.x_odoo_unit_id[0] : row.x_odoo_unit_id);
  const unitRow = (await ex('x_hotel_unit', 'search_read', [[['id', '=', unitId]]], { fields: ['x_resource_id'], limit: 1 }))[0];
  const resource = unitRow?.x_resource_id?.[0];
  const casaUnit = (await ex('x_hotel_unit', 'search_read', [[['x_name', 'ilike', 'CASA']]], { fields: ['id', 'x_child_ids', 'x_resource_id'], limit: 50 }))
    .find((u) => (u.x_child_ids || []).includes(unitId));
  const events = parseIcal(await downloadIcal(feed.reference, feed.source));
  const mapping = { [feed.canonical_unit_id]: { odoo_unit_id: unitId, external_property_id: feed.external_property_id, external_listing_id: feed.external_listing_id } };
  const keyed = events.map((e) => ({ dtstart: e.dtstart, dtend: e.dtend, key: normalizeReservation(e, { source: feed.source, canonical_unit_id: feed.canonical_unit_id, mapping }).idempotency_key }));
  const slots = await ex('planning.slot', 'search_read', [[['resource_id', '=', resource], ['state', '=', 'published']]], { fields: ['id', 'start_datetime', 'end_datetime'], limit: 2000 });
  const casaSlotsRaw = casaUnit ? await ex('planning.slot', 'search_read', [[['resource_id', '=', casaUnit.x_resource_id[0]], ['state', '=', 'published']]], { fields: ['id', 'start_datetime', 'end_datetime', 'x_hotel_order_id'], limit: 2000 }) : [];
  const casaSlots = casaSlotsRaw.map((s) => ({ ...s, hasOrder: Boolean(s.x_hotel_order_id) }));
  const adopts = await ex('x_hotel_api_log', 'search_read', [[['x_operation', '=', 'ota_block_adopt'], ['x_result', '=', 'ok']]], { fields: ['x_idempotency_key', 'x_request'], limit: 500 });
  const applies = await ex('x_hotel_api_log', 'search_read', [[['x_operation', '=', 'ota_block_apply'], ['x_result', '=', 'ok']]], { fields: ['x_idempotency_key', 'x_response'], limit: 2000 });
  const bindings = bindingsFromAuditRows(adopts, applies);
  const rows = revalidateFeed({ events: keyed, slots, casaSlots, bindings });
  return { mode: 'READ_ONLY', feed_id: row.id, unit: unitId, has_casa_parent: Boolean(casaUnit), ...summarizeRevalidation(rows), windows: rows.map((r) => ({ window: r.window, classification: r.classification, binding_ok: r.bindingOk, casa: r.casaExclusion })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRevalidate().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    const msg = redact(error?.message ?? 'REVALIDATE_FAILED');
    console.error(/^[A-Z][A-Z0-9_]{2,64}$/.test(msg) ? msg : 'REVALIDATE_FAILED');
    process.exitCode = 2;
  });
}
