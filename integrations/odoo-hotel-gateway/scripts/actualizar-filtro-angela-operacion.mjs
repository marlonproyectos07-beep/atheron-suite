#!/usr/bin/env node
/**
 * Redefine el filtro 26: en vez de intentar distinguir "real" vs "QA" por
 * nombre (hallazgo real: HOY el 100% de las reservas son de prueba,
 * porque el piloto real de WhatsApp todavia no esta conectado -- filtrar
 * por nombre dejaria el tablero vacio, inutil para practicar/entrenar),
 * se oculta por ESTADO: CANCELADA/NO_SHOW (resueltas, nada que hacer)
 * quedan fuera por defecto; todo lo demas (CONSULTA/OPCION/HOLD/
 * CONFIRMADA/PRE_CHECKIN/CHECKIN/CHECKOUT/CERRADA) sigue visible, sea
 * real o de prueba. Esto es lo que realmente resuelve el problema
 * original (205 de 238 tarjetas eran CANCELADA vieja) sin vaciar el
 * tablero. Nada se borra: quitando el filtro se ve todo de nuevo.
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const NEW_DOMAIN = "[('x_hotel_unit_id', '!=', False), ('x_reservation_status', 'not in', ['cancelled', 'no_show'])]";
const NEW_NAME = 'Operación del día (sin canceladas)';

await execute('ir.filters', 'write', [[26], { name: NEW_NAME, domain: NEW_DOMAIN }]);
const updated = await execute('ir.filters', 'read', [[26]], { fields: ['id', 'name', 'domain', 'is_default', 'user_ids', 'action_id'] });
console.log(JSON.stringify(updated[0], null, 2));

const resultCount = await execute('sale.order', 'search_count', [[['x_hotel_unit_id', '!=', false], ['x_reservation_status', 'not in', ['cancelled', 'no_show']]]]);
console.log('registros visibles por defecto con el nuevo filtro:', resultCount);
