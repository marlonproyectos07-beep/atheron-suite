#!/usr/bin/env node
// ATH-DEV-019: cierre de la recuperacion de P0 + permisos del usuario del conector + atribucion de registros nuevos. SOLO LECTURA.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runRecoveryCheck } from '../src/recovery-check.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ overall: 'BLOCKED', code: e.code, missing: e.missing })); process.exit(2); }
const odoo = new OdooJson2Client(cfg);
const ctx = await odoo.call('res.users', 'context_get', {});
const report = await runRecoveryCheck({ odoo, uid: Number.isInteger(ctx?.uid) ? ctx.uid : 2 });
console.log(JSON.stringify({ at: new Date().toISOString(), ...report }));
process.exit(report.overall === 'OK' ? 0 : 1);
