#!/usr/bin/env node
// ATH-STAGING-RECOVERY — R7 (ESQUELETO): tablero de Ángela. A diferencia de R1/R4, casi todo sale de evidencia YA en el repo
// (AI/staging-backup + AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md): acción 1909, vistas 6832/6833, filtro 26, menús 1000/1001.
// Lo que falta del dump se marca con BLOCKED. DRY-RUN por defecto.
//   Pasos: (1) prerrequisitos de campos  (2) vistas  (3) acción de ventana  (4) menús  (5) filtro guardado
//          (6) filtros de Ángela (BORRADOR, payloads/search-angela-filtros.xml; solo con --with-filters)
//          (7) contrato de la fila KPI (payloads/kpi-row.json; validado contra src/angela-board-model.mjs, sin escribir)
// Requiere R1 (campos de sale.order) y R4 (acciones de servidor) ya aplicados: los botones de la vista 6832 llaman a
// acciones POR ID NUMÉRICO; aquí se reescriben por el id nuevo, resuelto por nombre.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readBackup, main, BlockedError, READ_CTX, PAYLOAD_DIR } from './recovery-lib.mjs';
import { connect, makeEnsure, findOne } from './connect.mjs';
import { rewriteActionButtons } from './pure.mjs';
import { KPI_ROW, KPI_GROUPS, WINDOW_NAMES } from '../src/angela-board-model.mjs';

// Resolución de la vista padre: por XMLID estándar de Odoo y se VERIFICA que el nombre coincida con el del respaldo.
// (VERIFICAR en dry-run: el script imprime el id resuelto y aborta si el nombre no coincide.)
const PARENTS = {
  kanban: { xmlid: ['sale', 'sale_order_view_kanban'], expectName: 'sale.order.kanban' },        // VERIFICAR xmlid en R0
  form: { xmlid: ['sale', 'view_order_form'], expectName: 'sale.order.form' },                   // VERIFICAR xmlid en R0
  search: { xmlid: null, expectName: 'sale.order.search.inherit.quotation' },                    // sin xmlid conocido: por nombre
};
const REQUIRED_SO_FIELDS = ['x_hotel_unit_id', 'x_reservation_status', 'x_checkin', 'x_checkout', 'x_hotel_balance', 'x_num_adults', 'x_hold_expired', 'x_hold_expires'];

main(async () => {
  const { args, write, ex, log } = await connect('r7');
  const ensure = makeEnsure({ ex, write, args, log });
  const withFilters = process.argv.includes('--with-filters');

  // (1) prerrequisitos
  const have = new Set((await ex('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', 'in', REQUIRED_SO_FIELDS]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
  const missing = REQUIRED_SO_FIELDS.filter((f) => !have.has(f));
  if (missing.length) throw new BlockedError(`faltan campos de sale.order (R1): ${missing.join(', ')}`);

  const parent = async (kind) => {
    const p = PARENTS[kind];
    let id = null;
    if (p.xmlid) {
      const r = await ex('ir.model.data', 'search_read', [[['module', '=', p.xmlid[0]], ['name', '=', p.xmlid[1]], ['model', '=', 'ir.ui.view']]], { fields: ['res_id'], limit: 1, context: READ_CTX });
      id = r[0]?.res_id ?? null;
    } else id = await findOne(ex, 'ir.ui.view', [['name', '=', p.expectName], ['model', '=', 'sale.order']]);
    if (!id) throw new BlockedError(`no se resolvió la vista padre "${p.expectName}"`);
    const [v] = await ex('ir.ui.view', 'read', [[id], ['name']], { context: READ_CTX });
    if (v.name !== p.expectName) throw new BlockedError(`vista padre ${id} se llama "${v.name}", se esperaba "${p.expectName}"`);
    console.log(`PADRE ${kind}: id ${id} = ${v.name}`);
    return id;
  };

  const views = readBackup('ir-ui-view-sale-order-inherited.json');
  const v6833 = views.find((v) => v.id === 6833);
  const v6832 = views.find((v) => v.id === 6832);
  if (!v6833 || !v6832) throw new BlockedError('respaldo sin vistas 6832/6833');

  // (2a) Kanban 6833: arch tal cual del respaldo (= bloque documentado en FINAL_APPROVED.md)
  const kanbanParent = await parent('kanban');
  await ensure('ir.ui.view', [['name', '=', v6833.name], ['model', '=', 'sale.order']],
    { name: v6833.name, model: 'sale.order', inherit_id: kanbanParent, mode: 'extension', priority: v6833.priority, arch: v6833.arch, active: true }, v6833.name, { compareFields: ['arch', 'inherit_id'] });

  // (2b) Formulario piloto 6832: botones por id nuevo
  const oldIdToName = new Map(readBackup('ir-actions-server-hotel.json').map((a) => [a.id, a.name]));
  const names = [...new Set([...oldIdToName.values()])].filter((n) => n.startsWith('HOTEL v1'));
  const nameToNew = new Map();
  for (const n of names) { const id = await findOne(ex, 'ir.actions.server', [['name', '=', n], ['model_id.model', '=', 'sale.order']]); if (id) nameToNew.set(n, id); }
  const rw = rewriteActionButtons(v6832.arch, oldIdToName, nameToNew);
  if (rw.unresolved.length) {
    log.add('BLOQUEA', 'ir.ui.view', v6832.name, { note: `botones sin acción en destino (R4): ${rw.unresolved.map((u) => `${u.oldId}:${u.name}`).join(', ')}` });
  } else {
    const formParent = await parent('form');
    await ensure('ir.ui.view', [['name', '=', v6832.name], ['model', '=', 'sale.order']],
      { name: v6832.name, model: 'sale.order', inherit_id: formParent, mode: 'extension', priority: v6832.priority, arch: rw.arch, active: true }, v6832.name, { compareFields: ['arch', 'inherit_id'] });
  }

  // (3) acción de ventana (1909)
  const a1909 = readBackup('ir-actions-act-window-hotel.json').find((a) => a.id === 1909);
  const actId = await ensure('ir.actions.act_window', [['name', '=', a1909.name], ['res_model', '=', 'sale.order']],
    { name: a1909.name, res_model: 'sale.order', domain: a1909.domain, context: a1909.context || '{}', view_mode: a1909.view_mode }, a1909.name, { compareFields: ['domain', 'context', 'view_mode'] });

  // (4) menús 1000 (raíz) y 1001 (hijo)
  const menus = readBackup('ir-ui-menu-hotel.json');
  const root = menus.find((m) => m.id === 1000), kid = menus.find((m) => m.id === 1001);
  const rootId = await ensure('ir.ui.menu', [['name', '=', root.name], ['parent_id', '=', false]], { name: root.name, sequence: root.sequence }, root.name, { compareFields: ['sequence'] });
  if (rootId && actId) await ensure('ir.ui.menu', [['name', '=', kid.name], ['parent_id', '=', rootId]], { name: kid.name, parent_id: rootId, sequence: kid.sequence, action: `ir.actions.act_window,${actId}` }, kid.name, { compareFields: ['sequence'] });
  else log.add('PENDIENTE', 'ir.ui.menu', kid.name, { note: 'depende de la raíz/acción (dry-run)' });

  // (5) filtro guardado 26 «Operación del día (sin canceladas)»
  const f26 = readBackup('ir-filters-sale-order.json').find((f) => f.id === 26);
  if (actId) await ensure('ir.filters', [['name', '=', f26.name], ['model_id', '=', 'sale.order']],
    { name: f26.name, model_id: 'sale.order', domain: f26.domain, context: f26.context, is_default: true, user_ids: [[6, 0, []]], action_id: actId }, f26.name, { compareFields: ['domain', 'is_default'] });
  else log.add('PENDIENTE', 'ir.filters', f26.name, { note: 'depende de la acción (dry-run)' });

  // (6) filtros de Ángela (BORRADOR) — opcional y explícito
  if (withFilters) {
    const arch = readFileSync(resolve(PAYLOAD_DIR, 'search-angela-filtros.xml'), 'utf8');
    const sp = await parent('search');
    await ensure('ir.ui.view', [['name', '=', 'HOTEL v1 — filtros Ángela (HOY/MAÑANA/7 DÍAS/MES)'], ['model', '=', 'sale.order']],
      { name: 'HOTEL v1 — filtros Ángela (HOY/MAÑANA/7 DÍAS/MES)', model: 'sale.order', inherit_id: sp, mode: 'extension', priority: 99, arch, active: true }, 'filtros Ángela', { compareFields: ['arch'] });
  } else console.log('Filtros de Ángela (borrador) NO incluidos: añadir --with-filters tras validar el XML en dry-run.');

  // (7) fila KPI: contrato aprobado. DEBE ir ARRIBA del tablero principal. El transportista (qué la dibuja dentro de Odoo)
  // NO está decidido: ver plan §5. Aquí solo se valida el contrato; no se escribe nada.
  const kpi = JSON.parse(readFileSync(resolve(PAYLOAD_DIR, 'kpi-row.json'), 'utf8'));
  if (JSON.stringify(kpi.kpi_row) !== JSON.stringify(KPI_ROW) || JSON.stringify(kpi.groups) !== JSON.stringify(KPI_GROUPS) || JSON.stringify(kpi.windows) !== JSON.stringify(WINDOW_NAMES)) {
    throw new BlockedError('payloads/kpi-row.json no coincide con src/angela-board-model.mjs; regenerar');
  }
  log.add('PENDIENTE', 'kpi-row', KPI_ROW.map((k) => k.key).join(' > '), { note: 'contrato válido; portador (dashboard Enterprise / vista planning.slot / tablero local) por decidir' });

  console.log(`Resumen: ${write ? 'APLICADO' : 'DRY-RUN'} | bitácora: ${log.flush()}`);
});
