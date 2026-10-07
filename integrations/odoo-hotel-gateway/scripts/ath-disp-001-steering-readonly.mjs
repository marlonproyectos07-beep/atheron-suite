// ATH-DISP-001 — SOLO LECTURA: filas de ODOO.LIST del tope en "Datos" y recálculo de x_availability (Steering). Sin escrituras.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const txt = (c) => (typeof c === 'string' ? c : JSON.stringify(c ?? ''));

const row = (await ex('spreadsheet.dashboard', 'read', [[31]], { fields: ['spreadsheet_data'] }))[0];
const json = typeof row.spreadsheet_data === 'string' ? JSON.parse(row.spreadsheet_data) : row.spreadsheet_data;
const datos = json.sheets.find((s) => s.name === 'Datos');
const cells = datos.cells || {};
const listRows = Object.entries(cells).filter(([r, c]) => /ODOO\.LIST\(\s*1\b/i.test(txt(c))).map(([r]) => +(/\d+/.exec(r))[0]);
console.log('DATOS_ODOO_LIST1_ROWS ' + JSON.stringify({ n: listRows.length, min: Math.min(...listRows), max: Math.max(...listRows) }));
for (const r of ['BA1', 'BA2', 'BA61']) console.log('DATOS_CELL ' + r + ' ' + JSON.stringify(txt(cells[r]).slice(0, 300)));
const sampleA = Object.entries(cells).filter(([r]) => /^A2$|^B2$|^C2$/.test(r)).map(([r, c]) => [r, txt(c).slice(0, 200)]);
console.log('DATOS_SAMPLE ' + JSON.stringify(sampleA));
const hoyKpi = json.sheets.find((s) => s.name === 'Hoy').cells || {};
const hoyWarn = Object.entries(hoyKpi).filter(([, c]) => /truncad|Datos!/.test(txt(c))).map(([r, c]) => [r, txt(c).slice(0, 260)]);
console.log('HOY_REFS_TO_DATOS ' + JSON.stringify(hoyWarn));

// Recálculo de x_availability
const fields = await ex('ir.model.fields', 'search_read', [[['model', '=', 'x_availability'], ['name', 'in', ['x_booked', 'x_available', 'x_to_recompute', 'x_total_units', 'x_availability', 'x_occupancy']]]], { fields: ['name', 'compute', 'depends', 'store', 'ttype'], limit: 20 });
console.log('AVAIL_FIELD_COMPUTE ' + JSON.stringify(fields.map((f) => ({ n: f.name, compute: f.compute, depends: f.depends, store: f.store }))));
const actsAv = await ex('ir.actions.server', 'search_read', [[['code', 'ilike', 'x_availability']]], { fields: ['id', 'name', 'state', 'usage'], limit: 50, context: { active_test: false } });
console.log('SERVER_ACTIONS_AVAIL ' + JSON.stringify(actsAv));
const cronsAv = await ex('ir.cron', 'search_read', [['|', ['cron_name', 'ilike', 'avail'], ['cron_name', 'ilike', 'disponib']]], { fields: ['id', 'cron_name', 'active', 'interval_number', 'interval_type', 'lastcall', 'nextcall'], limit: 20, context: { active_test: false } });
console.log('CRON_AVAIL ' + JSON.stringify(cronsAv));
const stale = await ex('x_availability', 'search_read', [[['x_to_recompute', '=', true]]], { fields: ['x_date', 'x_booked', 'x_total_units', 'write_date'], limit: 5, order: 'x_date asc', context: { active_test: false } });
const staleCount = await ex('x_availability', 'search_count', [[['x_to_recompute', '=', true]]], { context: { active_test: false } });
console.log('AVAIL_TO_RECOMPUTE ' + JSON.stringify({ count: staleCount, sample: stale.map((s) => ({ d: s.x_date, booked: s.x_booked, units: s.x_total_units, w: s.write_date })) }));
const nov20 = await ex('x_availability', 'search_read', [[['x_date', '=', '2026-11-20']]], { fields: ['x_date', 'x_booked', 'x_total_units', 'x_to_recompute', 'x_stay_offer_id', 'write_date'], limit: 20, context: { active_test: false } });
console.log('AVAIL_2026_11_20 ' + JSON.stringify(nov20.map((r) => ({ booked: r.x_booked, units: r.x_total_units, recompute: r.x_to_recompute, w: r.write_date }))));
