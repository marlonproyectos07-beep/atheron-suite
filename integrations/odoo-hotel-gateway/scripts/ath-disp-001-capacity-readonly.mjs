// ATH-DISP-001 — SOLO LECTURA: fuentes de capacidad (pax) en Odoo Hotel v1, tarifas, productos y propiedades.
// Sin escrituras. Sin datos de huéspedes.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

// 1. Campos de capacidad en x_hotel_unit
const ufg = await ex('x_hotel_unit', 'fields_get', [], { attributes: ['string', 'type', 'store'] });
const capFields = Object.entries(ufg).filter(([n, f]) => /cap|pax|guest|huesp|person|max|extra|base/i.test(n + ' ' + (f.string || ''))).map(([n, f]) => `${n}(${f.type}):${f.string}`);
console.log('UNIT_CAP_FIELDS ' + JSON.stringify(capFields));
const units = await ex('x_hotel_unit', 'search_read', [[]], { fields: ['x_name', 'x_active', 'x_property_id', 'x_unit_type', 'x_cap_base', 'x_cap_comercial', 'x_cap_extra', 'x_cap_extra_status', 'x_child_ids', 'x_parent_ids', 'x_product_tmpl_id', 'x_sequence'], limit: 50, order: 'x_sequence, id', context: { active_test: false } });
console.log('UNITS_CAP ' + JSON.stringify(units.map((u) => ({ id: u.id, name: u.x_name, active: u.x_active, prop: u.x_property_id && u.x_property_id[1], type: u.x_unit_type, base: u.x_cap_base, comercial: u.x_cap_comercial, extra: u.x_cap_extra, extra_status: u.x_cap_extra_status, children: u.x_child_ids.length, parents: u.x_parent_ids.length, tmpl: u.x_product_tmpl_id && u.x_product_tmpl_id[1] }))));

// 2. Propiedades: campos de capacidad o pax
const pfg = await ex('x_hotel_property', 'fields_get', [], { attributes: ['string', 'type'] });
console.log('PROPERTY_FIELDS ' + JSON.stringify(Object.entries(pfg).filter(([n, f]) => /cap|pax|guest|max|person|total/i.test(n + ' ' + (f.string || ''))).map(([n, f]) => `${n}:${f.string}`)));

// 3. Tarifas: reglas de capacidad (pax) por unidad
const rfg = await ex('x_hotel_rate', 'fields_get', [], { attributes: ['string', 'type'] });
console.log('RATE_FIELDS ' + JSON.stringify(Object.entries(rfg).filter(([n, f]) => /cap|pax|guest|person|incl|extra|base|max|min/i.test(n + ' ' + (f.string || ''))).map(([n, f]) => `${n}:${f.string}`)));
const rates = await ex('x_hotel_rate', 'search_read', [[['x_active', '=', true]]], { fields: ['x_name', 'x_unit_id', 'x_price_night', 'x_date_from', 'x_date_to'], limit: 50, context: { active_test: false } }).catch((e) => [{ err: String(e?.message || e).slice(0, 160) }]);
console.log('RATES_ACTIVE ' + JSON.stringify(rates.map((r) => ({ id: r.id, name: r.x_name, unit: r.x_unit_id && r.x_unit_id[1], price: r.x_price_night, from: r.x_date_from || null, to: r.x_date_to || null }))));

// 4. Plantilla de producto de habitación: campos de capacidad
const tfg = await ex('product.template', 'fields_get', [], { attributes: ['string', 'type'] });
console.log('PRODUCT_CAP_FIELDS ' + JSON.stringify(Object.entries(tfg).filter(([n, f]) => /cap|pax|guest|person|max|seat/i.test(n + ' ' + (f.string || ''))).map(([n, f]) => `${n}:${f.string}`)));
const rooms = await ex('product.template', 'search_read', [[['x_is_a_room_offer', '=', true]]], { fields: ['name', 'x_is_a_room_offer'], limit: 50, context: { active_test: false } });
console.log('ROOM_OFFER_TEMPLATES ' + JSON.stringify(rooms.map((r) => r.name)));

// 5. Recursos de planning: capacidad
const rsfg = await ex('resource.resource', 'fields_get', [], { attributes: ['string', 'type'] });
console.log('RESOURCE_FIELDS ' + JSON.stringify(Object.entries(rsfg).filter(([n, f]) => /cap|pax|guest|person|seat/i.test(n + ' ' + (f.string || ''))).map(([n, f]) => `${n}:${f.string}`)));
const role = await ex('planning.role', 'fields_get', [], { attributes: ['string', 'type'] });
console.log('ROLE_FIELDS_CAP ' + JSON.stringify(Object.entries(role).filter(([n, f]) => /cap|pax|guest|person/i.test(n + ' ' + (f.string || ''))).map(([n]) => n)));

// 6. Reglas de automatización Casa (capacidad) y constraints
const autos = await ex('base.automation', 'search_read', [['|', ['name', 'ilike', 'capacidad'], ['name', 'ilike', 'personas']]], { fields: ['name', 'active'], limit: 30, context: { active_test: false } });
console.log('CAPACITY_AUTOMATIONS ' + JSON.stringify(autos.map((a) => ({ id: a.id, name: a.name, active: a.active }))));
