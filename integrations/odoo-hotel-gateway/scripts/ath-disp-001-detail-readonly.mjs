// ATH-DISP-001 — DETALLE SOLO LECTURA: listas y fórmulas del dashboard 31 que alimentan el tope, y modelo x_availability.
// Sin escrituras. No imprime datos de clientes ni URLs.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const row = (await ex('spreadsheet.dashboard', 'read', [[31]], { fields: ['spreadsheet_data'] }))[0];
const json = typeof row.spreadsheet_data === 'string' ? JSON.parse(row.spreadsheet_data) : row.spreadsheet_data;

// Listas: modelo, dominio, límite, orden
for (const [id, l] of Object.entries(json.lists || {})) {
  console.log('LIST ' + JSON.stringify({ id, model: l.model, limit: l.limit ?? null, orderBy: l.orderBy ?? null, domain: JSON.stringify(l.domain || []).slice(0, 260), columns: (l.columns || []).length }));
}
// Hojas y celdas con ODOO.LIST / ODOO.PIVOT que referencian listas
const datos = json.sheets.find((s) => s.name === 'Datos');
const refs = {};
for (const [ref, c] of Object.entries(datos?.cells || {})) {
  const t = String(c.content || '');
  const m = /ODOO\.(LIST|PIVOT)[.A-Z]*\(\s*(\d+)/i.exec(t);
  if (m) { const key = m[1] + ':' + m[2]; refs[key] = (refs[key] || 0) + 1; }
}
console.log('DATOS_REFS ' + JSON.stringify(refs));
// Columna BA (la que cuenta el tope) y su encabezado
const colBA = Object.entries(datos?.cells || {}).filter(([r]) => /^BA\d+$/.test(r)).slice(0, 4).map(([r, c]) => [r, String(c.content || '').slice(0, 220)]);
console.log('DATOS_COL_BA ' + JSON.stringify(colBA));
const colAZ = Object.entries(datos?.cells || {}).filter(([r]) => /^A[Z]\d+$|^BA1$|^AZ1$/.test(r)).map(([r, c]) => [r, String(c.content || '').slice(0, 220)]);
console.log('DATOS_HEADERS ' + JSON.stringify(colAZ));
// Filas con datos en la columna de conteo y valores máximos de fila
const rowsWithFormula = Object.keys(datos?.cells || {}).map((r) => +(/\d+/.exec(r) || [0])[0]);
console.log('DATOS_MAX_ROW ' + Math.max(...rowsWithFormula));
// Hoy: fórmula de la celda A14 (CASA COMPLETA) y del aviso de truncado
const hoy = json.sheets.find((s) => s.name === 'Hoy');
const a14 = hoy?.cells?.A14?.content;
console.log('HOY_A14 ' + JSON.stringify(String(a14 || '').slice(0, 400)));

// x_availability: modelo, campos clave y cantidad
const fg = await ex('x_availability', 'fields_get', [], { attributes: ['string', 'type', 'store', 'relation'] });
console.log('AVAIL_FIELDS ' + JSON.stringify(Object.entries(fg).filter(([n]) => !n.startsWith('message_') && !n.startsWith('activity_')).map(([n, f]) => `${n}:${f.type}${f.store ? '' : '(nostore)'}`)));
const cnt = await ex('x_availability', 'search_count', [[]], { context: { active_test: false } });
console.log('AVAIL_COUNT ' + cnt);
const sample = await ex('x_availability', 'search_read', [[]], { fields: Object.keys(fg).filter((n) => /date|unit|state|status|write|create|source|slot|start|end|kind/i.test(n)).slice(0, 12), limit: 3, order: 'write_date desc', context: { active_test: false } });
console.log('AVAIL_SAMPLE_KEYS ' + JSON.stringify(sample.map((s) => Object.keys(s))));
