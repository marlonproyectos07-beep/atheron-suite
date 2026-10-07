// ATH-DISP-001 — AUDITORIA SOLO LECTURA: tope de 60 bloques, Steering/Availability, frescura OTA. Sin escrituras.
// Imprime ids, nombres y fragmentos cortos de código. No imprime URLs iCal, tokens ni datos de huéspedes.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const snip = (text, re, n = 140) => { const m = re.exec(text || ''); if (!m) return null; const s = Math.max(0, m.index - 60); return String(text).slice(s, s + n).replace(/\s+/g, ' '); };

// 1. Tope de 60 y mensaje de truncado: acciones de servidor, vistas, dashboards
const LIMIT_RE = /(limit\s*=\s*60|\[:\s*60\]|\blimit\b\s*[=:]\s*6\d|truncad)/i;
const acts = await ex('ir.actions.server', 'search_read', [[['code', '!=', false]]], { fields: ['id', 'name', 'model_id', 'code'], limit: 1000, context: { active_test: false } });
for (const a of acts) { const s = snip(a.code, LIMIT_RE); if (s) console.log('SERVER_ACTION_LIMIT ' + JSON.stringify({ id: a.id, name: a.name, model: a.model_id && a.model_id[1], snip: s })); }
const views = await ex('ir.ui.view', 'search_read', [[['arch_db', 'ilike', 'truncad']]], { fields: ['id', 'name', 'model', 'arch_db'], limit: 50, context: { active_test: false } });
for (const v of views) console.log('VIEW_TRUNCAD ' + JSON.stringify({ id: v.id, name: v.name, model: v.model, snip: snip(v.arch_db, /truncad/i) }));
const dash = await ex('spreadsheet.dashboard', 'search_read', [[]], { fields: ['id', 'name', 'spreadsheet_data'], limit: 50, context: { active_test: false } });
for (const d of dash) {
  const raw = typeof d.spreadsheet_data === 'string' ? d.spreadsheet_data : JSON.stringify(d.spreadsheet_data || {});
  const s = snip(raw, /truncad|limit\W{0,3}60|"limit"\s*:\s*6\d/i);
  if (s) console.log('DASHBOARD_LIMIT ' + JSON.stringify({ id: d.id, name: d.name, snip: s }));
}

// 2. Acciones de ventana y menús que dicen Steering / Availability / Disponibilidad
const wins = await ex('ir.actions.act_window', 'search_read', [['|', '|', ['name', 'ilike', 'steering'], ['name', 'ilike', 'availability'], ['name', 'ilike', 'disponib']]], { fields: ['id', 'name', 'res_model', 'domain', 'limit', 'context'], limit: 50 });
console.log('WINDOWS ' + JSON.stringify(wins.map((w) => ({ id: w.id, name: w.name, model: w.res_model, limit: w.limit, domain: String(w.domain || '').slice(0, 200) }))));
const menus = await ex('ir.ui.menu', 'search_read', [['|', ['name', 'ilike', 'steering'], ['name', 'ilike', 'availability']]], { fields: ['id', 'name', 'action'], limit: 20, context: { active_test: false } });
console.log('MENUS ' + JSON.stringify(menus.map((m) => ({ id: m.id, name: m.name, action: m.action }))));

// 3. Frescura OTA: campos de estado del feed (sin URL ni token)
const feedFg = await ex('x_hotel_ota_feed', 'fields_get', [], { attributes: ['string', 'type'] });
const feedFields = Object.entries(feedFg).filter(([n]) => !/url|token|secret|key|ical/i.test(n)).filter(([n, f]) => /last|state|status|error|sync|count|date|time|unit|channel|name|active|source|direction/i.test(n + ' ' + f.string)).map(([n, f]) => n + ':' + f.type);
console.log('FEED_FIELDS ' + JSON.stringify(feedFields));
const feeds = await ex('x_hotel_ota_feed', 'search_read', [[]], { fields: feedFields.map((f) => f.split(':')[0]).concat(['display_name']), limit: 50, context: { active_test: false } });
console.log('FEEDS ' + JSON.stringify(feeds.map((f) => { const o = {}; for (const k of Object.keys(f)) if (!/url|token|secret|key/i.test(k) && k !== 'id') o[k] = typeof f[k] === 'string' ? f[k].slice(0, 120) : f[k]; return o; })));

// 4. Cron relacionados con OTA / feed / sync / disponibilidad
const crons = await ex('ir.cron', 'search_read', [['|', '|', ['cron_name', 'ilike', 'ota'], ['cron_name', 'ilike', 'hotel'], ['cron_name', 'ilike', 'ical']]], { fields: ['id', 'cron_name', 'active', 'interval_number', 'interval_type', 'lastcall', 'nextcall'], limit: 50, context: { active_test: false } });
console.log('CRONS ' + JSON.stringify(crons));

// 5. Orden COT/2026/03831: estado y bloques (solo estado y conteo)
const ord = await ex('sale.order', 'search_read', [[['name', '=', 'COT/2026/03831']]], { fields: ['id', 'state', 'x_reservation_status', 'x_hotel_unit_id', 'x_checkin', 'x_checkout'], limit: 2, context: { active_test: false } });
const slots = ord.length ? await ex('planning.slot', 'search_read', [[['x_hotel_order_id', '=', ord[0].id]]], { fields: ['id', 'start_datetime', 'end_datetime', 'x_hotel_block_kind', 'role_id'], limit: 50, context: { active_test: false } }) : [];
console.log('ORDER_03831 ' + JSON.stringify({ found: ord.length, state: ord[0] && ord[0].state, status: ord[0] && ord[0].x_reservation_status, slots: slots.length }));
