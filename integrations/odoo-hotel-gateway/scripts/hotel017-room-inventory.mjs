#!/usr/bin/env node
/**
 * HOTEL-017 — inventario de solo lectura de una habitacion en STAGING.
 *
 * Uso (via cargador seguro, nunca con credenciales en la linea de comandos):
 *   .\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/hotel017-room-inventory.mjs --unit 203 [--from 2026-10-17 --to 2026-10-18]"
 *
 * Solo lectura. No acepta --write. Imprime conteos y banderas; nunca URLs, tokens ni contenido de adjuntos.
 */
import { pathToFileURL } from 'node:url';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { resolveRoom, resolveFeed, assertStagingOnly, parseMode, redact } from '../src/hotel017-tooling.mjs';

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

export async function inventoryRoom(argv = process.argv.slice(2), env = process.env) {
  const mode = parseMode(argv);
  if (mode.write) throw new Error('READ_ONLY_TOOL');
  const unitArg = argValue(argv, '--unit');
  if (!unitArg) throw new Error('UNIT_REQUIRED');
  const room = resolveRoom(unitArg);
  const from = argValue(argv, '--from');
  const to = argValue(argv, '--to');
  const cfg = loadGuardedConfig(env);
  assertStagingOnly({ database: cfg.database, baseUrl: cfg.baseUrl });

  const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
  if (!uid) throw new Error('LOGIN_FAILED');
  const read = (model, domain, fields, limit = 500) => transport.call('object', 'execute_kw', [
    cfg.database, uid, cfg.technicalSecret, model, 'search_read', [domain], { fields, limit, order: 'id asc' },
  ]);

  const units = await read('x_hotel_unit', [['x_name', '=', room.number]], ['id', 'x_name', 'x_resource_id', 'x_role_id'], 2);
  const unit = units[0];
  const feeds = await read('x_hotel_ota_feed', [], ['id', 'x_canonical_unit_id', 'x_source', 'x_last_sync_status'], 50);
  const booking = (() => { try { return resolveFeed(feeds, { canonical: room.canonical, source: 'booking' }); } catch { return null; } })();
  const airbnb = (() => { try { return resolveFeed(feeds, { canonical: room.canonical, source: 'airbnb' }); } catch { return null; } })();
  const attachments = await read('ir.attachment', [['res_model', '=', 'planning.role'], ['res_id', '=', room.role]], ['id', 'name', 'public', 'file_size'], 5);
  const crons = await read('ir.cron', [['name', 'ilike', `SOLO ${room.number}`]], ['id', 'active'], 5);
  const actions = await read('ir.actions.server', [['name', 'ilike', `SOLO ${room.number}`]], ['id'], 10);
  const slots = await read('planning.slot', [['resource_id', '=', room.resource], ['state', '=', 'published']], ['id', 'x_channel', 'x_hotel_block_kind', 'start_datetime', 'end_datetime'], 2000);
  const kinds = {};
  for (const s of slots) { const k = `${s.x_channel || 'none'}/${s.x_hotel_block_kind || 'none'}`; kinds[k] = (kinds[k] || 0) + 1; }
  const out = {
    room: room.number,
    canonical: room.canonical,
    odoo_unit_found: Boolean(unit),
    resource_matches: unit ? unit.x_resource_id?.[0] === room.resource : false,
    role_matches: unit ? unit.x_role_id?.[0] === room.role : false,
    casa_parent_expected: true,
    feed_booking: booking ? { id: booking.id, status: booking.x_last_sync_status || null } : null,
    feed_airbnb: airbnb ? { id: airbnb.id, status: airbnb.x_last_sync_status || null } : null,
    outbound_attachment: attachments.length === 1
      ? { id: attachments[0].id, public: Boolean(attachments[0].public), bytes: attachments[0].file_size } : null,
    outbound_crons_matching: crons.length,
    outbound_actions_matching: actions.length,
    published_slots: slots.length,
    slot_kinds: kinds,
  };
  if (from && to) {
    const inWindow = slots.filter((s) => String(s.start_datetime) < `${to} 16:00:00` && String(s.end_datetime) > `${from} 20:00:00`);
    out.window = { from, to, overlapping_slots: inWindow.length };
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inventoryRoom().then((result) => {
    console.log(JSON.stringify(result));
  }).catch((error) => {
    const message = redact(error?.message ?? 'INVENTORY_FAILED');
    console.error(/^[A-Z][A-Z0-9_]{2,64}$/.test(message) ? message : 'INVENTORY_FAILED');
    process.exitCode = 2;
  });
}
