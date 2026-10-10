#!/usr/bin/env node
// ATH-STAGING-RECOVERY — R4 (ESQUELETO): acciones de servidor, automatizaciones y crons (HOLD, disponibilidad,
// exclusión Casa<->habitaciones, reservas). NO contiene código de negocio: todo sale de AI/recovery-extract/.
// Reglas: (1) el código se copia TAL CUAL; (2) automatizaciones y crons se crean INACTIVOS, siempre — activarlos es
// un paso manual y autorizado aparte; (3) antes de crear, se avisa de ids viejos escritos a mano en el código y de
// campos x_* que el destino no tiene. DRY-RUN por defecto.
import { loadExtract, main, BlockedError, findOldIdLiterals, fieldTokens, sha256, READ_CTX } from './recovery-lib.mjs';
import { connect, makeEnsure, findOne } from './connect.mjs';
import { txt } from './pure.mjs';

const need = (rows, keys, file) => {
  for (const r of rows) for (const k of keys) if (!(k in r)) throw new BlockedError(`falta campo derivado "${k}" en ${file} (ver EXTRACT-CONTRACT.md)`);
};

main(async () => {
  const actions = loadExtract('server_actions.json');
  const automations = loadExtract('automations.json');
  const crons = loadExtract('crons.json');
  need(actions, ['name', 'model', 'state', 'code'], 'server_actions.json');
  need(automations, ['name', 'model', 'trigger', 'action_names'], 'automations.json');
  need(crons, ['action_name', 'interval_number', 'interval_type'], 'crons.json');

  const { args, write, ex, log } = await connect('r4');
  const ensure = makeEnsure({ ex, write, args, log });
  const modelId = async (m) => findOne(ex, 'ir.model', [['model', '=', m]]);

  // Los nombres de campo de base.automation / ir.cron dependen de la versión: se comprueban, no se suponen.
  const af = await ex('base.automation', 'fields_get', [], { attributes: ['type'] });
  for (const k of ['action_server_ids', 'trigger', 'filter_domain']) if (!(k in af)) throw new BlockedError(`base.automation no tiene el campo ${k} en esta versión`);
  const cf = await ex('ir.cron', 'fields_get', [], { attributes: ['type'] });
  const cronNameField = 'cron_name' in cf ? 'cron_name' : 'name' in cf ? 'name' : null;
  if (!cronNameField) throw new BlockedError('ir.cron sin campo de nombre reconocible');

  // Dependencias: campos x_* usados por el código que no existen en el destino
  const tokens = [...new Set(actions.flatMap((a) => fieldTokens(a.code)))];
  const existing = new Set((await ex('ir.model.fields', 'search_read', [[['name', 'in', tokens]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
  const missingTokens = tokens.filter((t) => !existing.has(t));
  if (missingTokens.length) log.add('DEP_FALTA', 'ir.model.fields', missingTokens.join(','), { note: 'R1 debe correr antes' });

  // 1) acciones de servidor
  const actionIds = new Map(); // `${model}::${name}` -> id nuevo
  for (const a of actions) {
    const name = txt(a.name);
    const mid = await modelId(a.model);
    if (!mid) { log.add('FALTA', 'ir.model', a.model, { note: `para acción "${name}"` }); continue; }
    const oldIds = findOldIdLiterals(a.code);
    if (oldIds.length) log.add('REVISAR', 'ir.actions.server', name, { note: `código con números iguales a ids del staging viejo: ${oldIds.join(',')}` });
    const payload = { name, model_id: mid, state: a.state, code: a.code };
    if (a.binding_type) payload.binding_type = a.binding_type;
    const id = await ensure('ir.actions.server', [['name', '=', name], ['model_id', '=', mid]], payload, `${name} [sha ${sha256(a.code).slice(0, 8)}]`, { compareFields: ['code', 'state'] });
    if (id) actionIds.set(`${a.model}::${name}`, id);
  }
  const actionByName = async (n) => [...actionIds].find(([k]) => k.endsWith(`::${n}`))?.[1] ?? findOne(ex, 'ir.actions.server', [['name', '=', n]]);

  // 2) automatizaciones: SIEMPRE inactivas
  for (const b of automations) {
    const name = txt(b.name);
    const mid = await modelId(b.model);
    if (!mid) { log.add('FALTA', 'ir.model', b.model, { note: `para automatización "${name}"` }); continue; }
    const ids = [];
    for (const an of b.action_names) { const i = await actionByName(an); if (i) ids.push(i); else log.add('FALTA', 'ir.actions.server', an, { note: `enlace de "${name}"` }); }
    if (ids.length !== b.action_names.length) { log.add('OMITE', 'base.automation', name, { note: 'acciones sin resolver; no se crea a medias' }); continue; }
    const payload = { name, model_id: mid, trigger: b.trigger, active: false, action_server_ids: [[6, 0, ids]] };
    if (b.filter_domain) payload.filter_domain = b.filter_domain;
    if (b.filter_pre_domain) payload.filter_pre_domain = b.filter_pre_domain;
    await ensure('base.automation', [['name', '=', name], ['model_id', '=', mid]], payload, `${name} (original active=${b.active})`, { compareFields: ['trigger', 'filter_domain'] });
  }

  // 3) crons: SIEMPRE inactivos
  for (const c of crons) {
    const aid = await actionByName(c.action_name);
    if (!aid) { log.add('FALTA', 'ir.actions.server', c.action_name, { note: 'para cron' }); continue; }
    const cname = txt(c.cron_name ?? c.name ?? c.action_name);
    await ensure('ir.cron', [[cronNameField, '=', cname]], { [cronNameField]: cname, ir_actions_server_id: aid, interval_number: c.interval_number, interval_type: c.interval_type, active: false }, `${cname} (original active=${c.active})`, { compareFields: ['interval_number', 'interval_type'] });
  }

  console.log('RECORDATORIO: nada se activó. Activar automatizaciones/crons es un paso manual autorizado (matriz §6, R4).');
  console.log(`Resumen: ${write ? 'APLICADO' : 'DRY-RUN'} | bitácora: ${log.flush()}`);
});
