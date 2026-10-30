#!/usr/bin/env node
// ATH-DEV-020 fase 3. Sin la frase exacta NO hay cliente de escritura: solo se reevaluan las puertas (lectura).
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { RecomputeWriteClient, RECOMPUTE_PHRASE } from '../src/odoo-json2-recompute-client.mjs';
import { runRecomputeExecute } from '../src/recompute-run.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ result: 'DETENIDO', code: e.code, missing: e.missing })); process.exit(2); }
const reader = new OdooJson2Client(cfg);
const writer = process.env.RECOMPUTE_AUTHORIZATION === RECOMPUTE_PHRASE ? new RecomputeWriteClient({ ...cfg, authorization: RECOMPUTE_PHRASE }) : null;
const rep = await runRecomputeExecute({ reader, writer });
console.log(JSON.stringify({ at: new Date().toISOString(), authorizationPresent: Boolean(writer), ...rep }));
process.exit(rep.result === 'RECUPERACION_COMPLETA' ? 0 : rep.result === 'DETENIDO' ? 3 : 4);
