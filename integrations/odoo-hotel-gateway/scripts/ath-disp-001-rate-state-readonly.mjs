// ATH-DISP-001 — PREFLIGHT SOLO LECTURA: estado de gobierno y comercial de cada tarifa (lo que decide el motor 1921).
// Sin escrituras. Sin datos de huéspedes.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const fg = await ex('x_hotel_rate', 'fields_get', [], { attributes: ['string', 'type', 'selection'] });
const wanted = ['x_rule_code', 'x_gov_state', 'x_commercial_status', 'x_pricing_model', 'x_version', 'x_priority', 'x_tax_mode', 'x_price_from', 'x_line_ids', 'x_requires_approval', 'x_active'];
for (const w of wanted) if (fg[w]) console.log('FIELD ' + w + ' ' + JSON.stringify({ t: fg[w].type, s: fg[w].string, sel: fg[w].selection ? fg[w].selection.map((x) => x[0]) : undefined }));

const sel = Object.keys(fg).filter((k) => ['x_gov_state', 'x_commercial_status', 'x_pricing_model'].includes(k));
const rates = await ex('x_hotel_rate', 'search_read', [[['x_active', '=', true]]], { fields: ['x_rule_code', 'x_unit_id', 'x_gov_state', 'x_commercial_status', 'x_pricing_model', 'x_version', 'x_priority', 'x_tax_mode', 'x_price_night', 'x_date_from', 'x_date_to', 'x_line_ids'], limit: 100, context: { active_test: false } }).catch((e) => [{ err: String(e?.message || e).slice(0, 200) }]);
for (const r of rates) {
  console.log('RATE_STATE ' + JSON.stringify({ id: r.id, code: r.x_rule_code, unit: r.x_unit_id && r.x_unit_id[1], gov: r.x_gov_state, commercial: r.x_commercial_status, model: r.x_pricing_model, version: r.x_version, priority: r.x_priority, tax: r.x_tax_mode, price: r.x_price_night, from: r.x_date_from || null, to: r.x_date_to || null, lines: (r.x_line_ids || []).length }));
}
console.log('SELECTIONS ' + JSON.stringify(sel));
