#!/usr/bin/env node
// ATH-STAGING-RECOVERY-CLAUDE-001 — R0: preflight SOLO LECTURA sobre el staging NUEVO.
// Informa qué existe ya (posible trabajo de Codex) antes de cualquier escritura.
// Uso (cuando Marlon lo autorice y ponga las variables fuera del chat):
//   RECOVERY_TARGET_DB=atheron1-hotel-staging-20261009 ODOO_BASE_URL=https://atheron1-hotel-staging-20261009.odoo.com \
//   ODOO_TECHNICAL_USER=... ODOO_TECHNICAL_SECRET=... node recovery/r0-preflight-readonly.mjs
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { loadRecoveryConfig, readBackup } from './recovery-lib.mjs';

const cfg = loadRecoveryConfig();
const t = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await t.call('common', 'login', [cfg.db, cfg.user, cfg.secret]);
const ex = (model, method, args, kw = {}) => t.call('object', 'execute_kw', [cfg.db, uid, cfg.secret, model, method, args, kw]);
const out = {};

// Solo lectura: search_read / search_count / fields_get. Ninguna otra llamada.
out.modules = (await ex('ir.module.module', 'search_read', [[['name', 'in', ['sale_renting', 'planning', 'web_studio', 'sale_management', 'project']]]], { fields: ['name', 'state'] }));

const WANT_MODELS = ['x_hotel_property', 'x_hotel_unit', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_deposit_policy', 'x_hotel_quote', 'x_hotel_ota_feed', 'x_hotel_api_log'];
const present = await ex('ir.model', 'search_read', [[['model', 'in', WANT_MODELS]]], { fields: ['model'] });
out.hotel_models_present = present.map((m) => m.model);
out.hotel_models_missing = WANT_MODELS.filter((m) => !out.hotel_models_present.includes(m));

const soFields = readBackup('ir-model-fields-sale-order-custom.json').map((f) => f.name);
const have = new Set((await ex('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', 'in', soFields]]], { fields: ['name'] })).map((f) => f.name));
out.sale_order_fields = { expected: soFields.length, present: have.size, missing: soFields.filter((n) => !have.has(n)) };

const slotNeeded = ['x_hotel_block_kind', 'x_channel', 'x_bloqueo_ref', 'x_bloqueo_src_id', 'x_hotel_is_test'];
const slotHave = (await ex('ir.model.fields', 'search_read', [[['model', '=', 'planning.slot'], ['name', 'in', slotNeeded]]], { fields: ['name'] })).map((f) => f.name);
out.planning_slot_fields = { present: slotHave, missing: slotNeeded.filter((n) => !slotHave.includes(n)) };

if (out.hotel_models_present.includes('x_hotel_unit')) {
  out.units = (await ex('x_hotel_unit', 'search_read', [[]], { fields: ['x_name', 'x_unit_type', 'x_active'], context: { active_test: false } }));
}
const byName = async (model, names) => (await ex(model, 'search_read', [[['name', 'in', names]]], { fields: ['name'] })).map((r) => r.name);
const autos = readBackup('base-automation.json').filter((a) => /HOTEL v1|ATHERON - Casa|Habitacion bloquea|Anti-doble|OTA/.test(a.name)).map((a) => a.name);
const foundAutos = await byName('base.automation', autos);
out.automations = { expected: autos.length, present: foundAutos.length, missing: autos.filter((n) => !foundAutos.includes(n)) };
const actNames = readBackup('ir-actions-server-hotel.json').filter((a) => a.name.startsWith('HOTEL v1')).map((a) => a.name);
const foundActs = await byName('ir.actions.server', actNames);
out.server_actions = { expected: actNames.length, present: foundActs.length, missing: actNames.filter((n) => !foundActs.includes(n)) };
out.menus = (await ex('ir.ui.menu', 'search_read', [[['name', 'in', ['Hotel v1 (Piloto)', 'Reservas hotel']]]], { fields: ['name'] })).map((m) => m.name);
out.planning_roles_resources = {
  roles: (await ex('planning.role', 'search_read', [[]], { fields: ['name'] })).map((r) => r.name),
  resources: (await ex('resource.resource', 'search_read', [[]], { fields: ['name'] })).map((r) => r.name).filter((n) => /magia|casa/i.test(n)),
};
console.log(JSON.stringify(out, null, 2)); // sin credenciales, sin PII (no se leen partners)
