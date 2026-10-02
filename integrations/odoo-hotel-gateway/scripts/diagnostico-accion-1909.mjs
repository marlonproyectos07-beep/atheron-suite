#!/usr/bin/env node
/** SOLO LECTURA: domain/contexto reales de la accion 1909 (Reservas hotel). */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const action = await execute('ir.actions.act_window', 'read', [[1909]], { fields: ['name', 'res_model', 'domain', 'context', 'view_mode'] });
console.log(JSON.stringify(action, null, 2));
