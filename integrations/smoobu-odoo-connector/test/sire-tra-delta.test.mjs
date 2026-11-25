import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DELTA, DELTA_ID, applyDelta, planDelta, revertDelta, verifyDelta } from '../src/sire-tra/delta.mjs';
import { DELTA_BASE } from '../src/sire-tra/delta-base-2026-11-24.mjs';
import { NS, SERVER_ACTIONS, VIEWS } from '../src/sire-tra/manifest.mjs';
import { bootProduction } from '../src/sire-tra/prod-browser-entry.mjs';

// Despliegue minimo TRA Grupo 1 (2026-11-24). Odoo en memoria con los ids REALES de produccion leidos el 24/11/2026.
const IDS = { model_x_tra_amount: 2534, sa_amount_confirm: 2040, sa_amount_void: 2041, view_amount_form: 6872, view_amount_list: 6873 };
const resolve = (s) => s.replace(/\{\{ref:([a-z0-9_]+)\}\}/g, (_, x) => String(IDS[x]));
const sha12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function prodAtBase() {
  const t = {
    'ir.model.data': Object.entries(IDS).map(([name, res_id], i) => ({ id: 9000 + i, module: NS, name, res_id })),
    'ir.model.fields': [{ id: 70001, model: 'x_tra_amount', name: 'x_amount', ttype: 'float' }],
    'ir.actions.server': [{ id: 2040, code: DELTA_BASE.serverActions.sa_amount_confirm }, { id: 2041, code: 'void' }],
    'ir.ui.view': [{ id: 6872, arch_db: resolve(DELTA_BASE.views.view_amount_form) }, { id: 6873, arch_db: resolve(DELTA_BASE.views.view_amount_list) }],
  };
  const log = [];
  let seq = 80000;
  const match = (r, [f, op, v]) => (op === '=' ? r[f] === v : op === 'in' ? v.includes(r[f]) : (() => { throw new Error(op); })());
  return {
    t, log,
    async searchRead(model, domain) { return (t[model] || []).filter((r) => domain.every((d) => match(r, d))).map((r) => ({ ...r })); },
    async create(model, vals) {
      log.push(['create', model, vals.name]);
      const id = (seq += 1);
      // como Odoo: ir.model.fields calcula "model" a partir de model_id
      (t[model] ||= []).push({ id, ...vals, ...(model === 'ir.model.fields' && vals.model_id === 2534 ? { model: 'x_tra_amount' } : {}) });
      return id;
    },
    async write(model, ids, vals) {
      log.push(['write', model, ids[0], Object.keys(vals).join(',')]);
      for (const r of t[model]) if (ids.includes(r.id)) { if ('arch' in vals) r.arch_db = vals.arch; if ('code' in vals) r.code = vals.code; }
    },
  };
}

test('contenido base = lo que hay en produccion (sha256 comprobado el 24/11/2026 en atheron1)', () => {
  assert.equal(DELTA_BASE.commit, 'e93ea57');
  assert.equal(DELTA_BASE.manifestFingerprint, '6ead35ac6e33321f');
  assert.equal(sha12(DELTA_BASE.serverActions.sa_amount_confirm), '481f7409e659');
  assert.equal(sha12(resolve(DELTA_BASE.views.view_amount_form)), '84f7e14ebeac');
  assert.equal(sha12(resolve(DELTA_BASE.views.view_amount_list)), '9df237346854');
  // y la rama cambia exactamente esos tres objetos
  assert.notEqual(SERVER_ACTIONS.find((s) => s.xmlid === 'sa_amount_confirm').code, DELTA_BASE.serverActions.sa_amount_confirm);
  for (const v of DELTA.views) assert.notEqual(VIEWS.find((x) => x.xmlid === v).arch, DELTA_BASE.views[v]);
});

test('plan: solo lecturas; 2 campos, 1 accion y 2 vistas; respaldo exacto de lo que se reemplaza', async () => {
  const o = prodAtBase();
  const plan = await planDelta(o);
  assert.equal(o.log.length, 0, 'el plan no escribe');
  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.changes.map((c) => `${c.kind}:${c.kind === 'create_field' ? c.name : c.xmlid}`), ['create_field:x_excludes_taxes', 'create_field:x_covers_all_guests', 'write_action:sa_amount_confirm', 'write_view:view_amount_form', 'write_view:view_amount_list']);
  assert.deepEqual(plan.backup.fieldsAbsent, ['x_excludes_taxes', 'x_covers_all_guests']);
  assert.equal(plan.backup.actions[0].code, DELTA_BASE.serverActions.sa_amount_confirm);
  assert.deepEqual(plan.backup.views.map((v) => [v.id, v.arch]), [[6872, resolve(DELTA_BASE.views.view_amount_form)], [6873, resolve(DELTA_BASE.views.view_amount_list)]]);
  assert.equal(plan.changes.find((c) => c.xmlid === 'view_amount_form').arch.includes('name="2040"'), true, 'referencias resueltas con los ids reales');
});

test('aplicar: escribe solo esos cinco objetos, campos antes que vistas; verificar queda limpio', async () => {
  const o = prodAtBase();
  const r = await applyDelta(o, await planDelta(o));
  assert.equal(r.id, DELTA_ID);
  assert.deepEqual(o.log, [
    ['create', 'ir.model.fields', 'x_excludes_taxes'], ['create', 'ir.model.data', 'field_x_tra_amount__x_excludes_taxes'],
    ['create', 'ir.model.fields', 'x_covers_all_guests'], ['create', 'ir.model.data', 'field_x_tra_amount__x_covers_all_guests'],
    ['write', 'ir.actions.server', 2040, 'code'], ['write', 'ir.ui.view', 6872, 'arch'], ['write', 'ir.ui.view', 6873, 'arch'],
  ]);
  const f = o.t['ir.model.fields'].find((x) => x.name === 'x_excludes_taxes');
  assert.deepEqual([f.model_id, f.ttype, f.state], [2534, 'boolean', 'manual']);
  assert.equal(o.t['ir.model.data'].find((x) => x.name === 'field_x_tra_amount__x_covers_all_guests').noupdate, true);
  const v = await verifyDelta(o);
  assert.equal(v.ok, true);
  assert.equal(v.done.length, 5);
  const n = o.log.length;
  assert.deepEqual((await applyDelta(o, await planDelta(o))).applied, [], 'repetir no escribe nada');
  assert.equal(o.log.length, n);
});

test('deriva o campo ajeno: plan bloqueado y cero escrituras', async () => {
  const drifted = prodAtBase();
  drifted.t['ir.actions.server'][0].code += '\n# cambio manual';
  const p1 = await planDelta(drifted);
  assert.deepEqual(p1.blocked, [{ item: 'sa_amount_confirm', reason: 'DRIFT' }]);
  await assert.rejects(applyDelta(drifted, p1), (e) => e.code === 'PLAN_BLOCKED');
  const viewDrift = prodAtBase();
  viewDrift.t['ir.ui.view'][1].arch_db = '<list/>';
  assert.deepEqual((await planDelta(viewDrift)).blocked, [{ item: 'view_amount_list', reason: 'DRIFT' }]);
  const foreign = prodAtBase();
  foreign.t['ir.model.fields'].push({ id: 1, model: 'x_tra_amount', name: 'x_excludes_taxes', ttype: 'boolean' });
  assert.deepEqual((await planDelta(foreign)).blocked, [{ item: 'x_tra_amount.x_excludes_taxes', reason: 'FIELD_EXISTS_NOT_OURS' }]);
  for (const o of [drifted, viewDrift, foreign]) assert.equal(o.log.length, 0);
  await assert.rejects(applyDelta(prodAtBase(), null), (e) => e.code === 'PLAN_REQUIRED');
});

test('reversion: devuelve accion y vistas al respaldo y conserva los campos; se niega si algo cambio despues', async () => {
  const o = prodAtBase();
  const plan = await planDelta(o);
  const backup = JSON.parse(JSON.stringify(plan.backup)); // el respaldo se guarda fuera de Odoo como JSON
  await applyDelta(o, plan);
  const r = await revertDelta(o, backup);
  assert.deepEqual(r.reverted, ['view:view_amount_form', 'view:view_amount_list', 'action:sa_amount_confirm']);
  assert.deepEqual(r.fieldsKept, ['x_excludes_taxes', 'x_covers_all_guests']);
  assert.equal(o.t['ir.actions.server'][0].code, DELTA_BASE.serverActions.sa_amount_confirm);
  assert.equal(o.t['ir.ui.view'][0].arch_db, resolve(DELTA_BASE.views.view_amount_form));
  assert.ok(o.t['ir.model.fields'].some((f) => f.name === 'x_excludes_taxes'), 'los campos no se borran');
  const again = await planDelta(o);
  assert.deepEqual([again.blocked, again.changes.map((c) => c.kind)], [[], ['write_action', 'write_view', 'write_view']]);

  const o2 = prodAtBase();
  const p2 = await planDelta(o2);
  await applyDelta(o2, p2);
  o2.t['ir.ui.view'][0].arch_db += ' ';
  const writes = o2.log.length;
  await assert.rejects(revertDelta(o2, p2.backup), (e) => e.code === 'REVERT_BLOCKED');
  assert.equal(o2.log.length, writes, 'sin escrituras');
  await assert.rejects(revertDelta(o2, {}), (e) => e.code === 'BACKUP_REQUIRED');
});

test('produccion: aplicar el delta exige respaldo de configuracion y plan limpio de la misma sesion', async () => {
  let calls = 0;
  const win = { location: { hostname: 'atheron1.odoo.com' }, fetch: async () => { calls += 1; throw new Error('sin red en la prueba'); } };
  const p = bootProduction(win, 'si-aprobado-por-marlon');
  await assert.rejects(p.applyDelta(), (e) => e.code === 'SNAPSHOT_REQUIRED');
  assert.equal(p.deltaBackup(), null);
  assert.equal(calls, 0);
  assert.throws(() => bootProduction(win, 'otra frase'));
});
