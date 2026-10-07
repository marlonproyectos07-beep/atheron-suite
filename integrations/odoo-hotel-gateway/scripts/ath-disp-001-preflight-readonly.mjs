// ATH-DISP-001 — PREFLIGHT SOLO LECTURA: exporta código de 1921 (motor tarifario) y 1935 (HOLD), y tarifas activas.
// No ejecuta cotización ni HOLD (esas acciones escriben). Sin escrituras.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const OUT = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-atheron-codex\\94c22c4a-cc8e-45b1-9394-e9bbccac8688\\scratchpad\\odoo-actions';
mkdirSync(OUT, { recursive: true });

for (const id of [1921, 1935]) {
  const a = (await ex('ir.actions.server', 'read', [[id]], { fields: ['name', 'code'] }))[0];
  writeFileSync(`${OUT}/action-${id}.py`, a.code || '', 'utf8');
  console.log('ACTION ' + JSON.stringify({ id, name: a.name, lines: String(a.code || '').split('\n').length }));
}

// Tarifas activas por unidad: precio, reglas de capacidad y por-persona (sin datos de huéspedes)
const rates = await ex('x_hotel_rate', 'search_read', [[['x_active', '=', true]]], { fields: ['x_name', 'x_unit_id', 'x_price_night', 'x_price_person_night', 'x_extra_person_price', 'x_base_guests', 'x_max_guests', 'x_min_group', 'x_group_price_person', 'x_date_from', 'x_date_to', 'x_min_nights', 'x_requires_quote'], limit: 100, context: { active_test: false } }).catch(async () => ex('x_hotel_rate', 'search_read', [[['x_active', '=', true]]], { fields: ['x_name', 'x_unit_id', 'x_price_night', 'x_price_person_night', 'x_extra_person_price', 'x_base_guests', 'x_max_guests', 'x_min_group', 'x_group_price_person', 'x_date_from', 'x_date_to', 'x_min_nights'], limit: 100, context: { active_test: false } }));
for (const r of rates) console.log('RATE ' + JSON.stringify({ id: r.id, name: r.x_name, unit: r.x_unit_id && r.x_unit_id[1], price_night: r.x_price_night, pp_night: r.x_price_person_night, extra_pp: r.x_extra_person_price, base: r.x_base_guests, max: r.x_max_guests, min_group: r.x_min_group, group_pp: r.x_group_price_person, from: r.x_date_from || null, to: r.x_date_to || null, min_nights: r.x_min_nights, requires_quote: r.x_requires_quote ?? null }));

// Reglas de precio y de cotización en parámetros de sistema relacionados
const params = await ex('ir.config_parameter', 'search_read', [[['key', 'ilike', 'hotel_v1']]], { fields: ['key', 'value'], limit: 50 });
console.log('PARAMS ' + JSON.stringify(params.map((p) => [p.key, p.key.includes('secret') ? '[oculto]' : p.value])));
