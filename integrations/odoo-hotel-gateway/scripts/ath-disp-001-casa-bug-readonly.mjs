// ATH-DISP-001 — DIAGNÓSTICO SOLO LECTURA: reserva Casa Completa 21–26 dic 2026 (importada desde Booking).
// Sin escrituras. No imprime nombres ni contactos de huéspedes: solo ids, recursos, origen, fechas y conteos.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };

// 1. Todos los bloques que tocan la estancia (20 a 27 dic, con margen)
const slots = await ex('planning.slot', 'search_read', [[['start_datetime', '<', '2026-12-26 16:00:00'], ['end_datetime', '>', '2026-12-21 20:00:00']]], { fields: ['resource_id', 'x_hotel_block_kind', 'x_channel', 'x_bloqueo_ref', 'x_bloqueo_src_id', 'sale_line_id', 'x_hotel_order_id', 'start_datetime', 'end_datetime', 'create_date', 'write_date', 'role_id'], limit: 200, ...CTX });
for (const s of slots) {
  console.log('SLOT ' + JSON.stringify({ id: s.id, res: s.resource_id && s.resource_id[1], kind: s.x_hotel_block_kind || null, channel: s.x_channel || null, ref: s.x_bloqueo_ref ? 'SI' : 'no', src: s.x_bloqueo_src_id ? s.x_bloqueo_src_id[1] : null, line: s.sale_line_id ? 'SI' : 'no', order: s.x_hotel_order_id ? s.x_hotel_order_id[0] : null, start: s.start_datetime, end: s.end_datetime, created: s.create_date, written: s.write_date }));
}

// 2. Pedidos de habitación que tocan la estancia
const orders = await ex('sale.order', 'search_read', [[['x_checkin', '<', '2026-12-26'], ['x_checkout', '>', '2026-12-21'], ['x_order_involves_room', '=', true]]], { fields: ['id', 'name', 'state', 'x_reservation_status', 'x_hotel_unit_id', 'x_booking_source', 'x_checkin', 'x_checkout', 'x_hotel_is_test'], limit: 50, ...CTX });
console.log('ORDERS ' + JSON.stringify(orders.map((o) => ({ id: o.id, name: o.name, state: o.state, status: o.x_reservation_status, unit: o.x_hotel_unit_id && o.x_hotel_unit_id[1], source: o.x_booking_source || null, checkin: o.x_checkin, checkout: o.x_checkout, test: o.x_hotel_is_test }))));

// 3. Motor de disponibilidad (acción 1914, solo lectura de su resultado) para las dos consultas
for (const [fe, fs] of [['2026-12-21', '2026-12-22'], ['2026-12-21', '2026-12-26']]) {
  const act = await ex('ir.actions.server', 'run', [[1914]], { context: { fe, fs, personas: 2, active_test: false } });
  const res = act?.params?.result;
  console.log('ENGINE ' + JSON.stringify({ fe, fs, units: (res?.opciones || []).filter((o) => ['1', '2', '3', '4', '5', '6'].includes(String(o.unit_id))).map((o) => ({ unit: o.unit_id, estado: o.estado, motivos: o.motivos.map((m) => m.tipo) })) }));
}

// 4. Feeds OTA de Booking: cuál contiene la reserva de Casa (fechas de último cambio, sin URLs)
const feeds = await ex('x_hotel_ota_feed', 'search_read', [[]], { fields: ['x_name', 'x_source', 'x_odoo_unit_id', 'x_last_sync_at', 'x_last_sync_status', 'write_date'], limit: 50, ...CTX });
console.log('FEEDS ' + JSON.stringify(feeds.map((f) => ({ name: f.x_name, source: f.x_source, unit: f.x_odoo_unit_id && f.x_odoo_unit_id[1], last: f.x_last_sync_at, status: String(f.x_last_sync_status || '').slice(0, 60), written: f.write_date }))));

// 5. Reglas de propagación Casa <-> habitaciones y su alcance (solo código de la regla, no datos)
const rules = await ex('base.automation', 'search_read', [[['id', 'in', [167, 169]]]], { fields: ['name', 'active', 'trigger', 'filter_domain', 'filter_pre_domain'], limit: 5, ...CTX });
console.log('RULES ' + JSON.stringify(rules.map((r) => ({ id: r.id, name: r.name, active: r.active, trigger: r.trigger, domain: String(r.filter_domain || '').slice(0, 160), pre: String(r.filter_pre_domain || '').slice(0, 160) }))));
