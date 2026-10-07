// ATH-DISP-001 — AUDITORÍA SOLO LECTURA: patrones asimétricos Casa <-> habitaciones y bloque de 167 noches.
// Sin escrituras. Sin URLs de feeds, tokens ni datos de huéspedes.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };

const ROOM_RES = { '201': 28, '202': 29, '203': 30, '301': 31, '302': 32 };
const CASA_RES = 79;
const toMs = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
const overlap = (a, b) => toMs(a.start_datetime) < toMs(b.end_datetime) && toMs(a.end_datetime) > toMs(b.start_datetime);

const slots = await ex('planning.slot', 'search_read', [[['end_datetime', '>=', '2026-10-06 00:00:00']]], { fields: ['name', 'resource_id', 'x_hotel_block_kind', 'x_channel', 'x_bloqueo_src_id', 'x_bloqueo_ref', 'start_datetime', 'end_datetime', 'create_date', 'create_uid'], limit: 1000, order: 'start_datetime asc', ...CTX });
const resId = (s) => (s.resource_id ? s.resource_id[0] : null);
const roomSlots = slots.filter((s) => Object.values(ROOM_RES).includes(resId(s)));
const casaSlots = slots.filter((s) => resId(s) === CASA_RES);
const nightsOf = (s) => Math.round((toMs(s.end_datetime) - toMs(s.start_datetime)) / 86_400_000);

// B: bloques de habitación NO derivados sin bloque de Casa solapado (la regla 169 no reflejó)
const asymRoomOnly = roomSlots.filter((s) => s.x_hotel_block_kind !== 'derived' && !casaSlots.some((c) => overlap(c, s)));
// A: bloques de Casa NO derivados sin las cinco habitaciones bloqueadas en ese tramo
const asymCasaOnly = casaSlots.filter((s) => s.x_hotel_block_kind !== 'derived').filter((c) => Object.values(ROOM_RES).some((r) => !roomSlots.some((x) => resId(x) === r && overlap(x, c))));

console.log('ASYM_B_ROOM_NO_CASA ' + asymRoomOnly.length + ' ' + JSON.stringify(asymRoomOnly.map((s) => ({ id: s.id, res: s.resource_id[1].slice(0, 18), kind: s.x_hotel_block_kind, ch: s.x_channel || null, start: s.start_datetime.slice(0, 10), end: s.end_datetime.slice(0, 10), nights: nightsOf(s) }))));
console.log('ASYM_A_CASA_NOT_ALL_ROOMS ' + asymCasaOnly.length + ' ' + JSON.stringify(asymCasaOnly.map((c) => ({ id: c.id, kind: c.x_hotel_block_kind, ch: c.x_channel || null, start: c.start_datetime.slice(0, 10), end: c.end_datetime.slice(0, 10) }))));

// Bloque de ~167 noches: todos los bloques largos (>= 30 noches)
const long = slots.filter((s) => nightsOf(s) >= 30);
for (const s of long) {
  const derived = casaSlots.filter((c) => c.x_bloqueo_src_id && c.x_bloqueo_src_id[0] === s.id).length;
  console.log('LONG ' + JSON.stringify({ id: s.id, res: s.resource_id[1].slice(0, 22), kind: s.x_hotel_block_kind || null, ch: s.x_channel || null, start: s.start_datetime.slice(0, 10), end: s.end_datetime.slice(0, 10), nights: nightsOf(s), created: s.create_date.slice(0, 10), createdBy: s.create_uid && s.create_uid[1], casaDerived: derived, ref: s.x_bloqueo_ref ? 'SI' : 'no' }));
}

// Eventos externos de habitación: total y canal
const externalRoom = roomSlots.filter((s) => s.x_hotel_block_kind === 'external');
const byChan = {};
for (const s of externalRoom) byChan[s.x_channel || 'sin_canal'] = (byChan[s.x_channel || 'sin_canal'] || 0) + 1;
console.log('EXTERNAL_ROOM_EVENTS ' + externalRoom.length + ' ' + JSON.stringify(byChan));
