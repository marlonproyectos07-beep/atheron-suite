#!/usr/bin/env node
/** SOLO LECTURA: cuenta pagos reales ya vinculados a reservas de hotel. */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

const rows = await transport.call('object', 'execute_kw', [
  config.database, uid, config.technicalSecret,
  'account.payment', 'search_read',
  [[['x_hotel_sale_order_id', '!=', false]]],
  { fields: ['date', 'amount', 'x_hotel_sale_order_id', 'payment_type', 'state'], limit: 20 },
]);

console.log(JSON.stringify({ overall: 'DONE', count: rows.length, rows }, null, 2));
