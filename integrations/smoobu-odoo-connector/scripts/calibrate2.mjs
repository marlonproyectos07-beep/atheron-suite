#!/usr/bin/env node
// Segunda calibracion de SOLO LECTURA de Odoo. Salida saneada. Sin escrituras.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runCalibration2 } from '../src/calibrate2.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ overall: 'BLOCKED', code: e.code, missing: e.missing }, null, 2)); process.exit(2); }
const report = await runCalibration2({ odoo: new OdooJson2Client(cfg) });
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === 'OK' ? 0 : 1);
