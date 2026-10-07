// ATH-DISP-001 — TRAZA SOLO LECTURA de la reserva Casa 21–26 dic: feeds Casa, registros del importador y reglas.
// Sin escrituras. Sin nombres de huéspedes ni URLs.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };

// 1. ¿Existe algún feed OTA apuntando a Casa Completa?
const feeds = await ex('x_hotel_ota_feed', 'search_read', [[]], { fields: ['x_name', 'x_source', 'x_odoo_unit_id', 'x_odoo_resource_id', 'x_canonical_unit_id'], limit: 100, ...CTX });
console.log('FEEDS_TO_CASA ' + feeds.filter((f) => /casa|CASA/i.test(JSON.stringify(f))).length + ' de ' + feeds.length);
console.log('FEEDS ' + JSON.stringify(feeds.map((f) => ({ name: f.x_name, source: f.x_source, unit: f.x_odoo_unit_id && f.x_odoo_unit_id[1], resource: f.x_odoo_resource_id && f.x_odoo_resource_id[1] }))));

// 2. Registros del importador (log de API/OTA) que mencionan la estancia o el bloque 40145
const logFields = await ex('x_hotel_api_log', 'fields_get', [], { attributes: ['type'] });
const textFields = Object.keys(logFields).filter((n) => ['text', 'char'].includes(logFields[n].type)).slice(0, 12);
const logs = await ex('x_hotel_api_log', 'search_read', [['|', ['x_request', 'ilike', '2026-12-21'], ['x_response', 'ilike', '2026-12-21']]], { fields: ['x_operation', 'x_result', 'create_date', 'x_idempotency_key', 'x_request'], limit: 20, order: 'create_date asc', ...CTX }).catch((e) => [{ err: String(e?.message || e).slice(0, 160) }]);
for (const l of logs) {
  console.log('LOG ' + JSON.stringify({ op: l.x_operation, result: l.x_result, at: l.create_date, key: l.x_idempotency_key ? 'presente' : null, err: l.err || null, request_has_slot: /40145|302|airbnb/i.test(String(l.x_request || '')), text_fields_checked: textFields.length }));
}

// 3. Bloques externos de Airbnb en la 302 y su creación (quién los creó y cuándo)
const ext = await ex('planning.slot', 'read', [[40145, 40147]], { fields: ['resource_id', 'x_channel', 'x_hotel_block_kind', 'create_uid', 'create_date', 'write_uid', 'write_date', 'start_datetime', 'end_datetime'], ...CTX });
for (const s of ext) console.log('SLOT ' + JSON.stringify({ id: s.id, res: s.resource_id[1], channel: s.x_channel, kind: s.x_hotel_block_kind, created_by: s.create_uid && s.create_uid[1], created: s.create_date, written_by: s.write_uid && s.write_uid[1], written: s.write_date, start: s.start_datetime, end: s.end_datetime }));

// 4. Reglas de propagación: alcance real (dominio y disparador)
const rules = await ex('base.automation', 'search_read', [[['id', 'in', [167, 169]]]], { fields: ['name', 'model_id', 'trigger', 'filter_domain'], limit: 5, ...CTX });
console.log('RULES ' + JSON.stringify(rules.map((r) => ({ id: r.id, name: r.name, model: r.model_id && r.model_id[1], trigger: r.trigger, domain: String(r.filter_domain || '').slice(0, 200) }))));
