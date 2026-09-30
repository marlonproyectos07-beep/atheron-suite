#!/usr/bin/env node
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const views = await execute('ir.ui.view', 'search_read', [[['model', '=', 'studio.export.wizard']]], { fields: ['name', 'arch'] });
for (const v of views) {
  console.log('--- VIEW:', v.name, '---');
  console.log(v.arch);
}

const actionRec = await execute('ir.model.data', 'search_read', [[['name', '=', 'studio_export_action'], ['module', '=', 'web_studio']]], { fields: ['model', 'res_id'] });
console.log('ir.model.data studio_export_action:', JSON.stringify(actionRec, null, 2));
if (actionRec.length) {
  const act = await execute(actionRec[0].model, 'read', [[actionRec[0].res_id]]);
  console.log('ACCION:', JSON.stringify(act, null, 2));
}
