#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, diagnostico SOLO LECTURA -- Odoo reporto
 * "localizadores invalidos" al guardar la extension de Studio sobre la
 * vista Kanban de sale.order. Esto obtiene el arch REALMENTE COMBINADO
 * (el que Odoo arma sumando todas las vistas de menor prioridad antes
 * de aplicar la nuestra) via el metodo ORM estandar `get_views`/
 * `fields_view_get`, en vez de adivinar contra la vista base sola.
 * No escribe nada.
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

// 1) Datos crudos del registro 6833 (nuestra extension de Studio): inherit_id real.
const [studioView] = await transport.call('object', 'execute_kw', [
  config.database, uid, config.technicalSecret,
  'ir.ui.view', 'read', [[6833]], { fields: ['name', 'inherit_id', 'arch', 'priority', 'mode', 'model'] },
]);

// 2) El arch combinado real que Odoo usa para renderizar el kanban de
//    sale.order en la accion 1909 (la misma accion que ya vimos en
//    Reservas hotel), ANTES/CON nuestra extension aplicada -- para ver
//    exactamente que fallo.
let combined = null;
let combinedError = null;
try {
  combined = await transport.call('object', 'execute_kw', [
    config.database, uid, config.technicalSecret,
    'sale.order', 'get_views', [[[false, 'kanban']]], { context: {} },
  ]);
} catch (error) {
  combinedError = error?.message ?? String(error);
}

console.log(JSON.stringify({
  overall: 'DONE',
  studio_view: studioView,
  combined_get_views: combined,
  combined_error: combinedError,
}, null, 2));
