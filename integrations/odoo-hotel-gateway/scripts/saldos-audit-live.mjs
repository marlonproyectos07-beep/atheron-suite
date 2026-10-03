#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-012 V2 -- auditoria de "Saldos pendientes" (SOLO LECTURA).
 * Lee sale.order con campos de AGREGACION unicamente (sin nombre, telefono
 * ni partner) y dice que definicion reproduce el numero del tablero.
 *
 * Uso:
 *   TARGET_COUNT=357 TARGET_AMOUNT=37202549 node scripts/saldos-audit-live.mjs
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { auditSaldos, SALDOS_AUDIT_FIELDS } from '../src/saldos-audit.mjs';

let config;
try {
  config = loadGuardedConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ overall: 'BLOCKED_CREDENTIALS', reason: error.message }, null, 2));
  process.exit(2);
}
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

const rows = [];
for (let offset = 0; offset < 20000; offset += 500) {
  const page = await transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret, 'sale.order', 'search_read', [[]], { fields: SALDOS_AUDIT_FIELDS, limit: 500, offset, order: 'id asc' }]);
  rows.push(...page);
  if (page.length < 500) break;
}
const target = {
  count: process.env.TARGET_COUNT ? Number(process.env.TARGET_COUNT) : undefined,
  amount: process.env.TARGET_AMOUNT ? Number(process.env.TARGET_AMOUNT) : undefined,
};
console.log(JSON.stringify({ overall: 'PASS', ...auditSaldos(rows, target) }, null, 2));
