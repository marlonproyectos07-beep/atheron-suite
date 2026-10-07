// ATH-DISP-001 — PRECHECK SOLO LECTURA para la corrección de Casa 21–26 dic. Sin escrituras.
import { readFileSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };

// 1. Roles de Casa Completa (planning.role) y sus recursos
const roles = await ex('planning.role', 'search_read', [[['name', 'ilike', 'completa']]], { fields: ['name', 'x_casa', 'resource_ids', 'x_is_a_room_offer', 'x_hotel_unit_ids'], limit: 20, ...CTX });
console.log('CASA_ROLES ' + JSON.stringify(roles.map((r) => ({ id: r.id, name: r.name, casa: r.x_casa || null, resources: r.resource_ids, roomOffer: r.x_is_a_room_offer, units: r.x_hotel_unit_ids }))));

// 2. Canal válido y selección de tipos de bloque
const fg = await ex('planning.slot', 'fields_get', [['x_channel', 'x_hotel_block_kind', 'name', 'state', 'role_id', 'resource_id']], { attributes: ['string', 'type', 'selection'] });
console.log('SLOT_FIELDS ' + JSON.stringify({ channel: fg.x_channel?.selection?.map((x) => x[0]), kind: fg.x_hotel_block_kind?.selection?.map((x) => x[0]), name: !!fg.name, state: fg.state?.selection?.map((x) => x[0]) }));

// 3. Bloques actuales en la estancia (todos los recursos)
const slots = await ex('planning.slot', 'search_read', [[['start_datetime', '<', '2026-12-26 16:00:00'], ['end_datetime', '>', '2026-12-21 20:00:00']]], { fields: ['name', 'role_id', 'resource_id', 'state', 'x_hotel_block_kind', 'x_channel', 'x_bloqueo_ref', 'x_bloqueo_src_id', 'start_datetime', 'end_datetime'], limit: 100, ...CTX });
console.log('SLOTS_NOW ' + JSON.stringify(slots.map((s) => ({ id: s.id, role: s.role_id && s.role_id[1], res: s.resource_id && s.resource_id[1], state: s.state, kind: s.x_hotel_block_kind || null, channel: s.x_channel || null, ref: s.x_bloqueo_ref ? 'SI' : 'no', src: s.x_bloqueo_src_id ? s.x_bloqueo_src_id[0] : null, start: s.start_datetime, end: s.end_datetime }))));

// 4. Pedidos reales que tocan la estancia (ninguno debe quedar afectado)
const orders = await ex('sale.order', 'search_read', [[['x_checkin', '<', '2026-12-26'], ['x_checkout', '>', '2026-12-21'], ['x_order_involves_room', '=', true]]], { fields: ['name', 'state', 'x_reservation_status', 'x_hotel_unit_id'], limit: 50, ...CTX });
console.log('ORDERS_IN_RANGE ' + orders.length);

// 5. Regla 169 (habitación -> Casa): ¿puede dispararse con un bloque de Casa?
console.log('RULE169_CODE_HEAD ' + readFileSync('C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-atheron-codex\\94c22c4a-cc8e-45b1-9394-e9bbccac8688\\scratchpad\\odoo-actions\\rule-169-action-1855.py', 'utf8').split('\n').slice(0, 12).join(' | '));
