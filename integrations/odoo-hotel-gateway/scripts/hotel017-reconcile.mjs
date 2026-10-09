#!/usr/bin/env node
/**
 * HOTEL-017 — reconciliador de solo lectura: correspondencia iCal Booking <-> slots por ventana.
 *
 *   .\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/hotel017-reconcile.mjs --unit 203"
 *
 * No escribe. No llama al gateway (no genera filas de auditoria). Imprime ventanas, conteos y
 * correspondencia; nunca la URL del feed, UIDs ni datos de huespedes.
 */
import { pathToFileURL } from 'node:url';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { downloadIcal, normalizeFeedConfig } from '../../odoo-hotel-ical/src/inbound-importer.mjs';
import { parseIcal } from '../../odoo-hotel-ical/src/ical-import.mjs';
import { assertStagingOnly, redact, resolveRoom } from '../src/hotel017-tooling.mjs';
import { correspondence } from '../src/hotel017-ops.mjs';

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

export async function runReconcile(argv = process.argv.slice(2), env = process.env) {
  const unit = argValue(argv, '--unit');
  if (!unit) throw new Error('UNIT_REQUIRED');
  const room = resolveRoom(unit);
  const cfg = loadGuardedConfig(env);
  assertStagingOnly({ database: cfg.database, baseUrl: cfg.baseUrl });
  const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
  if (!uid) throw new Error('LOGIN_FAILED');
  const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
  const feeds = await ex('x_hotel_ota_feed', 'search_read', [[['x_canonical_unit_id', '=', room.canonical], ['x_source', '=', 'booking']]], { fields: ['id', 'x_source', 'x_canonical_unit_id', 'x_odoo_unit_id', 'x_external_property_id', 'x_external_listing_id', 'x_inbound_feed_reference'], limit: 2 });
  if (feeds.length !== 1) throw new Error('FEED_NOT_UNIQUE');
  const feed = normalizeFeedConfig(feeds[0]);
  const events = parseIcal(await downloadIcal(feed.reference, feed.source));
  const slots = await ex('planning.slot', 'search_read', [[['resource_id', '=', room.resource], ['state', '=', 'published']]], { fields: ['id', 'start_datetime', 'end_datetime', 'x_channel', 'x_hotel_block_kind'], limit: 2000 });
  const pairs = correspondence(events.map((e) => ({ dtstart: e.dtstart, dtend: e.dtend })), slots);
  return {
    room: room.number,
    feed_id: feeds[0].id,
    events: events.length,
    uid_unique: new Set(events.map((e) => e.uid)).size === events.length,
    windows: pairs.map((p) => ({ window: p.window, slots: p.slotIds.length, unique: p.unique, conflict: p.conflict })),
    unique_matches: pairs.filter((p) => p.unique).length,
    ambiguous: pairs.filter((p) => p.conflict).length,
    without_slot: pairs.filter((p) => p.slotIds.length === 0).length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReconcile().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    const msg = redact(error?.message ?? 'RECONCILE_FAILED');
    console.error(/^[A-Z][A-Z0-9_]{2,64}$/.test(msg) ? msg : 'RECONCILE_FAILED');
    process.exitCode = 2;
  });
}
