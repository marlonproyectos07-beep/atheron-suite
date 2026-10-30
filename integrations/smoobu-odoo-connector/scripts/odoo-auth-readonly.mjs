#!/usr/bin/env node
// ATH-DEV-030: UNA llamada de lectura a Odoo (res.users/context_get). Sin reintentos, sin escrituras, sin datos de negocio.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runOdooAuthDiagnosis } from '../src/odoo-auth-diagnosis.mjs';
let cfg;
try { cfg = loadOdooConfig(process.env); } catch (e) { console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, requests: 0 })); process.exit(2); }
const report = await runOdooAuthDiagnosis({ client: new OdooJson2Client(cfg), cfg });
console.log(JSON.stringify({ at: new Date().toISOString(), ...report }));
process.exit(report.httpStatus === 200 ? 0 : 1);
