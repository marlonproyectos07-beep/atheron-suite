// R7 — tablero de Ángela: vistas 6833 (Kanban) y 6832 (formulario con botones), acción 1909, menús 1000/1001, filtro 26, y
// (opcional, borrador) filtros HOY/MAÑANA/7 DÍAS/MES. Evidencia 100 % del repo. Los botones de 6832 llaman acciones por id
// numérico: se reescriben por el id nuevo resuelto por NOMBRE; si alguna acción no existe, la vista NO se crea (BLOQUEA).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readBackup, BlockedError, READ_CTX, PAYLOAD_DIR } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { rewriteActionButtons } from '../pure.mjs';
import { KPI_ROW, KPI_GROUPS, WINDOW_NAMES } from '../../src/angela-board-model.mjs';

export const meta = { id: 'R7', title: 'Tablero de Ángela (vistas, acción, menús, filtro, contrato KPI)', critical: true, needs: 'R2 (campos x_*) y R5 (acciones HOTEL v1)' };

// Vista padre: XMLID estándar de Odoo + verificación por NOMBRE (si no coincide, se aborta). Todo esto exige Odoo real.
export const PARENTS = Object.freeze({
  kanban: { xmlid: ['sale', 'sale_order_view_kanban'], expectName: 'sale.order.kanban' },
  form: { xmlid: ['sale', 'view_order_form'], expectName: 'sale.order.form' },
  search: { xmlid: null, expectName: 'sale.order.search.inherit.quotation' },
});
export const REQUIRED_SO_FIELDS = Object.freeze(['x_hotel_unit_id', 'x_reservation_status', 'x_checkin', 'x_checkout', 'x_hotel_balance', 'x_num_adults', 'x_hold_expired', 'x_hold_expires']);

async function parentView(ex, kind) {
  const p = PARENTS[kind]; let id = null;
  if (p.xmlid) {
    const r = await ex('ir.model.data', 'search_read', [[['module', '=', p.xmlid[0]], ['name', '=', p.xmlid[1]], ['model', '=', 'ir.ui.view']]], { fields: ['res_id'], limit: 1, context: READ_CTX });
    id = r[0]?.res_id ?? null;
  } else id = await findOne(ex, 'ir.ui.view', [['name', '=', p.expectName], ['model', '=', 'sale.order']]);
  if (!id) throw new BlockedError(`no se resolvió la vista padre "${p.expectName}"`);
  const [v] = await ex('ir.ui.view', 'read', [[id], ['name']], { context: READ_CTX });
  if (v.name !== p.expectName) throw new BlockedError(`vista padre ${id} se llama "${v.name}", se esperaba "${p.expectName}"`);
  return id;
}
function evidence() {
  const views = readBackup('ir-ui-view-sale-order-inherited.json');
  const v6833 = views.find((v) => v.id === 6833), v6832 = views.find((v) => v.id === 6832);
  if (!v6833 || !v6832) throw new BlockedError('respaldo sin vistas 6832/6833');
  const a1909 = readBackup('ir-actions-act-window-hotel.json').find((a) => a.id === 1909);
  const menus = readBackup('ir-ui-menu-hotel.json');
  const f26 = readBackup('ir-filters-sale-order.json').find((f) => f.id === 26);
  const oldIdToName = new Map(readBackup('ir-actions-server-hotel.json').map((a) => [a.id, a.name]));
  return { v6833, v6832, a1909, root: menus.find((m) => m.id === 1000), kid: menus.find((m) => m.id === 1001), f26, oldIdToName };
}
async function newActionIds(ex, oldIdToName) {
  const names = [...new Set([...oldIdToName.values()])].filter((n) => n.startsWith('HOTEL v1') && !n.startsWith('ROLLBACK'));
  const m = new Map();
  for (const n of names) { const id = await findOne(ex, 'ir.actions.server', [['name', '=', n], ['model_id.model', '=', 'sale.order']]); if (id) m.set(n, id); }
  return m;
}
const kpiContract = () => {
  const kpi = JSON.parse(readFileSync(resolve(PAYLOAD_DIR, 'kpi-row.json'), 'utf8'));
  if (JSON.stringify(kpi.kpi_row) !== JSON.stringify(KPI_ROW) || JSON.stringify(kpi.groups) !== JSON.stringify(KPI_GROUPS) || JSON.stringify(kpi.windows) !== JSON.stringify(WINDOW_NAMES)) throw new BlockedError('payloads/kpi-row.json no coincide con src/angela-board-model.mjs; regenerar');
  return kpi;
};
const FILTER_VIEW = 'HOTEL v1 — filtros Ángela (HOY/MAÑANA/7 DÍAS/MES)';

export const inputs = () => { evidence(); kpiContract(); };

export async function run(ctx) {
  const { ex, ensure, log } = ctx;
  const withFilters = ctx.args.withFilters || process.argv.includes('--with-filters');
  const have = new Set((await ex('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', 'in', [...REQUIRED_SO_FIELDS]]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
  const missing = REQUIRED_SO_FIELDS.filter((f) => !have.has(f));
  if (missing.length) throw new BlockedError(`faltan campos de sale.order (R2): ${missing.join(', ')}`);
  const E = evidence();

  const kp = await parentView(ex, 'kanban');
  await ensure('ir.ui.view', [['name', '=', E.v6833.name], ['model', '=', 'sale.order']], { name: E.v6833.name, model: 'sale.order', inherit_id: kp, mode: 'extension', priority: E.v6833.priority, arch: E.v6833.arch, active: true }, E.v6833.name, { compareFields: ['arch', 'inherit_id'] });

  const rw = rewriteActionButtons(E.v6832.arch, E.oldIdToName, await newActionIds(ex, E.oldIdToName));
  if (rw.unresolved.length) log.add('BLOQUEA', 'ir.ui.view', E.v6832.name, { note: `botones sin acción en destino (R5): ${rw.unresolved.map((u) => `${u.oldId}:${u.name}`).join(', ')}` });
  else {
    const fp = await parentView(ex, 'form');
    await ensure('ir.ui.view', [['name', '=', E.v6832.name], ['model', '=', 'sale.order']], { name: E.v6832.name, model: 'sale.order', inherit_id: fp, mode: 'extension', priority: E.v6832.priority, arch: rw.arch, active: true }, E.v6832.name, { compareFields: ['arch', 'inherit_id'] });
  }

  const actId = await ensure('ir.actions.act_window', [['name', '=', E.a1909.name], ['res_model', '=', 'sale.order']], { name: E.a1909.name, res_model: 'sale.order', domain: E.a1909.domain, context: E.a1909.context || '{}', view_mode: E.a1909.view_mode }, E.a1909.name, { compareFields: ['domain', 'context', 'view_mode'] });
  const rootId = await ensure('ir.ui.menu', [['name', '=', E.root.name], ['parent_id', '=', false]], { name: E.root.name, sequence: E.root.sequence }, E.root.name, { compareFields: ['sequence'] });
  if (rootId && actId) await ensure('ir.ui.menu', [['name', '=', E.kid.name], ['parent_id', '=', rootId]], { name: E.kid.name, parent_id: rootId, sequence: E.kid.sequence, action: `ir.actions.act_window,${actId}` }, E.kid.name, { compareFields: ['sequence'] });
  else log.add('PENDIENTE', 'ir.ui.menu', E.kid.name, { note: 'depende de la raíz/acción (dry-run)' });
  if (actId) await ensure('ir.filters', [['name', '=', E.f26.name], ['model_id', '=', 'sale.order']], { name: E.f26.name, model_id: 'sale.order', domain: E.f26.domain, context: E.f26.context, is_default: true, user_ids: [[6, 0, []]], action_id: actId }, E.f26.name, { compareFields: ['domain', 'is_default'] });
  else log.add('PENDIENTE', 'ir.filters', E.f26.name, { note: 'depende de la acción (dry-run)' });

  if (withFilters) {
    const arch = readFileSync(resolve(PAYLOAD_DIR, 'search-angela-filtros.xml'), 'utf8');
    const sp = await parentView(ex, 'search');
    await ensure('ir.ui.view', [['name', '=', FILTER_VIEW], ['model', '=', 'sale.order']], { name: FILTER_VIEW, model: 'sale.order', inherit_id: sp, mode: 'extension', priority: 99, arch, active: true }, 'filtros Ángela', { compareFields: ['arch'] });
  }
  kpiContract();
  log.add('PENDIENTE', 'kpi-row', KPI_ROW.map((k) => k.key).join(' > '), { note: 'contrato válido; portador (dashboard Enterprise / vista planning.slot / tablero local) por decidir' });
}

export async function verify(ctx) {
  const { ex } = ctx; const E = evidence(); const checks = [];
  const one = async (model, domain, fields) => ex(model, 'search_read', [domain], { fields, limit: 3, context: READ_CTX });
  const k = await one('ir.ui.view', [['name', '=', E.v6833.name], ['model', '=', 'sale.order']], ['arch']);
  checks.push({ name: 'vista Kanban 6833', ok: k.length === 1 && k[0].arch === E.v6833.arch });
  const f = await one('ir.ui.view', [['name', '=', E.v6832.name], ['model', '=', 'sale.order']], ['arch']);
  const ids = f[0] ? [...f[0].arch.matchAll(/<button\b[^>]*?\bname="(\d+)"[^>]*?\btype="action"/g)].map((m) => Number(m[1])) : [];
  let allExist = f.length === 1 && ids.length > 0;
  for (const id of ids) if (!(await ex('ir.actions.server', 'search', [[['id', '=', id]]], { limit: 1, context: READ_CTX })).length) allExist = false;
  checks.push({ name: `formulario 6832: ${ids.length} botones apuntan a acciones existentes`, ok: allExist });
  checks.push({ name: 'acción de ventana 1909', ok: (await one('ir.actions.act_window', [['name', '=', E.a1909.name], ['res_model', '=', 'sale.order']], ['id'])).length === 1 });
  checks.push({ name: 'menú raíz', ok: (await one('ir.ui.menu', [['name', '=', E.root.name], ['parent_id', '=', false]], ['id'])).length === 1 });
  checks.push({ name: 'menú Reservas hotel', ok: (await one('ir.ui.menu', [['name', '=', E.kid.name]], ['id'])).length === 1 });
  checks.push({ name: 'filtro Operación del día', ok: (await one('ir.filters', [['name', '=', E.f26.name], ['model_id', '=', 'sale.order']], ['id'])).length === 1 });
  try { kpiContract(); checks.push({ name: 'contrato KPI', ok: true }); } catch { checks.push({ name: 'contrato KPI', ok: false }); }
  return { ok: checks.every((c) => c.ok), checks };
}
