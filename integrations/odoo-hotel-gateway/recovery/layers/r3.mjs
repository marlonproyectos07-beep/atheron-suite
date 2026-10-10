// R3 — propiedad -> 5 habitaciones -> Casa Completa -> anticipos. Datos del respaldo JSON del repo. Por NOMBRE, nunca por id viejo.
// Las tarifas (x_hotel_rate*) NO se tocan aquí: son precios reales.
import { readBackup, splitRow, m2oName, BlockedError, READ_CTX, tryExtract, EXTRACT_DIR, WRITE_CTX } from '../recovery-lib.mjs';
import { planRoleMapping, readCurrentRoles } from '../planning-role.mjs';
import { findOne } from '../connect.mjs';

export const meta = { id: 'R3', title: 'Propiedad, habitaciones, Casa Completa, anticipos', critical: true, needs: 'R1 aplicado (modelos x_hotel_*) y recursos/roles de Planning por nombre' };

export const LA_MAGIA = 'HOTEL ATHERON SUITE';
export const ROOMS = ['201', '202', '203', '301', '302'];
const PROP_SKIP = new Set(['x_unit_ids', 'x_company_id', 'x_hk_stage_ready_id', 'x_hk_stage_issue_id', 'x_hk_project_id', 'x_hk_stage_todo_id', 'x_hk_stage_doing_id']);

export function fromBackup() {
  const props = readBackup('master-data-x_hotel_property.json');
  const units = readBackup('master-data-x_hotel_unit.json');
  const deposits = readBackup('master-data-x_hotel_deposit_policy.json');
  const laMagia = props.find((p) => p.x_name === LA_MAGIA);
  const roomRows = ROOMS.map((n) => units.find((u) => u.x_name === n && m2oName(u.x_property_id) === LA_MAGIA));
  const casaRows = units.filter((u) => u.x_name === 'CASA COMPLETA' && m2oName(u.x_property_id) === LA_MAGIA && u.x_unit_type === 'compuesta');
  if (!laMagia || roomRows.some((r) => !r) || casaRows.length !== 1) throw new BlockedError('RESPALDO INCOMPLETO o ambiguo para La Magia');
  return { laMagia, roomRows, casaRow: casaRows[0], deposits };
}
export const propPayload = (laMagia) => Object.fromEntries(Object.entries(splitRow(laMagia).scalars).filter(([k]) => !PROP_SKIP.has(k)));
export const unitPlan = (row) => {
  const { scalars, relations } = splitRow(row);
  delete scalars.x_child_ids; delete scalars.x_parent_ids;
  return { scalars, wants: { resource: m2oName(relations.x_resource_id), role: m2oName(relations.x_role_id), product: m2oName(relations.x_product_tmpl_id) } };
};

export function plan() {
  const b = fromBackup();
  return {
    property: { key: LA_MAGIA, payload: propPayload(b.laMagia) },
    rooms: b.roomRows.map((r) => ({ key: r.x_name, ...unitPlan(r) })),
    casa: { key: 'CASA COMPLETA', ...unitPlan(b.casaRow), children: ROOMS },
    deposit_policies: b.deposits.map((d) => ({ key: d.x_name, payload: splitRow(d).scalars })),
    omitted_property_fields: [...PROP_SKIP],
  };
}

export const inputs = () => { fromBackup(); };

/**
 * Atributos de planning.role (x_casa, x_is_a_room_offer) que la regla 167 necesita. Valores ANTIGUOS: AI/recovery-extract/planning_roles.json
 * (dump). Valores ACTUALES: lectura real del destino. Por nombre exacto, nunca por id; no se inventa ningún valor.
 * Devuelve el plan; si no hay valores antiguos, devuelve null (queda PENDIENTE y bloquea).
 */
async function roleMapping(ctx) {
  const old = tryExtract('planning_roles.json', ctx.extractDir ?? EXTRACT_DIR);
  if (old === null) return null;
  const cur = await readCurrentRoles(ctx.ex, old.map((r) => r.name));
  return planRoleMapping(old, cur);
}

export async function run(ctx) {
  const { ex, ensure, log, write } = ctx;
  const b = fromBackup();
  const present = new Set((await ex('ir.model', 'search_read', [[['model', 'like', 'x_hotel_']]], { fields: ['model'], context: READ_CTX })).map((m) => m.model));
  for (const m of ['x_hotel_property', 'x_hotel_unit', 'x_hotel_deposit_policy']) if (!present.has(m)) throw new BlockedError(`falta el modelo ${m} (R1). No se escribió nada.`);

  const propId = await ensure('x_hotel_property', [['x_name', '=', LA_MAGIA]], propPayload(b.laMagia), LA_MAGIA);
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
    const domain = propId ? [['x_name', '=', row.x_name], ['x_property_id', '=', propId]] : [['id', '=', 0]];
    return ensure('x_hotel_unit', domain, payload, `${row.x_name}${row.x_unit_type === 'compuesta' ? ' (compuesta)' : ''}`, { compareFields: Object.keys(payload) });
  }
  const unitIds = {};
  for (const r of b.roomRows) unitIds[r.x_name] = await unit(r);
  const casaId = await unit(b.casaRow);

  if (casaId && ROOMS.every((n) => unitIds[n])) {
    const [cur] = await ex('x_hotel_unit', 'read', [[casaId], ['x_child_ids']], { context: READ_CTX });
    const want = ROOMS.map((n) => unitIds[n]).sort((a, c) => a - c);
    const have = [...(cur.x_child_ids ?? [])].sort((a, c) => a - c);
    if (JSON.stringify(want) === JSON.stringify(have)) log.add('SKIP', 'x_hotel_unit', 'CASA COMPLETA -> hijas', { id: casaId });
    else if (have.length && !ctx.args.forceDiff) log.add('DIFF', 'x_hotel_unit', 'CASA COMPLETA -> hijas', { id: casaId, note: 'ya tiene hijas distintas; no se sobrescribe sin --force-diff' });
    else if (write) {
      ctx.journal.append({ op: 'UPDATE', layer: ctx.layer, model: 'x_hotel_unit', key: 'CASA COMPLETA -> hijas', id: casaId, before: { x_child_ids: have }, after: { x_child_ids: want }, x2many: ['x_child_ids'] });
      await ex('x_hotel_unit', 'write', [[casaId], { x_child_ids: [[6, 0, want]] }]);
      log.add('LINK', 'x_hotel_unit', 'CASA COMPLETA -> 201,202,203,301,302', { id: casaId });
    } else log.add('LINK?', 'x_hotel_unit', 'CASA COMPLETA -> 201,202,203,301,302', { before: have, after: want });
  }
  for (const d of b.deposits) {
    const p = splitRow(d).scalars; if (propId) p.x_property_id = propId;
    await ensure('x_hotel_deposit_policy', [['x_name', '=', d.x_name]], p, d.x_name);
  }

  // planning.role: atributos de los que depende la regla 167
  const plan = await roleMapping(ctx);
  if (plan === null) { log.add('ROLE_ATTR_PENDIENTE', 'planning.role', 'x_casa / x_is_a_room_offer', { note: 'falta AI/recovery-extract/planning_roles.json (valores antiguos del dump); no se escribe ni se inventa nada' }); return; }
  const ACTION = { FIELD_MISSING: 'ROLE_CAMPO_FALTA', ROLE_ABSENT: 'ROLE_AUSENTE', AMBIGUO: 'ROLE_AMBIGUO' };
  for (const it of plan.items) {
    if (it.status === 'MATCH') { log.add('SKIP', 'planning.role', it.name, { id: it.id }); continue; }
    if (ACTION[it.status]) { log.add(ACTION[it.status], 'planning.role', it.name, { note: `${it.status}${it.fields.length ? ': ' + it.fields.join(', ') : ''}` }); continue; }
    const apply = it.status === 'VALUES_MISSING' ? it.set : (ctx.args.forceDiff ? Object.fromEntries(Object.keys(it.old).map((f) => [f, it.old[f]])) : null);
    if (it.status === 'VALUES_DIFFER' && !apply) { log.add('ROLE_CONFLICTO', 'planning.role', it.name, { note: `el destino ya tiene ${JSON.stringify(it.current)}; antiguo ${JSON.stringify(it.old)}; no se sobrescribe sin --force-diff` }); continue; }
    if (!write) { log.add('ROLE_SET?', 'planning.role', it.name, { note: JSON.stringify(apply) }); continue; }
    const before = it.status === 'VALUES_MISSING' ? Object.fromEntries(Object.keys(apply).map((f) => [f, false])) : it.current;
    ctx.journal.append({ op: 'UPDATE', layer: ctx.layer, model: 'planning.role', key: `${it.name} atributos`, id: it.id, before, after: apply });
    await ex('planning.role', 'write', [[it.id], apply], { context: WRITE_CTX });
    log.add('UPDATE', 'planning.role', it.name, { id: it.id, fields: Object.keys(apply) });
  }
}

export async function verify(ctx) {
  const b = fromBackup(); const checks = [];
  const rp = await roleMapping(ctx);
  checks.push(rp === null ? { name: 'planning.role: atributos (falta planning_roles.json)', ok: false, blocked: true } : { name: `planning.role: atributos x_casa / x_is_a_room_offer (${rp.pending.join('; ') || 'todos coinciden'})`, ok: rp.items.every((i) => i.status === 'MATCH') });
  const one = async (model, domain) => (await ctx.ex(model, 'search_read', [domain], { fields: ['id'], limit: 3, context: READ_CTX }));
  const prop = await one('x_hotel_property', [['x_name', '=', LA_MAGIA]]);
  checks.push({ name: 'propiedad La Magia única', ok: prop.length === 1 });
  const ids = [];
  for (const n of ROOMS) { const r = await one('x_hotel_unit', [['x_name', '=', n]]); checks.push({ name: `habitación ${n}`, ok: r.length === 1 }); if (r[0]) ids.push(r[0].id); }
  const casa = await ctx.ex('x_hotel_unit', 'search_read', [[['x_unit_type', '=', 'compuesta'], ['x_name', '=', 'CASA COMPLETA']]], { fields: ['x_child_ids'], limit: 3, context: READ_CTX });
  checks.push({ name: 'Casa Completa única', ok: casa.length === 1 });
  checks.push({ name: 'Casa con las 5 hijas', ok: casa.length === 1 && JSON.stringify([...casa[0].x_child_ids].sort((a, c) => a - c)) === JSON.stringify([...ids].sort((a, c) => a - c)) && ids.length === 5 });
  for (const d of b.deposits) checks.push({ name: `anticipo ${d.x_name}`, ok: (await one('x_hotel_deposit_policy', [['x_name', '=', d.x_name]])).length === 1 });
  return { ok: checks.every((c) => c.ok), checks };
}
