#!/usr/bin/env node
/** SOLO LECTURA: cuenta reservas reales por etapa y detecta el patron de datos QA. */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const HOTEL_DOMAIN = [['x_order_involves_room', '=', true]];
const total = await execute('sale.order', 'search_count', [HOTEL_DOMAIN]);

const stages = ['draft', 'opcion', 'hold', 'confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed', 'cancelled', 'no_show'];
const byStage = {};
for (const s of stages) {
  byStage[s] = await execute('sale.order', 'search_count', [[...HOTEL_DOMAIN, ['x_reservation_status', '=', s]]]);
}

// Patron de datos QA/test: nombres de cliente que contienen QA-, FICTICIO, TEST, o el bot generico de WhatsApp.
const qaLike = await execute('sale.order', 'search_count', [
  ['&', ...HOTEL_DOMAIN, '|', '|', '|',
    ['partner_id.name', 'ilike', 'QA-'],
    ['partner_id.name', 'ilike', 'FICTICIO'],
    ['partner_id.name', 'ilike', 'TEST'],
    ['partner_id.name', '=', 'Cliente WhatsApp'],
  ],
]);

console.log(JSON.stringify({ total, byStage, qaLike, realLikely: total - qaLike }, null, 2));
