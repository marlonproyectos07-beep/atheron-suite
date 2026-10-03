#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-012 V2 -- Control Center REAL, SOLO LECTURA contra Odoo
 * STAGING (atheron1-hotel-staging-20260923). Pensado para correr LOCAL
 * (PowerShell de Marlon) con las mismas variables ODOO_* ya usadas por
 * los demas scripts live; el guard rechaza cualquier otra base.
 *
 * Uso:
 *   REFERENCE_DATE=2026-10-03 HORIZON=7_DIAS node scripts/control-center-live.mjs
 *   ... PROPERTY="HOTEL ATHERON SUITE" CHANNEL=BOOKING STATUS=confirmed,hold
 *   ... HORIZON=RANGO RANGE_FROM=2026-10-01 RANGE_TO=2026-10-15
 *   ... HTML_OUT=control-center.html   (informe HTML local, no se publica)
 *
 * El JSON impreso trae telefono enmascarado y NO se debe pegar crudo en
 * un chat si contiene huespedes reales.
 */
import { writeFileSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { readControlCenterInputs } from '../src/control-center-reader.mjs';
import { buildControlCenter } from '../src/control-center-model.mjs';
import { renderControlCenterHtml } from '../src/control-center-render.mjs';

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
  console.error(JSON.stringify({ overall: 'LOGIN_FAILED' }, null, 2));
  process.exit(1);
}

const inputs = await readControlCenterInputs(transport, { database: config.database, uid, technicalSecret: config.technicalSecret });
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
const out = buildControlCenter({
  reservations: inputs.reservations,
  payments: inputs.payments,
  housekeepingTasks: inputs.housekeepingTasks,
  referenceDate: process.env.REFERENCE_DATE || new Date().toISOString().slice(0, 10),
  horizon: { preset: process.env.HORIZON || 'HOY', range: process.env.RANGE_FROM ? { from: process.env.RANGE_FROM, to: process.env.RANGE_TO } : null },
  filters: { property: process.env.PROPERTY || undefined, channel: process.env.CHANNEL || undefined, unit: process.env.UNIT || undefined, status: list(process.env.STATUS) },
  options: { truncated: inputs.truncated },
});
for (const g of inputs.gaps) out.data_gaps.push({ code: 'LECTURA_DEGRADADA', detail: g });

if (process.env.HTML_OUT) writeFileSync(process.env.HTML_OUT, renderControlCenterHtml(out));
console.log(JSON.stringify({ overall: out.validation.ok ? 'PASS' : 'VALIDATION_FAILED', ...out, kpi_definitions: undefined }, null, 2));
