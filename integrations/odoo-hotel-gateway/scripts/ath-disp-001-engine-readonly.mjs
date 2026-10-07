// ATH-DISP-001 — SOLO LECTURA: ejecuta la acción 1914 (motor de disponibilidad del endpoint) en fechas conocidas
// y compara con los bloques reales. Sin escrituras. Sin datos de huéspedes (solo ids, unidades, estados, canal).
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

// 1. Jerarquía de unidades (Casa <-> habitaciones) y recursos
const units = await ex('x_hotel_unit', 'search_read', [[['x_active', '=', true]]], { fields: ['x_name', 'x_child_ids', 'x_parent_ids', 'x_resource_id', 'x_cap_comercial', 'x_unit_type'], limit: 50, order: 'x_sequence, id' });
console.log('UNITS ' + JSON.stringify(units.map((u) => ({ id: u.id, name: u.x_name, children: u.x_child_ids.length, parents: u.x_parent_ids.length, resource: u.x_resource_id && u.x_resource_id[1], cap: u.x_cap_comercial, type: u.x_unit_type }))));

// 2. Bloques futuros de planning.slot: ¿tienen x_bloqueo_ref o x_bloqueo_src_id? (el motor los excluye)
const slots = await ex('planning.slot', 'search_read', [[['end_datetime', '>=', '2026-10-06 00:00:00']]], { fields: ['x_hotel_block_kind', 'x_bloqueo_ref', 'x_bloqueo_src_id', 'x_channel', 'sale_line_id', 'x_checkin_state'], limit: 200, context: { active_test: false } });
const agg = {};
for (const s of slots) {
  const k = `${s.x_hotel_block_kind || 'none'}|bloqueo_ref:${s.x_bloqueo_ref ? 'SI' : 'no'}|src:${s.x_bloqueo_src_id ? 'SI' : 'no'}|linea:${s.sale_line_id ? 'SI' : 'no'}|canal:${s.x_channel || '-'}`;
  agg[k] = (agg[k] || 0) + 1;
}
console.log('SLOT_EXCLUSION_PROFILE ' + JSON.stringify(agg));

// 3. Ejecutar el motor 1914 en fechas de prueba (solo lectura). Imprime estado por unidad y motivos resumidos.
const ROOT = 'base.user_root';
const TESTS = [
  ['2026-11-05', '2026-11-06'],
  ['2026-11-20', '2026-11-21'],
  ['2026-12-20', '2026-12-21'],
  ['2026-12-21', '2026-12-22'],
  ['2026-10-12', '2026-10-13'],
  ['2027-01-04', '2027-01-05'],
  ['2027-03-01', '2027-03-03'],
];
for (const [fe, fs] of TESTS) {
  // Se llama la acción 1914 vía execute_kw sobre ir.actions.server; el contexto lleva fe/fs/personas.
  const act = await ex('ir.actions.server', 'run', [[1914]], { context: { fe, fs, personas: 2, active_test: false } }).catch((e) => ({ __err: String(e?.message || e).slice(0, 220) }));
  if (act.__err) { console.log('ENGINE_ERR ' + fe + ' ' + act.__err); continue; }
  const res = act?.params?.result;
  if (!res) { console.log('ENGINE_NO_RESULT ' + fe + ' ' + JSON.stringify(act).slice(0, 200)); continue; }
  console.log('ENGINE ' + JSON.stringify({ fe, fs, disponible_any: res.disponible, opciones: res.opciones.map((o) => ({ u: o.nombre, estado: o.estado, motivos: o.motivos.map((m) => m.tipo) })) }));
}
