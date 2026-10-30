import test from 'node:test';
import assert from 'node:assert/strict';
import { runAudit, analyzeActionCode, redactAuditCode } from '../src/audit.mjs';

test('analisis estatico: detecta HTTP, correo, ventas, iCal, cron, escrituras y horarios', () => {
  const a = analyzeActionCode("import requests\nr = requests.post('https://hook.example.com/x?k=1', json={})\nenv['sale.order'].create({})\nenv['planning.slot'].write({'start_datetime': x})\nrec.message_post(body='hola')\nenv['ir.cron']._trigger()\nics = 'BEGIN:VEVENT'")
  assert.deepEqual([a.http, a.mail, a.saleOrder, a.cronOrQueue, a.ical, a.touchesSlotTimes], [true, true, true, true, true, true]);
  assert.deepEqual(a.hosts, ['hook.example.com']); assert.deepEqual(a.models, ['ir.cron', 'planning.slot', 'sale.order']);
  assert.deepEqual([a.create, a.write, a.unlink], [1, 1, 0]);
  const quiet = analyzeActionCode("for s in records:\n    pass");
  assert.deepEqual([quiet.http, quiet.mail, quiet.saleOrder, quiet.ical, quiet.cronOrQueue, quiet.create], [false, false, false, false, false, 0]);
});

test('redaccion: credenciales, URLs, tokens y correos no salen', () => {
  const r = redactAuditCode("API_KEY = 'abc'\nheaders={'Authorization': 'Bearer zz'}\nurl='https://ex.example.com/a?token=Q'\nx='abcdefghijklmnopqrstuvwxyz0123'\nmail='a@b.com'\nok=1");
  assert.ok(!/abc'|Bearer|token=|abcdefghijklmnopqrstuvwxyz|a@b\.com/.test(r));
  assert.ok(r.includes('[linea omitida: posible credencial]') && r.includes('[long-token]') && r.includes('[email]') && r.includes('ok=1'));
  assert.ok(redactAuditCode('x'.repeat(9000)).length <= 4500);
});

test('auditoria con cliente simulado: usa action_server_ids reales, no lee url de webhooks, solo lecturas', async () => {
  const calls = [];
  const odoo = {
    fieldsGet: async (m) => { calls.push(['fields_get', m]); return m === 'base.automation'
      ? { id: {}, name: {}, active: {}, trigger: {}, model_id: {}, filter_domain: {}, action_server_ids: {}, url: {}, webhook_uuid: {} }
      : { id: {}, name: {}, state: {}, model_id: {}, code: {}, child_ids: {} }; },
    searchRead: async (m, d, f) => { calls.push(['search_read', m, f]);
      if (m === 'base.automation') return [{ id: 170, name: 'Orden borrador', active: true, trigger: 'on_create', model_id: [1, 'Planning Shift'], filter_domain: '[]', action_server_ids: [1877] }];
      if (m === 'ir.actions.server') return d[0][2].includes(1877) ? [{ id: 1877, name: 'A', state: 'code', model_id: [1, 'Planning Shift'], code: "env['sale.order'].create({})", child_ids: [] }] : [];
      if (m === 'ir.cron') return [{ id: 147, cron_name: 'Refrescar iCal', interval_number: 1, interval_type: 'hours', ir_actions_server_id: [1654, 'x'] }];
      if (m === 'ir.config_parameter') return [{ key: 'database.is_neutralized', value: 'True' }];
      if (m === 'ir.module.module') return [{ name: 'base', author: 'Odoo S.A.', latest_version: '19.0.1.3' }, { name: 'atheron_x', author: 'Atheron', latest_version: '1' }];
      return []; },
  };
  const r = await runAudit({ odoo, automationIds: [170, 999], extraActionIds: [] });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.deepEqual(by['base.automation.selected'].missing, [999]);
  assert.deepEqual(by['base.automation.selected'].automations[0].linkedActionIds, [1877]);
  assert.equal(by['ir.actions.server.linked-and-dependencies'].actions[0].analysis.saleOrder, true);
  assert.equal(by['environment.neutralization-and-modules'].baseVersion, '19.0.1.3');
  assert.deepEqual(by['environment.neutralization-and-modules'].nonOdooAuthorModules, [{ name: 'atheron_x', author: 'Atheron' }]);
  assert.ok(calls.every(([op]) => op === 'fields_get' || op === 'search_read'));
  const automationRead = calls.find(([op, m]) => op === 'search_read' && m === 'base.automation');
  assert.ok(!automationRead[2].includes('url') && !automationRead[2].includes('webhook_uuid'));
});
