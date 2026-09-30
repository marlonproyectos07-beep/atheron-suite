#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Gate 009-F -- SOLO LECTURA: descubre los nombres
 * tecnicos reales (x_...) de los campos hotel-especificos sobre
 * sale.order, para poder filtrar/leer solo por esos campos si se
 * construye un lector de reporteria (nunca adivinados, siempre via
 * fields_get real).
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

const fields = await transport.call('object', 'execute_kw', [
  config.database, uid, config.technicalSecret,
  'sale.order', 'fields_get', [], { attributes: ['string', 'type'] },
]);

const hotelFields = Object.entries(fields)
  .filter(([name]) => name.startsWith('x_'))
  .map(([name, def]) => ({ name, string: def.string, type: def.type }));

console.log(JSON.stringify({ overall: 'DONE', total_fields: Object.keys(fields).length, hotel_fields: hotelFields }, null, 2));
