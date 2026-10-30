#!/usr/bin/env node
// Auditoria de SOLO LECTURA de automatizaciones sobre planning.slot. Sin escrituras, sin ejecutar acciones, sin Smoobu.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runAudit } from '../src/audit.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ overall: 'BLOCKED', code: e.code, missing: e.missing }, null, 2)); process.exit(2); }
const report = await runAudit({ odoo: new OdooJson2Client(cfg) });
console.log(JSON.stringify(report));
process.exit(report.overall === 'OK' ? 0 : 1);
