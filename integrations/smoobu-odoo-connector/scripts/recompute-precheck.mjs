#!/usr/bin/env node
// ATH-DEV-020: precheck de recalculo de disponibilidad. SOLO LECTURA.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runRecomputePrecheck, evaluateGates } from '../src/recompute-precheck.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ overall: 'BLOCKED', code: e.code, missing: e.missing })); process.exit(2); }
const odoo = new OdooJson2Client(cfg);
const r = await runRecomputePrecheck({ odoo });
console.log(JSON.stringify({ at: new Date().toISOString(), database: cfg.database ?? null, ...evaluateGates(r), steps: r.steps }));
process.exit(r.steps.every((s) => s.status === 'OK') ? 0 : 1);
