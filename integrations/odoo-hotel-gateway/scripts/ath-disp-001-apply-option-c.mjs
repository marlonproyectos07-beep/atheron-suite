// ATH-DISP-001 — OPCIÓN C AUTORIZADA (STAGING): corrección de la reserva Booking 6388397618 (Casa 21–26 dic 2026).
// Orden (evita solapamientos que Odoo rechaza):
//   1) Bloque de CASA 25 16:00 -> 26 16:00 (sin solapamiento). La regla 167 propaga a las habitaciones libres para ese tramo.
//   2) Bloques MANUALES en 201, 202, 203 y 301 de 21 20:00 -> 25 16:00 (terminan donde empieza el derivado).
// NO se toca el bloque externo 40145 (302) ni el derivado 40146. Sin referencia externa en x_bloqueo_ref.
// Sin huéspedes, pagos, facturas ni tarifas. No se toca Booking ni Airbnb.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
if (cfg.database !== 'atheron1-hotel-staging-20260923') { console.log('ABORT: base no autorizada'); process.exit(1); }
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };
const MARK = 'CORRECCION STAGING ATH-DISP-001 | Booking 6388397618 | Casa 21-26 dic';

const ROOMS = [
  { key: '201', role: 29, res: 28 },
  { key: '202', role: 19, res: 29 },
  { key: '203', role: 30, res: 30 },
  { key: '301', role: 37, res: 31 },
];
const CASA = { role: 69, res: 79 };

const snap = async (label) => {
  const s = await ex('planning.slot', 'search_read', [[['start_datetime', '<', '2026-12-27 16:00:00'], ['end_datetime', '>', '2026-12-20 20:00:00']]], { fields: ['name', 'resource_id', 'x_hotel_block_kind', 'x_bloqueo_src_id', 'start_datetime', 'end_datetime'], limit: 200, order: 'id', ...CTX });
  console.log(label + ' ' + JSON.stringify(s.map((x) => ({ id: x.id, res: x.resource_id && x.resource_id[0], kind: x.x_hotel_block_kind || null, src: x.x_bloqueo_src_id ? x.x_bloqueo_src_id[0] : null, start: x.start_datetime, end: x.end_datetime }))));
  return s;
};

const pre = await snap('PRE');
if (pre.some((x) => (x.name || '').includes('ATH-DISP-001'))) { console.log('ABORT: ya existen bloques de esta corrección. No se escribe de nuevo.'); process.exit(2); }

// 1) Casa 25 16:00 -> 26 16:00
let casaId;
try {
  casaId = await ex('planning.slot', 'create', [{ name: MARK + ' | tramo 25-26 Casa', role_id: CASA.role, resource_id: CASA.res, start_datetime: '2026-12-25 16:00:00', end_datetime: '2026-12-26 16:00:00', state: 'published', x_hotel_block_kind: 'manual', x_channel: 'booking' }]);
  casaId = Array.isArray(casaId) ? casaId[0] : casaId;
  console.log('CASA_25_26_CREATED ' + casaId);
} catch (e) {
  console.log('CASA_25_26_FAILED ' + String(e?.diagnostic?.message || e?.message || '').slice(0, 400));
  process.exit(3);
}

// 2) Habitaciones 21 20:00 -> 25 16:00 (manuales)
const roomIds = {};
for (const room of ROOMS) {
  try {
    const id = await ex('planning.slot', 'create', [{ name: MARK + ' | ' + room.key, role_id: room.role, resource_id: room.res, start_datetime: '2026-12-21 20:00:00', end_datetime: '2026-12-25 16:00:00', state: 'published', x_hotel_block_kind: 'manual', x_channel: 'booking' }]);
    roomIds[room.key] = Array.isArray(id) ? id[0] : id;
    console.log(`ROOM_${room.key}_CREATED ${roomIds[room.key]}`);
  } catch (e) {
    console.log(`ROOM_${room.key}_FAILED ` + String(e?.diagnostic?.message || e?.message || '').slice(0, 400));
    process.exit(4);
  }
}

const post = await snap('POST');
console.log('IDS ' + JSON.stringify({ casa_25_26: casaId, rooms: roomIds }));
