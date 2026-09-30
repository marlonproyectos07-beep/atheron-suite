#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Gate 009-F -- diagnostico de SOLO LECTURA: el
 * usuario tecnico ya autorizado (el mismo de accion 1967, credenciales
 * en el secure-store) tiene permiso para `search_read` directo sobre
 * `sale.order` (fuera de la accion 1967)? Responde la opcion B (XML-RPC
 * directo) del Gate 009-F sin inventar nada -- si Odoo lo rechaza,
 * queda documentado el error real, no una suposicion.
 *
 * Un solo registro, campos minimos, SOLO LECTURA. No crea, no modifica,
 * no cancela nada.
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

let config;
try {
  config = loadGuardedConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ overall: 'BLOCKED_CREDENTIALS', reason: error.message }, null, 2));
  process.exit(2);
}

const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
if (!uid) {
  console.log(JSON.stringify({ overall: 'LOGIN_FAILED' }, null, 2));
  process.exit(1);
}

const attempts = [];
for (const model of ['sale.order', 'x_hotel_unit', 'x_hotel_property']) {
  try {
    const rows = await transport.call('object', 'execute_kw', [
      config.database,
      uid,
      config.technicalSecret,
      model,
      'search_read',
      [[]],
      { fields: ['id'], limit: 1 },
    ]);
    attempts.push({ model, overall: 'ALLOWED', rows_returned: Array.isArray(rows) ? rows.length : null });
  } catch (error) {
    attempts.push({ model, overall: 'DENIED_OR_ERROR', error_message: error?.message ?? String(error) });
  }
}

console.log(JSON.stringify({ overall: 'DONE', technical_user_uid_present: Boolean(uid), attempts }, null, 2));
