// ATH-DISP-001 — PREFLIGHT SOLO LECTURA: líneas de ocupación (precio por huéspedes) de cada tarifa, y unidad exacta de cada tarifa.
// Sin escrituras. Sin datos de huéspedes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const OUT = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-atheron-codex\\94c22c4a-cc8e-45b1-9394-e9bbccac8688\\scratchpad\\odoo-actions';
mkdirSync(OUT, { recursive: true });

const rates = await ex('x_hotel_rate', 'search_read', [[['x_active', '=', true]]], { fields: ['x_rule_code', 'x_unit_id', 'x_pricing_model', 'x_line_ids'], limit: 100, context: { active_test: false } });
for (const r of rates) console.log('RATE_UNIT ' + JSON.stringify({ id: r.id, code: r.x_rule_code, unit_id: r.x_unit_id && r.x_unit_id[0], unit: r.x_unit_id && r.x_unit_id[1], model: r.x_pricing_model }));

const lineIds = rates.flatMap((r) => r.x_line_ids || []);
const lfg = await ex('x_hotel_rate_line', 'fields_get', [], { attributes: ['string', 'type'] });
const lfields = ['x_rate_id', 'x_guests', 'x_price_night', 'x_requires_approval'].filter((f) => lfg[f]);
const lines = lineIds.length ? await ex('x_hotel_rate_line', 'read', [lineIds], { fields: lfields }) : [];
const byRate = {};
for (const l of lines) { const k = l.x_rate_id && l.x_rate_id[0]; (byRate[k] = byRate[k] || []).push([l.x_guests, l.x_price_night, l.x_requires_approval ? 'REQ_APPR' : '']); }
for (const [k, v] of Object.entries(byRate)) console.log('LINES ' + JSON.stringify({ rate_id: +k, lines: v.sort((a, b) => a[0] - b[0]) }));

// Código del HOLD (1935), exportado a scratchpad
const h = (await ex('ir.actions.server', 'read', [[1935]], { fields: ['code'] }))[0];
writeFileSync(`${OUT}/action-1935.py`, h.code || '', 'utf8');
console.log('HOLD_EXPORTED lines=' + String(h.code || '').split('\n').length);
