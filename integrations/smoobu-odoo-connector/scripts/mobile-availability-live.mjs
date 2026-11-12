#!/usr/bin/env node
// Lee fecha de archivo versionado. Cero datos de huespedes a los logs publicos.
import { readFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runDaily } from '../src/daily-run.mjs';
import { summarizeMobileNight } from '../src/mobile-availability.mjs';
import { isIsoDate } from '../src/window.mjs';
const REQUEST = new URL('../../atheron-mobile-api/requests/consulta.json', import.meta.url);
const fail = (error) => {
  console.error(JSON.stringify({ result: 'FALLO_SEGURO', error, escrituras: 0 }));
  process.exit(1);
};
let date;
try {
  const request = JSON.parse(readFileSync(REQUEST, 'utf8'));
  if (request.operacion !== 'CONSULTAR_OCUPACION' || !isIsoDate(request.fecha) || !/^[a-zA-Z0-9-]{3,64}$/.test(request.idSolicitud ?? '')) throw Error('INVALID_REQUEST');
  date = request.fecha;
} catch { fail('SOLICITUD_INVALIDA'); }
try {
  const sc = loadSmoobuConfig(process.env);
  const oc = loadOdooConfig(process.env);
  const out = await runDaily({
    smoobu: new SmoobuClient({ ...sc, pathPrefix: '/api' }),
    odoo: new OdooJson2Client(oc),
    env: { RECONCILE_FROM: date, RECONCILE_TO: date },
    watchIds: [], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey],
  });
  if (out.exitCode !== 0 || !out.report) fail(out.stdout?.failure?.code ?? 'FUENTE_NO_VERIFICABLE');
  const result = summarizeMobileNight(out.report, date, out.stdout.at);
  if (!result) fail('DATOS_INCOMPLETOS');
  console.log('ATHERON_MOBILE_READONLY_RESULT=' + JSON.stringify(result));
} catch (e) { fail(e?.code ?? 'API_NO_DISPONIBLE'); }
