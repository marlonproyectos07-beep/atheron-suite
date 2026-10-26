import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runRecoveryCheck } from '../src/recovery-check.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';

const mkClient = (handler, calls = []) => new OdooJson2Client({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', fetchImpl: async (url, init) => {
  const [, model, method] = new URL(url).pathname.match(/\/json\/2\/([^/]+)\/([^/]+)$/); calls.push(`${model}/${method}`);
  return { ok: true, status: 200, json: async () => handler(model, method, JSON.parse(init.body)) };
} });
const base = (over = {}) => (model, method, p) => {
  if (over[`${model}/${method}`]) return over[`${model}/${method}`](p);
  if (method === 'fields_get') return model === 'res.users' ? { group_ids: {}, company_ids: {} } : Object.fromEntries(['id', 'name', 'cron_name', 'active', 'nextcall', 'lastcall', 'interval_number', 'interval_type', 'ir_actions_server_id', 'user_id', 'scope', 'create_date', 'expiration_date', 'create_uid', 'state', 'origin', 'x_checkin', 'is_company', 'model', 'res_id', 'message_type', 'failure_type'].map((k) => [k, {}]));
  if (method === 'search_count') return 0;
  const rows = {
    'planning.slot': [], 'x_availability': [{ id: 1171, x_date: '2026-10-15', x_booked: 0, x_total_units: 1, x_to_recompute: false }, { id: 1172, x_date: '2026-10-16', x_booked: 0, x_total_units: 1, x_to_recompute: false }],
    'ir.attachment': [], 'ir.cron': [{ id: 9, cron_name: 'Booking Engine: Update Availabilities', active: true, nextcall: '2026-10-26 23:00:00', lastcall: '2026-10-26 22:00:00', interval_number: 1, interval_type: 'hours', ir_actions_server_id: [1493, 'x'], user_id: [1, 'o'] }],
    'ir.cron.trigger': [{ id: 3, cron_id: [9, 'c'], call_at: '2026-10-26 22:31:00', create_date: '2026-10-26 22:24:30' }], 'ir.model.data': [{ name: 'cron_update', model: 'ir.cron', res_id: 9 }],
    'ir.actions.server': [{ id: 1493, name: 'BE', state: 'code', code: "avail.write({'x_booked': 1})" }], 'res.users': [{ id: 2, active: true, share: false, login: 'a@b.c', create_date: '2025-01-01', group_ids: [1, 2], company_ids: [5] }],
    'res.groups': [{ id: 1, full_name: 'Administration / Settings' }, { id: 2, full_name: 'Planning / Administrator' }], 'res.users.apikeys': [{ id: 1, name: 'key one', user_id: [2, 'u'], scope: 'rpc', create_date: '2026-10-01', expiration_date: false }],
    'ir.model.access': [{ id: 1, model_id: [1, 'planning.slot'], group_id: [2, 'Planning / User'], perm_read: true, perm_write: false, perm_create: false, perm_unlink: false }], 'ir.rule': [{ id: 1, name: 'own', domain_force: "[('user_id','=',user.id)]", groups: [2], global: false }],
    'sale.order': [{ id: 22138, create_date: '2026-10-26 22:17:27', create_uid: [2, 'u'], state: 'draft', origin: 'WEB 123', x_checkin: '2026-11-01', x_checkout: '2026-11-02' }], 'sale.order.line': [{ id: 1, order_id: [22138, 'o'], planning_slot_ids: [] }],
    'res.partner': [{ id: 7878, create_date: '2026-10-26 22:19:35', create_uid: [4, 'p'], is_company: false, customer_rank: 1, type: 'contact' }], 'mail.mail': [{ id: 9606, create_date: '2026-10-26 22:18:30', create_uid: [4, 'p'], state: 'exception', model: 'sale.order', res_id: 22138, message_type: 'notification' }],
  };
  return rows[model] ?? [];
};

test('cierre de recuperacion: ausentes, booked=0, sin pendientes y sin marcador => COMPLETA', async () => {
  const calls = [];
  const r = await runRecoveryCheck({ odoo: mkClient(base(), calls) });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(r.overall, 'OK');
  assert.equal(by['recovery.records-absent'].absent, true);
  assert.equal(by['recovery.availability-offer-12136'].recoveredToZero, true);
  assert.equal(by['recovery.ical-marker'].markerAbsent, true);
  assert.ok(calls.every((c) => /\/(search_read|search_count|fields_get)$/.test(c)), calls.join());
});

test('pendiente: booked sigue en 1 => no se declara recuperado y se identifica el proceso de recalculo', async () => {
  const r = await runRecoveryCheck({ odoo: mkClient(base({ 'x_availability/search_read': () => [{ id: 1171, x_date: '2026-10-15', x_booked: 1, x_total_units: 1, x_to_recompute: true }, { id: 1172, x_date: '2026-10-16', x_booked: 0, x_total_units: 1, x_to_recompute: true }], 'x_availability/search_count': () => 2 })) });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(by['recovery.availability-offer-12136'].recoveredToZero, false);
  assert.equal(by['recovery.availability-offer-12136'].bookedOnNight, 1);
  assert.equal(by['recovery.recompute-process'].crons[0].serverActionId, 1493);
  assert.equal(by['recovery.recompute-process'].pendingTriggers[0].cron, 9);
});

test('seguridad y auditoria: grupos del usuario, claves (sin secreto), reglas y metadatos no personales', async () => {
  const r = await runRecoveryCheck({ odoo: mkClient(base()) });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(by['security.user-uid2'].looksLikeSystemAdministrator, true);
  assert.equal(by['security.user-uid2'].groupCount, 2);
  assert.ok(!JSON.stringify(by['security.api-keys-metadata']).includes('key one'));
  assert.equal(by['security.minimum-access-for-read'].slotRecordRules[0].groups[0], 'Planning / Administrator');
  assert.equal(by['audit.new-records-metadata'].saleOrders[0].createdByUid, 2);
  assert.equal(by['audit.new-records-metadata'].mailMail[0].relatesToResId, 22138);
  const txt = JSON.stringify(r);
  assert.ok(!txt.includes('a@b.c') && !txt.includes('WEB 123'));
});

test('el script solo usa lecturas (analisis estatico)', () => {
  for (const f of ['../src/recovery-check.mjs', '../scripts/recovery-check.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of src.matchAll(/\bodoo\.(\w+)\(/g)) assert.ok(['searchRead', 'searchCount', 'fieldsGet', 'call'].includes(m[1]), `${f}: odoo.${m[1]}`);
    assert.ok(!/['"](create|write|unlink)['"]/.test(src));
  }
});
