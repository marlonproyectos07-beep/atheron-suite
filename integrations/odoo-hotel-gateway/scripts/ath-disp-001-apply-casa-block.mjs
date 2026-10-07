// ATH-DISP-001 — CORRECCIÓN AUTORIZADA (STAGING): bloque de Casa Completa 21–26 dic 2026, reserva Booking 6388397618.
// Crea UN bloque en el rol/recurso de Casa verificados. La regla 167 propaga a las habitaciones libres.
// Sin referencia externa en x_bloqueo_ref (si la tuviera, la regla 167 no se dispararía).
// Sin datos de huéspedes. Sin tocar Booking ni Airbnb.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
if (cfg.database !== 'atheron1-hotel-staging-20260923') { console.log('ABORT: base no autorizada'); process.exit(1); }
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const CTX = { context: { active_test: false } };
const ROLE_CASA = 69, RES_CASA = 79;

const snap = async (label) => {
  const s = await ex('planning.slot', 'search_read', [[['start_datetime', '<', '2026-12-27 16:00:00'], ['end_datetime', '>', '2026-12-20 20:00:00']]], { fields: ['name', 'resource_id', 'x_hotel_block_kind', 'x_channel', 'x_bloqueo_src_id', 'start_datetime', 'end_datetime'], limit: 200, order: 'id', ...CTX });
  console.log(label + ' ' + JSON.stringify(s.map((x) => ({ id: x.id, res: x.resource_id && x.resource_id[1].slice(0, 18), kind: x.x_hotel_block_kind || null, ch: x.x_channel || null, src: x.x_bloqueo_src_id ? x.x_bloqueo_src_id[0] : null, start: x.start_datetime, end: x.end_datetime }))));
  return s;
};

const pre = await snap('PRE_SLOTS');
const already = pre.find((x) => x.resource_id && x.resource_id[0] === RES_CASA && x.start_datetime === '2026-12-21 20:00:00' && x.x_channel === 'booking');
if (already) { console.log('ABORT: el bloque de Casa ya existe (id ' + already.id + '). No se escribe de nuevo.'); process.exit(2); }

let newId;
try {
  newId = await ex('planning.slot', 'create', [{
    name: 'Booking 6388397618 - Casa Completa 21-26 dic (ATH-DISP-001)',
    role_id: ROLE_CASA,
    resource_id: RES_CASA,
    start_datetime: '2026-12-21 20:00:00',
    end_datetime: '2026-12-26 16:00:00',
    state: 'published',
    x_hotel_block_kind: 'external',
    x_channel: 'booking',
  }]);
} catch (e) {
  // Diagnóstico: mensaje de Odoo sin volcar el objeto completo
  const d = e?.diagnostic || {};
  console.log('CREATE_FAILED ' + JSON.stringify({ exception: d.exception || null, message: String(d.message || e?.message || '').slice(0, 600) }));
  process.exit(3);
}
console.log('CREATED_SLOT ' + JSON.stringify(newId));

const post = await snap('POST_SLOTS');
const created = post.find((x) => x.id === (Array.isArray(newId) ? newId[0] : newId));
console.log('CREATED_OK ' + JSON.stringify({ id: created?.id, res: created?.resource_id?.[1], start: created?.start_datetime, end: created?.end_datetime, kind: created?.x_hotel_block_kind, channel: created?.x_channel }));
