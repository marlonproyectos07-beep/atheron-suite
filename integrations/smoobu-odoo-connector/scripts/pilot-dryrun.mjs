#!/usr/bin/env node
// Ensayo SIN ESCRITURAS del piloto: lee estado real (search_read/fields_get), predice efectos de un turno ficticio de 301.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { readPilotState, selectCandidates, predictCreate } from '../src/pilot-dryrun.mjs';
import { evaluateAll } from '../src/authorization-matrix.mjs';
let cfg;
try { cfg = loadOdooConfig(); } catch (e) { console.log(JSON.stringify({ overall: 'BLOCKED', code: e.code, missing: e.missing }, null, 2)); process.exit(2); }
const today = new Date().toISOString().slice(0, 10);
const { steps, state } = await readPilotState({ odoo: new OdooJson2Client(cfg), today });
const report = { overall: steps.every((s) => s.status === 'OK') ? 'OK' : 'PARTIAL', today, steps };
if (state.slots && state.roles) {
  const cands = selectCandidates({ state, today });
  report.candidates = cands;
  const pastNight = cands.past[0]?.night; const futureNight = cands.future[0]?.night;
  report.prediction = {};
  if (pastNight) { report.prediction.p0DraftPast = predictCreate({ state, night: pastNight, variant: 'draft' }); report.prediction.p1PublishedPast = predictCreate({ state, night: pastNight, variant: 'published' }); }
  if (futureNight) report.prediction.p1PublishedFuture = predictCreate({ state, night: futureNight, variant: 'published' });
}
report.authorization = evaluateAll().map((o) => ({ id: o.id, op: o.op, verdict: o.verdict }));
console.log(JSON.stringify(report));
process.exit(report.overall === 'OK' ? 0 : 1);
