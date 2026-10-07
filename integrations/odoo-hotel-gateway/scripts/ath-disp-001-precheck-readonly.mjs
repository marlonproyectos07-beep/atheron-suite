// ATH-DISP-001 — PRECHECK SOLO LECTURA: estado inicial de fechas candidatas para TEST_CASA / TEST_HOLD.
// Ejecuta la acción 1914 (solo lectura) y cuenta pedidos y bloques en esas noches. Sin escrituras.
// Sin nombres ni datos de huéspedes: solo ids, estados y conteos.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const CANDIDATES = [
  ['2026-11-05', '2026-11-06'],
  ['2026-12-05', '2026-12-06'],
];

for (const [fe, fs] of CANDIDATES) {
  const act = await ex('ir.actions.server', 'run', [[1914]], { context: { fe, fs, personas: 2, active_test: false } });
  const res = act?.params?.result;
  const opciones = (res?.opciones || []).filter((o) => ['1', '2', '3', '4', '5', '6'].includes(String(o.unit_id)));
  console.log('PRE_ENGINE ' + JSON.stringify({ fe, fs, units: opciones.map((o) => ({ unit: o.unit_id, estado: o.estado, motivos: o.motivos.map((m) => m.tipo) })) }));

  // Pedidos de habitación que solapan la estancia (cualquier estado distinto de cancelado/borrador)
  const overlap = await ex('sale.order', 'search_read', [[['x_order_involves_room', '=', true], ['x_checkin', '<', fs], ['x_checkout', '>', fe], ['x_reservation_status', 'not in', ['cancelled', 'draft']]]], { fields: ['x_hotel_unit_id', 'x_reservation_status', 'x_hotel_is_test', 'state'], limit: 200, context: { active_test: false } });
  console.log('PRE_ORDERS ' + JSON.stringify({ fe, fs, count: overlap.length, detail: overlap.map((o) => ({ unit: o.x_hotel_unit_id && o.x_hotel_unit_id[0], status: o.x_reservation_status, test: o.x_hotel_is_test, state: o.state })) }));

  // Bloques de calendario en esas noches (cualquier recurso de habitación o Casa)
  const slots = await ex('planning.slot', 'search_read', [[['start_datetime', '<', fs + ' 16:00:00'], ['end_datetime', '>', fe + ' 20:00:00']]], { fields: ['resource_id', 'x_hotel_block_kind', 'x_channel'], limit: 200, context: { active_test: false } });
  console.log('PRE_SLOTS ' + JSON.stringify({ fe, fs, count: slots.length, kinds: slots.map((s) => [s.x_hotel_block_kind || null, s.x_channel || null]) }));
}
