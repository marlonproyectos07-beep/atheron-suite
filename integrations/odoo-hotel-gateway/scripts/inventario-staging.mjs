#!/usr/bin/env node
/** SOLO LECTURA: inventario de personalizaciones que existen UNICAMENTE en STAGING (riesgo real: expira en 7 dias). */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const out = {};

// Campos custom (x_) en sale.order -- la base del modelo de datos de hoteleria.
const customFields = await execute('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', 'like', 'x_%']]], { fields: ['name', 'field_description', 'ttype'] });
out.MASTER_DATA_campos_custom_sale_order = customFields.length;
out.MASTER_DATA_campos_custom_detalle = customFields.map((f) => `${f.name} (${f.ttype}): ${f.field_description}`);

// Vistas Studio (ir.ui.view con create_uid distinto de Odoo base -- heuristica: model sale.order + inherit).
const studioViews = await execute('ir.ui.view', 'search_read', [[['model', '=', 'sale.order'], ['inherit_id', '!=', false]]], { fields: ['name', 'inherit_id', 'priority'] });
out.ODOO_STUDIO_vistas_heredadas_sale_order = studioViews.length;
out.ODOO_STUDIO_detalle = studioViews.map((v) => v.name);

// Automatizaciones (base.automation) + acciones de servidor (ir.actions.server).
const automations = await execute('base.automation', 'search_read', [[]], { fields: ['name', 'trigger', 'model_id'] });
out.AUTOMATIZACIONES_total = automations.length;
out.AUTOMATIZACIONES_detalle = automations.map((a) => `${a.name} (${a.trigger})`);

const serverActions = await execute('ir.actions.server', 'search_read', [[['model_id.model', '=', 'sale.order']]], { fields: ['name', 'state'] });
out.ACCIONES_servidor_sale_order = serverActions.length;
out.ACCIONES_detalle = serverActions.map((a) => `${a.name} (${a.state})`);

// Cron jobs.
const crons = await execute('ir.cron', 'search_read', [[['active', '=', true]]], { fields: ['name', 'interval_number', 'interval_type'] });
out.CRON_activos = crons.length;
out.CRON_detalle = crons.map((c) => `${c.name} (cada ${c.interval_number} ${c.interval_type})`);

// Grupos de seguridad custom (heuristica: nombre no estandar de Odoo).
const groups = await execute('res.groups', 'search_read', [[['name', 'like', '%hotel%']]], { fields: ['name'] });
out.GRUPOS_PERMISOS_relacionados_hotel = groups.length;
out.GRUPOS_detalle = groups.map((g) => g.name);

// Filtros guardados (incluye el que acabamos de crear).
const filters = await execute('ir.filters', 'search_read', [[['model_id', '=', 'sale.order']]], { fields: ['name', 'is_default'] });
out.VISTAS_filtros_guardados_sale_order = filters.length;
out.VISTAS_detalle = filters.map((f) => `${f.name}${f.is_default ? ' (default)' : ''}`);

// Menus/acciones del modulo Hotel v1.
const actions = await execute('ir.actions.act_window', 'search_read', [[['res_model', 'in', ['sale.order', 'hotel.unit', 'hotel.property']]]], { fields: ['name', 'res_model'] }).catch(() => []);
out.ACCIONES_ventana_hotel = actions.length;

console.log(JSON.stringify(out, null, 2));
