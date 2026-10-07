// ATH-DISP-001 — IMPACTO SOLO LECTURA: bloques externos futuros en habitaciones y si la Casa queda bloqueada.
// Sin escrituras. Sin nombres de huéspedes: solo ids, recursos, canal, fechas y conteos.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };

const ROOMS = ['201 La magia - Baño compartido', '202 La magia - Baño compartido', '203 La magia - Baño privado', '301 La magia - Habitación Suite', '302 La magia - Baño privado'];
const CASA = 'Casa Completa - La Magia de Zipaquirá';

// Bloques externos futuros en habitaciones (sin derivados)
const ext = await ex('planning.slot', 'search_read', [[['x_hotel_block_kind', '=', 'external'], ['end_datetime', '>=', '2026-10-06 00:00:00']]], { fields: ['resource_id', 'x_channel', 'start_datetime', 'end_datetime', 'create_date'], limit: 500, order: 'start_datetime asc', ...CTX });
const derived = await ex('planning.slot', 'search_read', [[['x_hotel_block_kind', '=', 'derived'], ['end_datetime', '>=', '2026-10-06 00:00:00']]], { fields: ['resource_id', 'x_bloqueo_src_id', 'start_datetime', 'end_datetime'], limit: 500, order: 'start_datetime asc', ...CTX });
const nights = (s, e) => Math.round((Date.parse(e.replace(' ', 'T') + 'Z') - Date.parse(s.replace(' ', 'T') + 'Z')) / 86_400_000);

console.log('EXTERNAL_FUTURE ' + ext.length);
for (const s of ext) {
  const r = s.resource_id ? s.resource_id[1] : '?';
  const isRoom = ROOMS.includes(r);
  const others = isRoom ? ext.filter((o) => o.id !== s.id && o.resource_id && o.resource_id[1] !== r && ROOMS.includes(o.resource_id[1]) && o.start_datetime < s.end_datetime && o.end_datetime > s.start_datetime).length : 0;
  console.log('EXT ' + JSON.stringify({ id: s.id, res: r, channel: s.x_channel || null, start: s.start_datetime.slice(0, 10), end: s.end_datetime.slice(0, 10), nights: nights(s.start_datetime, s.end_datetime), otherRoomsSameWindow: others, created: s.create_date.slice(0, 10) }));
}

// Derivados de Casa: ¿cuántos y de qué bloque salen?
const casaDerived = derived.filter((d) => d.resource_id && d.resource_id[1] === CASA);
console.log('CASA_DERIVED_FUTURE ' + casaDerived.length + ' ' + JSON.stringify(casaDerived.map((d) => ({ id: d.id, from: d.x_bloqueo_src_id ? d.x_bloqueo_src_id[1].split(' - ')[0] : null, start: d.start_datetime.slice(0, 10), end: d.end_datetime.slice(0, 10) }))));

// Pedidos de Casa Completa (unidad Casa) en el sistema: ¿existe alguno?
const casaOrders = await ex('sale.order', 'search_count', [[['x_hotel_unit_id.x_name', '=', 'CASA COMPLETA'], ['x_hotel_unit_id.x_parent_ids', '=', false]]], CTX);
console.log('CASA_ORDERS_IN_ODOO ' + casaOrders);
