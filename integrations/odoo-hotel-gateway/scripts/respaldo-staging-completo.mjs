#!/usr/bin/env node
/**
 * PRIORIDAD CEO -- respaldo real (solo lectura) de todo lo que el export
 * nativo de Studio NO captura: automatizaciones (base.automation), las
 * acciones de servidor (ir.actions.server, incluye el CODIGO PYTHON real
 * de cada boton Hotel v1), cron activos, filtros guardados, y la master
 * data de hoteleria (propiedades/unidades/tarifas/politicas de anticipo).
 * Escribe JSON legible en AI/staging-backup/<archivo>.json -- nunca
 * modifica nada en Odoo. Cada paso es independiente: si uno falla
 * (p.ej. un nombre de campo real distinto al esperado), los demas
 * igual se escriben, y el fallo queda reportado al final, no oculto.
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const OUT_DIR = resolve(process.cwd(), '..', '..', 'AI', 'staging-backup');
mkdirSync(OUT_DIR, { recursive: true });

const failures = [];

async function step(name, fn) {
  try {
    const data = await fn();
    writeFileSync(resolve(OUT_DIR, name), JSON.stringify(data, null, 2), 'utf8');
    console.log(`OK ${name}: ${Array.isArray(data) ? data.length : 1} registro(s)`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FALLO ${name}: ${error.message}`);
  }
}

await step('base-automation.json', () => execute('base.automation', 'search_read', [[]], {
  fields: ['name', 'model_id', 'trigger', 'active'],
}));

await step('ir-actions-server-hotel.json', () => execute('ir.actions.server', 'search_read', [[['model_id.model', 'in', ['sale.order', 'x_hotel_unit', 'x_hotel_property', 'x_hotel_rate', 'x_hotel_quote']]]], {
  fields: ['name', 'model_id', 'state', 'code', 'binding_model_id', 'binding_type'],
}));

await step('ir-cron.json', () => execute('ir.cron', 'search_read', [[]], {
  fields: ['name', 'model_id', 'state', 'interval_number', 'interval_type', 'active', 'ir_actions_server_id'],
}));

await step('ir-filters-sale-order.json', () => execute('ir.filters', 'search_read', [[['model_id', '=', 'sale.order']]], {
  fields: ['name', 'domain', 'context', 'is_default', 'user_ids', 'action_id'],
}));

await step('master-data-x_hotel_property.json', () => execute('x_hotel_property', 'search_read', [[]], {}));
await step('master-data-x_hotel_unit.json', () => execute('x_hotel_unit', 'search_read', [[]], {}));
await step('master-data-x_hotel_rate.json', () => execute('x_hotel_rate', 'search_read', [[]], {}));
await step('master-data-x_hotel_rate_line.json', () => execute('x_hotel_rate_line', 'search_read', [[]], {}));
await step('master-data-x_hotel_deposit_policy.json', () => execute('x_hotel_deposit_policy', 'search_read', [[]], {}));

await step('ir-model-fields-sale-order-custom.json', () => execute('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', 'like', 'x_%']]], {
  fields: ['name', 'field_description', 'ttype', 'relation', 'selection', 'required', 'help'],
}));

await step('ir-ui-view-sale-order-inherited.json', () => execute('ir.ui.view', 'search_read', [[['model', '=', 'sale.order'], ['inherit_id', '!=', false]]], {
  fields: ['name', 'inherit_id', 'priority', 'arch', 'active'],
}));

await step('ir-actions-act-window-hotel.json', () => execute('ir.actions.act_window', 'search_read', [[['res_model', 'in', ['sale.order', 'x_hotel_unit', 'x_hotel_property', 'x_hotel_rate', 'x_hotel_deposit_policy']]]], {
  fields: ['name', 'res_model', 'domain', 'context', 'view_mode'],
}));

await step('ir-ui-menu-hotel.json', () => execute('ir.ui.menu', 'search_read', [[['name', 'ilike', 'hotel']]], {
  fields: ['name', 'parent_id', 'action', 'sequence'],
}));

console.log('\nRESUMEN: respaldo escrito en', OUT_DIR);
if (failures.length) {
  console.log('PASOS FALLIDOS:', JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
