// ATH-DISP-001 — SOLO LECTURA: feeds OTA completos por unidad, errores y disparadores de recálculo. Sin escrituras.
// No imprime URLs iCal ni tokens.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const feeds = await ex('x_hotel_ota_feed', 'search_read', [[]], { fields: ['x_name', 'x_source', 'x_odoo_unit_id', 'x_last_sync_at', 'x_last_sync_status', 'x_last_error', 'write_date'], limit: 100, order: 'x_odoo_unit_id asc, x_source asc', context: { active_test: false } });
for (const f of feeds) console.log('FEED ' + JSON.stringify({ name: f.x_name, source: f.x_source, unit: f.x_odoo_unit_id && f.x_odoo_unit_id[1], last: f.x_last_sync_at, status: String(f.x_last_sync_status || '').slice(0, 100), error: f.x_last_error ? String(f.x_last_error).slice(0, 160) : null }));

// Automatizaciones (base.automation) y acciones que tocan disponibilidad
const autos = await ex('base.automation', 'search_read', [['|', ['model_id.model', '=', 'x_availability'], ['action_server_ids.code', 'ilike', 'x_availability']]], { fields: ['name', 'active', 'trigger', 'action_server_ids'], limit: 50, context: { active_test: false } }).catch((e) => [{ err: String(e?.message || e).slice(0, 200) }]);
console.log('AUTOMATIONS ' + JSON.stringify(autos));
const a1493 = await ex('ir.actions.server', 'read', [[1493]], { fields: ['name', 'state', 'usage', 'code'] });
console.log('ACTION_1493 ' + JSON.stringify({ name: a1493[0].name, usage: a1493[0].usage, code_head: String(a1493[0].code || '').slice(0, 300).replace(/\s+/g, ' ') }));
const pending = await ex('x_availability', 'search_read', [[['x_to_recompute', '=', true]]], { fields: ['x_date', 'x_booked', 'x_stay_offer_id'], limit: 10, context: { active_test: false } });
console.log('PENDING_RECOMPUTE ' + JSON.stringify(pending.map((p) => ({ d: p.x_date, booked: p.x_booked, offer: p.x_stay_offer_id && p.x_stay_offer_id[1] }))));
