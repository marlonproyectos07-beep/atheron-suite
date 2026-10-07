// ATH-DISP-001 — SOLO LECTURA: reglas Casa<->habitación activas, recursos de planning.slot, HOLD con bloque. Sin escrituras.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

// 1. Reglas de automatización Casa <-> habitación
const autos = await ex('base.automation', 'search_read', [[['name', 'ilike', 'Casa']]], { fields: ['name', 'active', 'trigger', 'model_id'], limit: 20, context: { active_test: false } });
console.log('CASA_RULES ' + JSON.stringify(autos.map((a) => ({ id: a.id, name: a.name, active: a.active, trigger: a.trigger }))));
const autos2 = await ex('base.automation', 'search_read', [[['name', 'ilike', 'Habitacion bloquea']]], { fields: ['name', 'active', 'trigger'], limit: 20, context: { active_test: false } });
console.log('ROOM_RULES ' + JSON.stringify(autos2.map((a) => ({ id: a.id, name: a.name, active: a.active, trigger: a.trigger }))));

// 2. Recursos de planning (habitaciones y Casa) — nombres y si están activos
const res = await ex('resource.resource', 'search_read', [[]], { fields: ['name', 'active', 'resource_type'], limit: 100, context: { active_test: false } });
console.log('RESOURCES ' + JSON.stringify(res.map((r) => ({ id: r.id, name: r.name, active: r.active }))));

// 3. Bloques de planning.slot por recurso (solo conteo, sin datos de huéspedes) para fechas futuras
const bySlotRes = await ex('planning.slot', 'read_group', [[['end_datetime', '>=', '2026-11-01 00:00:00']], ['resource_id'], ['resource_id']], { lazy: true, context: { active_test: false } }).catch((e) => String(e?.message || e).slice(0, 200));
console.log('SLOTS_BY_RESOURCE ' + JSON.stringify(Array.isArray(bySlotRes) ? bySlotRes.map((g) => [g.resource_id && g.resource_id[1], g.resource_id_count ?? g.__count]) : bySlotRes));

// 4. Pedidos en HOLD u opción activos: ¿generan bloque en planning.slot?
const holds = await ex('sale.order', 'search_read', [[['x_reservation_status', 'in', ['hold', 'opcion', 'pre_checkin', 'confirmed']], ['x_order_involves_room', '=', true]]], { fields: ['x_reservation_status', 'state', 'x_hold_expires'], limit: 500, context: { active_test: false } });
const holdStats = {};
for (const h of holds) { const k = `${h.x_reservation_status}|${h.state}`; holdStats[k] = (holdStats[k] || 0) + 1; }
console.log('ROOM_ORDERS_BY_STATUS ' + JSON.stringify(holdStats));
const holdIds = holds.filter((h) => h.x_reservation_status === 'hold').map((h) => h.id);
const holdSlots = holdIds.length ? await ex('planning.slot', 'search_count', [[['x_hotel_order_id', 'in', holdIds]]], { context: { active_test: false } }) : 0;
console.log('HOLD_ORDERS_WITH_SLOTS ' + JSON.stringify({ holds: holdIds.length, slots: holdSlots }));
const confirmedIds = holds.filter((h) => h.x_reservation_status === 'confirmed').map((h) => h.id);
const confSlots = confirmedIds.length ? await ex('planning.slot', 'search_count', [[['x_hotel_order_id', 'in', confirmedIds]]], { context: { active_test: false } }) : 0;
console.log('CONFIRMED_ORDERS_WITH_SLOTS ' + JSON.stringify({ confirmed: confirmedIds.length, slots: confSlots }));
