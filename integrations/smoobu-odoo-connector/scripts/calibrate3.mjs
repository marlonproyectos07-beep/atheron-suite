#!/usr/bin/env node
// Tercera lectura de SOLO LECTURA (campos de bloqueo y accion 1914) + sondeo sin credenciales de la base de staging.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runCalibration3 } from '../src/calibrate3.mjs';
import { probeDatabase, probeHost } from '../src/staging-probe.mjs';
import { STAGING_DATABASE } from '../src/staging-guard.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ overall: 'BLOCKED', code: e.code, missing: e.missing }, null, 2)); process.exit(2); }
const report = await runCalibration3({ odoo: new OdooJson2Client(cfg) });
report.stagingProbe = {
  note: 'sondeo sin credenciales; no prueba aislamiento',
  productionControl: await probeDatabase({ baseUrl: cfg.baseUrl, database: cfg.database }),
  staging: await probeDatabase({ baseUrl: cfg.baseUrl, database: STAGING_DATABASE }),
  stagingHosts: [await probeHost({ origin: `https://${STAGING_DATABASE}.odoo.com` }), await probeHost({ origin: 'https://atheron1-hotel-staging-20261009.odoo.com' })],
  configuredDatabaseIsStaging: cfg.database === STAGING_DATABASE,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === 'OK' ? 0 : 1);
