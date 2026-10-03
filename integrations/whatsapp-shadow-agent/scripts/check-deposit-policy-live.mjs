#!/usr/bin/env node
/**
 * SOLO LECTURA contra Odoo STAGING (atheron1-hotel-staging-20260923):
 * descubre con fields_get los campos de x_hotel_property / x_hotel_deposit_policy
 * cuyo titulo habla de "anticipo" y lista su valor por propiedad, para ver
 * si STAGING aun tiene 30 % (configuracion anterior) y no el 50 % oficial.
 * NO escribe nada. Para corregir, ver AI/whatsapp/ODOO_DEPOSIT_50_RUNBOOK.md
 *
 *   node scripts/check-deposit-policy-live.mjs
 */
import { loadGuardedConfig } from '../../odoo-hotel-gateway/scripts/live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../../odoo-hotel-gateway/src/odoo-transport.mjs';

let cfg;
try {
  cfg = loadGuardedConfig(process.env);
} catch (e) {
  console.error(JSON.stringify({ overall: 'BLOCKED_CREDENTIALS', reason: e.message }, null, 2));
  process.exit(2);
}
const t = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await t.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const kw = (model, method, args, opts = {}) => t.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, opts]);

const report = [];
for (const model of ['x_hotel_property', 'x_hotel_deposit_policy']) {
  let fields;
  try {
    fields = await kw(model, 'fields_get', [], { attributes: ['string', 'type'] });
  } catch {
    report.push({ model, status: 'MODEL_NOT_READABLE' });
    continue;
  }
  const names = Object.entries(fields).filter(([, f]) => /anticipo|deposit/i.test(f.string ?? '')).map(([k]) => k);
  const rows = names.length ? await kw(model, 'search_read', [[]], { fields: ['id', 'display_name', ...names], limit: 50 }) : [];
  report.push({ model, deposit_fields: names.map((k) => ({ field: k, label: fields[k].string })), rows });
}
const flat = JSON.stringify(report);
console.log(JSON.stringify({ overall: 'PASS', official_percent: 50, still_30_percent: /\b30(\.0+)?\b/.test(flat), report }, null, 2));
