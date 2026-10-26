#!/usr/bin/env node
// Piloto P0 (ATH-DEV-018). Modo por defecto: PRECHECK de solo lectura. La escritura exige modo "execute" Y la frase de autorizacion.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { P0WriteClient } from '../src/odoo-json2-p0-client.mjs';
import { P0_AUTH_PHRASE } from '../src/p0-spec.mjs';
import { runP0 } from '../src/p0-run.mjs';

const mode = process.env.P0_MODE === 'execute' ? 'execute' : 'precheck';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ result: 'DETENIDO', note: 'faltan variables', code: e.code, missing: e.missing })); process.exit(2); }
const reader = new OdooJson2Client(cfg);
let writer = null;
if (mode === 'execute') {
  if (process.env.P0_AUTHORIZATION !== P0_AUTH_PHRASE) { console.log(JSON.stringify({ result: 'DETENIDO', note: 'autorizacion ausente o incorrecta: sin escrituras' })); process.exit(3); }
  writer = new P0WriteClient({ ...cfg, authorization: process.env.P0_AUTHORIZATION });
}
const report = await runP0({ reader, writer, cfg, mode });
console.log(JSON.stringify(report));
process.exit(report.result === 'PASO' || report.result === 'PRECHECK_OK_SIN_ESCRITURAS' ? 0 : report.result === 'DETENIDO' ? 3 : 4);
