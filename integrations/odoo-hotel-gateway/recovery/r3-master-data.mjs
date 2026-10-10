#!/usr/bin/env node
// ATH-STAGING-RECOVERY-CLAUDE-001 — R3: propiedad -> 5 habitaciones -> Casa Completa (+ anticipos).
// IDEMPOTENTE y por NOMBRE (nunca por id viejo). DRY-RUN por defecto.
//   node recovery/r3-master-data.mjs --plan                 # sin red: imprime el plan desde el respaldo
//   node recovery/r3-master-data.mjs                        # dry-run contra el staging nuevo (lectura)
//   RECOVERY_CONFIRM=atheron1-hotel-staging-20261009 node recovery/r3-master-data.mjs --apply
// Precondición: modelos x_hotel_* ya existen (R1). Si no, termina con BLOCKED sin escribir nada.
// Tarifas (x_hotel_rate*) NO se tocan aquí: son precios reales y entran en R5 como borrador.
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { loadRecoveryConfig, parseArgs, assertMayWrite, readBackup, splitRow, m2oName, makeLogger } from './recovery-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const PLAN_ONLY = process.argv.includes('--plan');

const props = readBackup('master-data-x_hotel_property.json');
const units = readBackup('master-data-x_hotel_unit.json');
const deposits = readBackup('master-data-x_hotel_deposit_policy.json');

const LA_MAGIA = 'HOTEL ATHERON SUITE';
const ROOMS = ['201', '202', '203', '301', '302'];
// Housekeeping y compañía: ids viejos no válidos. Se omiten y se enlazan en un paso manual si existen.
const PROP_SKIP = new Set(['x_unit_ids', 'x_company_id', 'x_hk_stage_ready_id', 'x_hk_stage_issue_id', 'x_hk_project_id', 'x_hk_stage_todo_id', 'x_hk_stage_doing_id']);

const laMagia = props.find((p) => p.x_name === LA_MAGIA);
const roomRows = ROOMS.map((n) => units.find((u) => u.x_name === n && m2oName(u.x_property_id) === LA_MAGIA));
const casaRow = units.find((u) => u.x_name === 'CASA COMPLETA' && m2oName(u.x_property_id) === LA_MAGIA && u.x_unit_type === 'compuesta');
if (!laMagia || roomRows.some((r) => !r) || !casaRow) { console.error('RESPALDO INCOMPLETO'); process.exit(1); }

const planOf = (row) => {
  const { scalars, relations } = splitRow(row);
  return { scalars, wants: { resource: m2oName(relations.x_resource_id), role: m2oName(relations.x_role_id), product: m2oName(relations.x_product_tmpl_id) } };
};

if (PLAN_ONLY) {
  console.log(JSON.stringify({
    property: { key: LA_MAGIA, payload: Object.fromEntries(Object.entries(splitRow(laMagia).scalars).filter(([k]) => !PROP_SKIP.has(k))) },
    rooms: roomRows.map((r) => ({ key: r.x_name, ...planOf(r) })),
    casa: { key: 'CASA COMPLETA', ...planOf(casaRow), children: ROOMS },
    deposit_policies: deposits.map((d) => ({ key: d.x_name, payload: splitRow(d).scalars })),
  }, null, 2));
  process.exit(0);
}

const cfg = loadRecoveryConfig();
const write = assertMayWrite(args);
const t = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await t.call('common', 'login', [cfg.db, cfg.user, cfg.secret]);
const ex = (model, method, a, kw = {}) => t.call('object', 'execute_kw', [cfg.db, uid, cfg.secret, model, method, a, kw]);
const log = makeLogger('r3');
const AT = { context: { active_test: false } };

const present = new Set((await ex('ir.model', 'search_read', [[['model', 'like', 'x_hotel_']]], { fields: ['model'] })).map((m) => m.model));
for (const m of ['x_hotel_property', 'x_hotel_unit', 'x_hotel_deposit_policy']) {
  if (!present.has(m)) { console.log(`BLOCKED: falta el modelo ${m} (R1). No se escribió nada.`); process.exit(3); }
}

// Solo escribe lo que difiere de verdad; compara contra los campos existentes.
async function ensure(model, domain, payload, label) {
  const found = await ex(model, 'search_read', [domain], { fields: Object.keys(payload), limit: 2, ...AT });
  if (found.length > 1) { log.add('AMBIGUO', model, label); return null; }
  if (found.length === 0) {
    if (!write) { log.add('CREATE?', model, label); return null; }
    const id = await ex(model, 'create', [payload]);
    log.add('CREATE', model, label, { id });
    return id;
  }
  const cur = found[0];
  const diff = Object.keys(payload).filter((k) => JSON.stringify(cur[k] ?? false) !== JSON.stringify(payload[k] ?? false));
  if (diff.length === 0) { log.add('SKIP', model, label, { id: cur.id }); return cur.id; }
  if (write && args.forceDiff) { await ex(model, 'write', [[cur.id], Object.fromEntries(diff.map((k) => [k, payload[k]]))]); log.add('UPDATE', model, label, { id: cur.id, fields: diff }); }
  else log.add('DIFF', model, label, { id: cur.id, fields: diff });
  return cur.id;
}
const one = async (model, domain) => { const r = await ex(model, 'search', [domain], { limit: 2, ...AT }); return r.length === 1 ? r[0] : null; };

// 1) propiedad
const propId = await ensure('x_hotel_property', [['x_name', '=', LA_MAGIA]],
  Object.fromEntries(Object.entries(splitRow(laMagia).scalars).filter(([k]) => !PROP_SKIP.has(k))), LA_MAGIA);

// 2) habitaciones, luego Casa (necesita las hijas)
const unitIds = {};
async function unit(row) {
  const { scalars, wants } = planOf(row);
  const payload = { ...scalars };
  delete payload.x_child_ids; delete payload.x_parent_ids;
  if (propId) payload.x_property_id = propId;
  const res = wants.resource && await one('resource.resource', [['name', '=', wants.resource]]);
  const role = wants.role && await one('planning.role', [['name', '=', wants.role]]);
  const prod = wants.product && (await one('product.template', [['default_code', '=', (wants.product.match(/^\[([^\]]+)\]/) || [])[1] || '']]));
  if (res) payload.x_resource_id = res; else log.add('FALTA', 'resource.resource', String(wants.resource));
  if (role) payload.x_role_id = role; else log.add('FALTA', 'planning.role', String(wants.role));
  if (prod) payload.x_product_tmpl_id = prod;
  const domain = [['x_name', '=', row.x_name], ['x_property_id', '=', propId || -1]];
  return ensure('x_hotel_unit', domain, payload, `${row.x_name}${row.x_unit_type === 'compuesta' ? ' (compuesta)' : ''}`);
}
for (const r of roomRows) unitIds[r.x_name] = await unit(r);
const casaId = await unit(casaRow);
// Enlace padre<->hijas: solo si todo se resolvió. Nunca se enlaza con ids viejos.
if (write && casaId && ROOMS.every((n) => unitIds[n])) {
  await ex('x_hotel_unit', 'write', [[casaId], { x_child_ids: [[6, 0, ROOMS.map((n) => unitIds[n])]] }]);
  log.add('LINK', 'x_hotel_unit', 'CASA COMPLETA -> 201,202,203,301,302');
}

// 3) políticas de anticipo
for (const d of deposits) {
  const p = splitRow(d).scalars;
  if (propId) p.x_property_id = propId;
  await ensure('x_hotel_deposit_policy', [['x_name', '=', d.x_name]], p, d.x_name);
}

console.log(`Resumen: ${write ? 'APLICADO' : 'DRY-RUN'} | rollback log: ${log.flush()}`);
