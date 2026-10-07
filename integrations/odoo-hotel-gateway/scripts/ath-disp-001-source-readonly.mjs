// ATH-DISP-001 — SOLO LECTURA: fuente canónica de disponibilidad. Compara x_availability contra planning.slot
// por noche y oferta. Sin escrituras. No imprime URLs, tokens ni datos de huéspedes.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

// 1. Código de la acción de recálculo (cabecera) y de la creación diaria
const a1493 = (await ex('ir.actions.server', 'read', [[1493]], { fields: ['code'] }))[0];
console.log('ACTION_1493_CODE ' + String(a1493.code || '').slice(0, 1400).replace(/\s+/g, ' '));
const a1494 = (await ex('ir.actions.server', 'read', [[1494]], { fields: ['code'] }))[0];
console.log('ACTION_1494_CODE ' + String(a1494.code || '').slice(0, 900).replace(/\s+/g, ' '));

// 2. Ofertas de estancia: nombre, activo, recursos (habitaciones) asociados
const offers = await ex('x_stay_offer', 'search_read', [[]], { fields: ['name', 'x_active', 'x_resource_ids'], limit: 50, context: { active_test: false } }).catch((e) => [{ err: String(e?.message || e).slice(0, 200) }]);
console.log('OFFERS ' + JSON.stringify(offers.map((o) => ({ id: o.id, name: o.name, active: o.x_active, resources: o.x_resource_ids }))));

// 3. Tipos de bloque de planning.slot en fechas futuras (solo conteos)
const kinds = await ex('planning.slot', 'read_group', [[['end_datetime', '>=', '2026-11-01 00:00:00']], ['x_hotel_block_kind'], ['x_hotel_block_kind']], { lazy: true, context: { active_test: false } }).catch((e) => String(e?.message || e).slice(0, 200));
console.log('SLOT_KINDS_FUTURE ' + JSON.stringify(Array.isArray(kinds) ? kinds.map((g) => [g.x_hotel_block_kind, g.__count]) : kinds));

// 4. Contraste por fecha: x_availability (booked) vs bloques de planning.slot que solapan la noche
const DATES = ['2026-11-05', '2026-11-20', '2026-11-21', '2026-12-20', '2026-12-21'];
for (const d of DATES) {
  const av = await ex('x_availability', 'search_read', [[['x_date', '=', d]]], { fields: ['x_stay_offer_id', 'x_booked', 'x_total_units', 'x_to_recompute'], limit: 50, context: { active_test: false } });
  const next = new Date(d + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
  const nd = next.toISOString().slice(0, 10);
  const slots = await ex('planning.slot', 'search_read', [[['start_datetime', '<', nd + ' 00:00:00'], ['end_datetime', '>', d + ' 00:00:00']]], { fields: ['x_hotel_block_kind', 'x_hotel_order_id', 'role_id', 'start_datetime', 'end_datetime'], limit: 500, context: { active_test: false } });
  const kindCount = {};
  for (const s of slots) { const k = s.x_hotel_block_kind || 'none'; kindCount[k] = (kindCount[k] || 0) + 1; }
  console.log('NIGHT ' + JSON.stringify({ d, availability: av.map((r) => ({ offer: r.x_stay_offer_id && r.x_stay_offer_id[1], booked: r.x_booked, total: r.x_total_units, recompute: r.x_to_recompute })), slots_overlapping: slots.length, kinds: kindCount }));
}
