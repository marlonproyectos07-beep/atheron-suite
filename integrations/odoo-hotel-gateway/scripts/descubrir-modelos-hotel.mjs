#!/usr/bin/env node
/** SOLO LECTURA: descubre los modelos reales detras de x_hotel_unit_id/x_hotel_property_id/x_hotel_rate_id/etc, y busca cualquier modelo custom relacionado con hotel. */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const relFields = await execute('ir.model.fields', 'search_read', [[
  ['model', '=', 'sale.order'],
  ['name', 'in', ['x_hotel_unit_id', 'x_hotel_property_id', 'x_hotel_rate_id', 'x_hotel_deposit_policy_id', 'x_hotel_quote_id', 'x_hotel_payment_ids', 'x_guest_line_ids', 'x_guests', 'x_api_user_id']],
]], { fields: ['name', 'relation', 'ttype'] });
console.log('CAMPOS RELACION:', JSON.stringify(relFields, null, 2));

const customModels = await execute('ir.model', 'search_read', [[['model', 'like', 'hotel.%']]], { fields: ['model', 'name'] });
console.log('MODELOS CUSTOM hotel.*:', JSON.stringify(customModels, null, 2));

const customModelsX = await execute('ir.model', 'search_read', [[['model', 'like', 'x\_%']]], { fields: ['model', 'name'] });
console.log('MODELOS CUSTOM x_*:', JSON.stringify(customModelsX, null, 2));
