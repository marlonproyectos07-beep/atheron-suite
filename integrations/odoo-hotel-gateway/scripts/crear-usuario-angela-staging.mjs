#!/usr/bin/env node
/**
 * PRIORIDAD CEO, Track 3 -- crea el usuario operacional de Angela SOLO en
 * Odoo STAGING, minimo privilegio. NO SE HA EJECUTADO TODAVIA: requiere
 * el correo real de Angela (no inventado, no generado) como argumento.
 *
 * Grupos otorgados (verificados reales en esta base, ver
 * investigar-grupos-permisos.mjs):
 *   - base.group_user (id 1) "Internal User" -- login interno basico.
 *   - sales_team.group_sale_salesman_all_leads (id 16) "User: All
 *     Documents" -- ve TODAS las reservas (no solo las "propias"; Angela
 *     es la unica recepcionista, necesita ver todo el Kanban), crea/edita
 *     cotizaciones y ordenes de venta (incluye Hotel v1, que vive sobre
 *     sale.order), SIN acceso a Studio ni Ajustes.
 *
 * Grupos EXPLICITAMENTE NO otorgados:
 *   - base.group_system (id 4) "Role / Administrator" -- Ajustes,
 *     gestion de usuarios, configuracion administrativa.
 *   - base.group_no_one (id 7) "Technical Features" -- menus tecnicos,
 *     modo desarrollador, y es el mismo grupo que habilita el boton
 *     "Activar Studio".
 *
 * Uso: node crear-usuario-angela-staging.mjs "<correo-real-de-angela>" "<Nombre completo>"
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const EMAIL = process.argv[2];
const NAME = process.argv[3] ?? 'Ángela';

if (!EMAIL) {
  console.error(JSON.stringify({ status: 'BLOCKED_MISSING_EMAIL', reason: 'Falta el correo real de Angela. No se inventa. Uso: node crear-usuario-angela-staging.mjs "<correo>" "<nombre>"' }, null, 2));
  process.exit(2);
}

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
async function execute(model, method, args, kwargs = {}) {
  return transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, model, method, args, kwargs]);
}

const GROUP_INTERNAL_USER = 1; // base.group_user
const GROUP_SALES_ALL_DOCS = 16; // sales_team.group_sale_salesman_all_leads

const existing = await execute('res.users', 'search_read', [[['login', '=', EMAIL]]], { fields: ['id', 'name', 'login'] });
if (existing.length > 0) {
  console.log(JSON.stringify({ status: 'YA_EXISTE', user: existing[0] }, null, 2));
  process.exit(0);
}

const userId = await execute('res.users', 'create', [{
  name: NAME,
  login: EMAIL,
  email: EMAIL,
  groups_id: [[6, 0, [GROUP_INTERNAL_USER, GROUP_SALES_ALL_DOCS]]],
  // Sin password aqui -- Odoo envia invitacion de acceso al correo, o se
  // define manualmente desde el panel de usuarios (no se imprime nunca).
}]);

const created = await execute('res.users', 'read', [[userId]], { fields: ['id', 'name', 'login', 'active'] });
console.log(JSON.stringify({ status: 'CREADO', user: created[0], groups_granted: ['base.group_user', 'sales_team.group_sale_salesman_all_leads'], groups_denied: ['base.group_system (Settings/Admin)', 'base.group_no_one (Technical Features / Studio)'] }, null, 2));
