// SOLO PRUEBAS. Extracto SINTÉTICO que imita el contrato de AI/recovery-extract/ para ejercitar la lógica de R1/R2/R4 contra el
// Odoo falso. Los tipos se INFIEREN de los valores del respaldo: NO son las definiciones reales del dump y no deben usarse
// jamás contra un Odoo real (por eso solo se escribe en un directorio temporal y la CLI no puede apuntar a él).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readBackup, splitRow } from '../recovery-lib.mjs';
import { OVERLAP_GUARD_NAME } from '../guard.mjs';

const REL = { x_property_id: ['many2one', 'x_hotel_property'], x_resource_id: ['many2one', 'resource.resource'], x_role_id: ['many2one', 'planning.role'], x_product_tmpl_id: ['many2one', 'product.template'], x_child_ids: ['many2many', 'x_hotel_unit'], x_parent_ids: ['many2many', 'x_hotel_unit'] };
const SKIP = new Set(['x_name', 'x_unit_ids', 'x_company_id', 'x_hk_stage_ready_id', 'x_hk_stage_issue_id', 'x_hk_project_id', 'x_hk_stage_todo_id', 'x_hk_stage_doing_id', 'x_lock_touch']);
const tt = (v) => (typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'float') : 'char');

function fieldsFor(model, rows) {
  const seen = new Map();
  for (const r of rows) {
    const { scalars, relations } = splitRow(r);
    for (const [k, v] of Object.entries(scalars)) if (!SKIP.has(k) && !seen.has(k) && v !== false && v !== null) seen.set(k, { model, name: k, ttype: tt(v), field_description: k });
    for (const k of Object.keys(relations)) if (REL[k] && !SKIP.has(k) && !seen.has(k)) seen.set(k, { model, name: k, ttype: REL[k][0], relation: REL[k][1], field_description: k });
  }
  // campos booleanos/escalares que aparecen siempre como false en el respaldo
  for (const r of rows) for (const [k, v] of Object.entries(splitRow(r).scalars)) if (!SKIP.has(k) && !seen.has(k)) seen.set(k, { model, name: k, ttype: tt(v), field_description: k });
  return [...seen.values()];
}

export function buildSyntheticExtract(dir) {
  mkdirSync(dir, { recursive: true });
  const w = (f, d) => writeFileSync(resolve(dir, f), JSON.stringify(d, null, 2));
  const mk = (model) => ({ model, name: { en_US: model }, state: 'manual' });
  w('models.json', ['x_hotel_property', 'x_hotel_unit', 'x_hotel_deposit_policy', 'x_hotel_rate', 'x_hotel_quote', 'x_guests_line'].map(mk));
  const fields = [
    ...fieldsFor('x_hotel_property', readBackup('master-data-x_hotel_property.json')),
    ...fieldsFor('x_hotel_unit', readBackup('master-data-x_hotel_unit.json')),
    ...fieldsFor('x_hotel_deposit_policy', readBackup('master-data-x_hotel_deposit_policy.json')),
    { model: 'x_guests_line', name: 'x_sale_order_id', ttype: 'many2one', relation: 'sale.order', field_description: 'orden' },
    { model: 'account.payment', name: 'x_hotel_sale_order_id', ttype: 'many2one', relation: 'sale.order', field_description: 'reserva' },
    { model: 'planning.slot', name: 'x_hotel_block_kind', ttype: 'selection', field_description: 'tipo de bloque' },
    { model: 'planning.slot', name: 'x_bloqueo_ref', ttype: 'char', field_description: 'ref' },
    // enriquecimiento de sale.order (lo consume R2, R1 lo ignora)
    { model: 'sale.order', name: 'x_guest_line_ids', ttype: 'one2many', relation: 'x_guests_line', relation_field: 'x_sale_order_id' },
    { model: 'sale.order', name: 'x_hotel_payment_ids', ttype: 'one2many', relation: 'account.payment', relation_field: 'x_hotel_sale_order_id' },
  ];
  w('fields.json', fields);
  const sel = (model, name, vals) => vals.map((v, i) => ({ field_model: model, field_name: name, value: v, name: { en_US: v }, sequence: i }));
  w('selections.json', [...sel('planning.slot', 'x_hotel_block_kind', ['manual', 'external', 'derived']), ...sel('sale.order', 'x_regimen_cliente', ['simple', 'comun']), ...sel('sale.order', 'x_tipo_persona_cliente', ['natural', 'juridica'])]);
  w('server_actions.json', [
    { name: 'SYNTH guardia solapamiento', model: 'planning.slot', state: 'code', code: "# SINTETICO de prueba\nfor s in records:\n    pass\n" },
    { name: 'SYNTH accion reserva', model: 'sale.order', state: 'code', code: '# SINTETICO de prueba\nrecords.write({})\n' },
  ]);
  w('automations.json', [{ name: OVERLAP_GUARD_NAME, model: 'planning.slot', trigger: 'on_create_or_write', active: true, action_names: ['SYNTH guardia solapamiento'] }]);
  w('crons.json', [{ cron_name: 'HOTEL v1 — SYNTH vencer HOLDs', action_name: 'SYNTH accion reserva', interval_number: 15, interval_type: 'minutes', active: true }]);
}
