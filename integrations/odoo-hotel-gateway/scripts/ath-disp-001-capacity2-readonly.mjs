// ATH-DISP-001 — SOLO LECTURA: valores de capacidad de propiedad y de tarifas de Casa Completa. Sin escrituras.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const props = await ex('x_hotel_property', 'search_read', [[]], { fields: ['x_name', 'x_capacity_whole', 'x_active'], limit: 20, context: { active_test: false } });
console.log('PROPERTIES ' + JSON.stringify(props.map((p) => ({ id: p.id, name: p.x_name, whole: p.x_capacity_whole, active: p.x_active }))));

const rates = await ex('x_hotel_rate', 'search_read', [[['x_unit_id.x_name', 'ilike', 'CASA']]], { fields: ['x_name', 'x_unit_id', 'x_base_guests', 'x_max_guests', 'x_extra_person_price', 'x_price_person_night', 'x_min_group', 'x_group_price_person', 'x_active', 'x_price_night'], limit: 20, context: { active_test: false } });
console.log('CASA_RATES ' + JSON.stringify(rates.map((r) => ({ id: r.id, name: r.x_name, unit: r.x_unit_id && r.x_unit_id[1], base: r.x_base_guests, max: r.x_max_guests, extra_price: r.x_extra_person_price, pp_night: r.x_price_person_night, min_group: r.x_min_group, group_pp: r.x_group_price_person, active: r.x_active, price_night: r.x_price_night }))));

const roomRates = await ex('x_hotel_rate', 'search_read', [[['x_unit_id.x_name', 'in', ['201', '202', '203', '301', '302']]]], { fields: ['x_name', 'x_unit_id', 'x_base_guests', 'x_max_guests', 'x_extra_person_price', 'x_active', 'x_price_night'], limit: 20, context: { active_test: false } });
console.log('ROOM_RATES ' + JSON.stringify(roomRates.map((r) => ({ name: r.x_name, unit: r.x_unit_id && r.x_unit_id[1], base: r.x_base_guests, max: r.x_max_guests, extra_price: r.x_extra_person_price, active: r.x_active, price_night: r.x_price_night }))));
