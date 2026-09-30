#!/usr/bin/env node
/**
 * ATH-ODOO PRIORIDAD CEO -- crea (o reutiliza si ya existe) un ir.filters
 * COMPARTIDO y DEFAULT sobre la accion 1909 (Hotel v1 - Reservas hotel)
 * que oculta el ruido QA/test por defecto, sin borrar ni un solo
 * registro (ver AI/ una vez documentado). Reversible: cualquiera puede
 * quitar el filtro desde el buscador y ver todo de nuevo.
 *
 * Regla del dominio (no inventada -- confirmada via diagnostico-conteo-etapas.mjs):
 * excluye clientes cuyo nombre sea el patron real de datos de prueba ya
 * usado en este proyecto (QA-, FICTICIO, TEST, o el contacto generico
 * "Cliente WhatsApp" que usa el simulador, nunca un cliente real hasta
 * que el piloto real de WhatsApp este autorizado).
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const FILTER_NAME = 'Operación real (oculta QA)';
const DOMAIN = "['&', ('x_hotel_unit_id', '!=', False), '!', '|', '|', '|', ('partner_id.name', 'ilike', 'QA-'), ('partner_id.name', 'ilike', 'FICTICIO'), ('partner_id.name', 'ilike', 'TEST'), ('partner_id.name', '=', 'Cliente WhatsApp')]";

const existing = await execute('ir.filters', 'search_read', [[['name', '=', FILTER_NAME], ['model_id', '=', 'sale.order']]], { fields: ['id', 'name', 'domain', 'is_default', 'user_ids'] });

if (existing.length > 0) {
  console.log(JSON.stringify({ status: 'YA_EXISTE', filter: existing[0] }, null, 2));
  process.exit(0);
}

const filterId = await execute('ir.filters', 'create', [{
  name: FILTER_NAME,
  model_id: 'sale.order',
  domain: DOMAIN,
  is_default: true,
  user_ids: [[6, 0, []]], // vacio = compartido/default para TODOS los usuarios de esta vista (Odoo 19: ir.filters.user_ids, no user_id)
  action_id: 1909,
}]);

const created = await execute('ir.filters', 'read', [[filterId]], { fields: ['id', 'name', 'domain', 'is_default', 'user_ids', 'action_id'] });
console.log(JSON.stringify({ status: 'CREADO', filter: created[0] }, null, 2));
