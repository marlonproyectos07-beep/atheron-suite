// ATH-DISP-001 — SOLO LECTURA: ¿las reservas directas confirmadas bloquean planning.slot y x_availability?
// Sin escrituras. Sin nombres ni contactos de huéspedes: solo ids, fechas, unidad y conteos.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const orders = await ex('sale.order', 'search_read', [[['x_order_involves_room', '=', true], ['state', '=', 'sale'], ['x_reservation_status', 'not in', ['cancelled', 'draft']]]], { fields: ['id', 'x_hotel_unit_id', 'x_checkin', 'x_checkout', 'x_reservation_status', 'x_booking_source', 'x_hotel_is_test'], limit: 100, context: { active_test: false } });
for (const o of orders) {
  // Sin datos personales: solo id, unidad, fechas, origen, estado y bandera de prueba
  const offer = o.x_hotel_unit_id ? o.x_hotel_unit_id[1] : null;
  const avail = o.x_checkin && o.x_checkout ? await ex('x_availability', 'search_read', [[['x_date', '>=', o.x_checkin], ['x_date', '<', o.x_checkout]]], { fields: ['x_date', 'x_booked', 'x_stay_offer_id', 'x_to_recompute'], limit: 200, context: { active_test: false } }) : [];
  const booked = avail.filter((a) => a.x_booked > 0).length;
  const slots = await ex('planning.slot', 'search_count', [[['x_hotel_order_id', '=', o.id]]], { context: { active_test: false } });
  console.log('DIRECT_ORDER ' + JSON.stringify({ id: o.id, unit: offer, checkin: o.x_checkin, checkout: o.x_checkout, status: o.x_reservation_status, source: o.x_booking_source, test: o.x_hotel_is_test, slots_linked: slots, avail_rows: avail.length, avail_booked_rows: booked }));
}

// Bloques sin vínculo a pedido: ¿de dónde vienen los slots de habitación?
const unlinked = await ex('planning.slot', 'search_read', [[['x_hotel_order_id', '=', false], ['end_datetime', '>=', '2026-10-06 00:00:00']]], { fields: ['x_hotel_block_kind', 'resource_id', 'start_datetime', 'end_datetime', 'x_channel'], limit: 100, context: { active_test: false } });
console.log('UNLINKED_SLOTS ' + JSON.stringify(unlinked.map((s) => ({ kind: s.x_hotel_block_kind || null, res: s.resource_id && s.resource_id[1], start: s.start_datetime, end: s.end_datetime, channel: s.x_channel || null }))));
