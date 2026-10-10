// R6 — operador/recepción (Ángela): usuario Odoo de mínimo privilegio. El correo NO está en el repo: se pasa por entorno
// (RECOVERY_ANGELA_EMAIL) puesto por Marlon; nunca se imprime ni se guarda (la bitácora usa un hash corto).
// Grupos por XMLID (los ids numéricos del staging viejo, 1 y 16, no valen en la base nueva).
//   otorga:  base.group_user, sales_team.group_sale_salesman_all_leads
//   NUNCA:   base.group_system (Ajustes/usuarios), base.group_no_one (técnico / Studio)
import { createHash } from 'node:crypto';
import { BlockedError, READ_CTX } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';

export const meta = { id: 'R6', title: 'Usuario operador (Ángela) de mínimo privilegio', critical: true, needs: 'RECOVERY_ANGELA_EMAIL (lo aporta Marlon en el momento)' };

export const GRANT = Object.freeze([['base', 'group_user'], ['sales_team', 'group_sale_salesman_all_leads']]);
export const DENY = Object.freeze([['base', 'group_system'], ['base', 'group_no_one']]);
const mask = (email) => `usuario:${createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 8)}`;

async function groupId(ex, [module, name]) {
  const r = await ex('ir.model.data', 'search_read', [[['module', '=', module], ['name', '=', name], ['model', '=', 'res.groups']]], { fields: ['res_id'], limit: 2, context: READ_CTX });
  return r.length === 1 ? r[0].res_id : null;
}
/** Odoo puede haber renombrado res.users.groups_id (a group_ids). Se detecta, no se supone. */
async function groupsField(ex) {
  const f = await ex('res.users', 'fields_get', [], { attributes: ['type'] });
  const name = 'group_ids' in f ? 'group_ids' : 'groups_id' in f ? 'groups_id' : null;
  if (!name) throw new BlockedError('res.users sin campo de grupos reconocible (groups_id/group_ids)');
  return name;
}
function email(ctx) {
  const e = ctx.env?.RECOVERY_ANGELA_EMAIL;
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new BlockedError('falta RECOVERY_ANGELA_EMAIL (correo real de Ángela, aportado por Marlon; no se inventa)');
  return e;
}

export const inputs = (ctx) => { email(ctx); };

export async function run(ctx) {
  const { ex, ensure, log } = ctx;
  const mail = email(ctx);
  const grant = []; for (const g of GRANT) { const id = await groupId(ex, g); if (!id) throw new BlockedError(`grupo ${g.join('.')} no existe en el destino`); grant.push(id); }
  const deny = []; for (const g of DENY) { const id = await groupId(ex, g); if (id) deny.push(id); }
  if (grant.some((id) => deny.includes(id))) throw new BlockedError('los grupos a otorgar incluyen uno prohibido');
  const name = ctx.env.RECOVERY_ANGELA_NAME || 'Ángela';
  const gf = await groupsField(ex);
  await ensure('res.users', [['login', '=', mail]], { name, login: mail, email: mail, [gf]: [[6, 0, grant]] }, mask(mail), { compareFields: ['login'], intentDomain: [['name', '=', name]] });
  log.add('NOTA', 'res.users', mask(mail), { note: 'sin contraseña; el acceso lo define Marlon desde el panel de usuarios' });
}

export async function verify(ctx) {
  const mail = email(ctx); const { ex } = ctx; const checks = [];
  const gf = await groupsField(ex);
  const u = await ex('res.users', 'search_read', [[['login', '=', mail]]], { fields: [gf, 'active'], limit: 2, context: READ_CTX });
  checks.push({ name: `${mask(mail)} existe y está activo`, ok: u.length === 1 && u[0].active !== false });
  const have = new Set(u[0]?.[gf] ?? []);
  for (const g of GRANT) { const id = await groupId(ex, g); checks.push({ name: `tiene ${g.join('.')}`, ok: !!id && have.has(id) }); }
  for (const g of DENY) { const id = await groupId(ex, g); checks.push({ name: `NO tiene ${g.join('.')}`, ok: !id || !have.has(id) }); }
  return { ok: checks.every((c) => c.ok), checks };
}
