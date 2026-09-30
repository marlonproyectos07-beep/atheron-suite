#!/usr/bin/env node
/** Libera un HOLD de prueba real (ejecuta el boton "HOTEL v1 -- CANCELAR" real) para no dejar residuos. */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const HOLD_ID = Number(process.argv[2]);
if (!HOLD_ID) { console.error('Uso: node liberar-hold-test.mjs <hold_id>'); process.exit(1); }

// El "hold_id" real del Gateway es el ID del sale.order (confirmado en HOTEL-009/011).
const before = await execute('sale.order', 'read', [[HOLD_ID]], { fields: ['name', 'x_reservation_status'] });
console.log('ANTES:', JSON.stringify(before[0]));

const cancelAction = await execute('ir.actions.server', 'search', [[['name', '=', 'HOTEL v1 — CANCELAR']]]);
if (cancelAction.length === 0) { console.error('No se encontro la accion HOTEL v1 -- CANCELAR'); process.exit(1); }

await execute('ir.actions.server', 'run', [cancelAction], { context: { active_model: 'sale.order', active_id: HOLD_ID, active_ids: [HOLD_ID] } });

const after = await execute('sale.order', 'read', [[HOLD_ID]], { fields: ['name', 'x_reservation_status'] });
console.log('DESPUES:', JSON.stringify(after[0]));
