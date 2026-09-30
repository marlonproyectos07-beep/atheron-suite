#!/usr/bin/env node
/** SOLO LECTURA: valores reales de los campos selection x_reservation_status y x_booking_source. */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

const fields = await transport.call('object', 'execute_kw', [
  config.database, uid, config.technicalSecret,
  'sale.order', 'fields_get',
  [['x_reservation_status', 'x_booking_source', 'x_hold_origin', 'x_meal_plan']],
  { attributes: ['string', 'selection'] },
]);

console.log(JSON.stringify(fields, null, 2));
