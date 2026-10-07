// ATH-DISP-001 — PRECHECK SOLO LECTURA: roles de habitación de La Magia que la regla 167 necesita encontrar.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const rooms = await ex('planning.role', 'search_read', [[['x_casa', '=', 'La Magia de Zipaquirá'], ['x_is_a_room_offer', '=', true]]], { fields: ['name', 'x_casa', 'resource_ids'], limit: 50, context: { active_test: false } });
console.log('MAGIA_ROOM_ROLES ' + JSON.stringify(rooms.map((r) => ({ id: r.id, name: r.name.slice(0, 40), resources: r.resource_ids }))));
