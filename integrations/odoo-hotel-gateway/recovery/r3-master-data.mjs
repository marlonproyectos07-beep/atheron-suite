#!/usr/bin/env node
// ATH-STAGING-RECOVERY — R3: propiedad -> 5 habitaciones -> Casa Completa (+ anticipos).
// IDEMPOTENTE y por NOMBRE (nunca por id viejo). DRY-RUN por defecto.
//   node recovery/r3-master-data.mjs --plan                 # sin red: imprime el plan desde el respaldo
//   node recovery/r3-master-data.mjs                        # dry-run contra el staging nuevo (solo lectura)
//   RECOVERY_CONFIRM=atheron1-hotel-staging-20261009 node recovery/r3-master-data.mjs --apply
// Precondición: modelos x_hotel_* ya existen (R1). Si no, BLOCKED sin escribir nada.
// Tarifas (x_hotel_rate*) NO se tocan aquí: son precios reales y entran aparte como borrador.
import { readBackup, splitRow, m2oName, main, BlockedError, READ_CTX } from './recovery-lib.mjs';
import { connect, makeEnsure, findOne } from './connect.mjs';

const LA_MAGIA = 'HOTEL ATHERON SUITE';
const ROOMS = ['201', '202', '203', '301', '302'];
// Campos con ids viejos o que dependen de módulos aún no verificados: se omiten, no se adivinan.
const PROP_SKIP = new Set(['x_unit_ids', 'x_company_id', 'x_hk_stage_ready_id', 'x_hk_stage_issue_id', 'x_hk_project_id', 'x_hk_stage_todo_id', 'x_hk_stage_doing_id']);

function fromBackup() {
  const props = readBackup('master-data-x_hotel_property.json');
  const units = readBackup('master-data-x_hotel_unit.json');
  const deposits = readBackup('master-data-x_hotel_deposit_policy.json');
  const laMagia = props.find((p) => p.x_name === LA_MAGIA);
  const roomRows = ROOMS.map((n) => units.find((u) => u.x_name === n && m2oName(u.x_property_id) === LA_MAGIA));
  const casaRows = units.filter((u) => u.x_name === 'CASA COMPLETA' && m2oName(u.x_property_id) === LA_MAGIA && u.x_unit_type === 'compuesta');
  if (!laMagia || roomRows.some((r) => !r) || casaRows.length !== 1) throw new BlockedError('RESPALDO INCOMPLETO o ambiguo para La Magia');
  return { laMagia, roomRows, casaRow: casaRows[0], deposits };
}
const propPayload = (laMagia) => Object.fromEntries(Object.entries(splitRow(laMagia).scalars).filter(([k]) => !PROP_SKIP.has(k)));
const unitPlan = (row) => {
  const { scalars, relations } = splitRow(row);
  delete scalars.x_child_ids; delete scalars.x_parent_ids; // las relaciones se enlazan después por ids NUEVOS
  return { scalars, wants: { resource: m2oName(relations.x_resource_id), role: m2oName(relations.x_role_id), product: m2oName(relations.x_product_tmpl_id) } };
};

main(async () => {
  const b = fromBackup();
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({
      property: { key: LA_MAGIA, payload: propPayload(b.laMagia) },
      rooms: b.roomRows.map((r) => ({ key: r.x_name, ...unitPlan(r) })),
      casa: { key: 'CASA COMPLETA', ...unitPlan(b.casaRow), children: ROOMS },
      deposit_policies: b.deposits.map((d) => ({ key: d.x_name, payload: splitRow(d).scalars })),
      omitted_property_fields: [...PROP_SKIP],
    }, null, 2));
    return;
  }

  const { args, write, ex, log } = await connect('r3');
  const ensure = makeEnsure({ ex, write, args, log });

  const present = new Set((await ex('ir.model', 'search_read', [[['model', 'like', 'x_hotel_']]], { fields: ['model'], context: READ_CTX })).map((m) => m.model));
  for (const m of ['x_hotel_property', 'x_hotel_unit', 'x_hotel_deposit_policy']) {
    if (!present.has(m)) throw new BlockedError(`falta el modelo ${m} (R1). No se escribió nada.`);
  }

  // 1) propiedad
  const propId = await ensure('x_hotel_property', [['x_name', '=', LA_MAGIA]], propPayload(b.laMagia), LA_MAGIA);

  // 2) unidades: habitaciones primero, luego Casa
  async function unit(row) {
    const { scalars, wants } = unitPlan(row);
    const payload = { ...scalars };
    if (propId) payload.x_property_id = propId;
    const res = wants.resource && await findOne(ex, 'resource.resource', [['name', '=', wants.resource]]);
    const role = wants.role && await findOne(ex, 'planning.role', [['name', '=', wants.role]]);
    const code = (String(wants.product ?? '').match(/^\[([^\]]+)\]/) || [])[1];
    const prod = code && await findOne(ex, 'product.template', [['default_code', '=', code]]);
    if (res) payload.x_resource_id = res; else log.add('FALTA', 'resource.resource', String(wants.resource), { note: 'crear/enlazar antes de operar' });
    if (role) payload.x_role_id = role; else log.add('FALTA', 'planning.role', String(wants.role), { note: 'crear/enlazar antes de operar' });
    if (prod) payload.x_product_tmpl_id = prod; else log.add('FALTA', 'product.template', String(wants.product), { note: 'se deja vacío' });
    // Si falta la propiedad (dry-run) no se puede acotar por propiedad: dominio imposible => CREATE?
    const domain = propId ? [['x_name', '=', row.x_name], ['x_property_id', '=', propId]] : [['id', '=', 0]];
    const compare = Object.keys(payload).filter((k) => !['x_lock_touch'].includes(k));
    return ensure('x_hotel_unit', domain, payload, `${row.x_name}${row.x_unit_type === 'compuesta' ? ' (compuesta)' : ''}`, { compareFields: compare });
  }
  const unitIds = {};
  for (const r of b.roomRows) unitIds[r.x_name] = await unit(r);
  const casaId = await unit(b.casaRow);

  // 3) enlace Casa -> hijas, solo con ids NUEVOS ya resueltos y solo si falta
  if (casaId && ROOMS.every((n) => unitIds[n])) {
    const [cur] = await ex('x_hotel_unit', 'read', [[casaId], ['x_child_ids']], { context: READ_CTX });
    const want = ROOMS.map((n) => unitIds[n]).sort((a, c) => a - c);
    const have = [...(cur.x_child_ids ?? [])].sort((a, c) => a - c);
    if (JSON.stringify(want) === JSON.stringify(have)) log.add('SKIP', 'x_hotel_unit', 'CASA COMPLETA -> hijas', { id: casaId });
    else if (write) { await ex('x_hotel_unit', 'write', [[casaId], { x_child_ids: [[6, 0, want]] }]); log.add('LINK', 'x_hotel_unit', 'CASA COMPLETA -> 201,202,203,301,302', { id: casaId, before: have, after: want }); }
    else log.add('LINK?', 'x_hotel_unit', 'CASA COMPLETA -> 201,202,203,301,302', { before: have, after: want });
  }

  // 4) políticas de anticipo
  for (const d of b.deposits) {
    const p = splitRow(d).scalars;
    if (propId) p.x_property_id = propId;
    await ensure('x_hotel_deposit_policy', [['x_name', '=', d.x_name]], p, d.x_name);
  }

  // 5) verificación posterior (solo lectura)
  const verify = { rooms_found: Object.values(unitIds).filter(Boolean).length, casa_found: !!casaId };
  console.log('VERIFY', JSON.stringify(verify), '| esperado: rooms_found=5 casa_found=true');
  console.log(`Resumen: ${write ? 'APLICADO' : 'DRY-RUN'} | bitácora: ${log.flush()}`);
});
