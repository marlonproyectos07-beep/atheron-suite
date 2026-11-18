#!/usr/bin/env node
// ATH-HOTELS-SIRE-TRA-001: ejecuta el cliente REAL del conector (planSync/applyPlan + CopyWriteClient) contra la COPIA DE PRUEBAS
// con reservas SINTETICAS leidas de un archivo. No habla con Smoobu (la entrada sintetica hace de Smoobu) y no toca produccion.
//   Sin --apply : escritor RecordingWriter (misma lista blanca; no envia nada).
//   Con --apply : escritor CopyWriteClient (envia a la copia) y exige ATH_COPY_ARM = frase de armado de copia.
// Variables: ODOO_TEST_BASE_URL, ODOO_TEST_DATABASE, ODOO_TEST_API_KEY (credencial EXCLUSIVA de la copia; nunca la de produccion).
// Uso: node scripts/sync-copy.mjs <sinteticas.json> [--apply]
import { readFileSync } from 'node:fs';
import { assertTestTarget } from '../src/sire-tra/guard.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { CopyWriteClient, COPY_ARM_PHRASE } from '../src/sync-copy-client.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { applyPlan } from '../src/sync-apply.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';

const out = (o, code) => { console.log(JSON.stringify(o)); process.exit(code); };
const apply = process.argv.includes('--apply');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) out({ result: 'FALLO', code: 'SIN_ARCHIVO_SINTETICO' }, 2);

let target; let input;
try {
  target = assertTestTarget(process.env);
  input = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'CONFIG_ERROR', writes: 0 }, 2); }

// Solo datos sinteticos: id 1704xxxxx, nombre "... Sintetic... Ficticio/a", correo @example.invalid
const SYN = (r) => /^1704\d{5}$/.test(String(r.id)) && /sintetic/i.test(r.name) && /ficticio|ficticia/i.test(r.name) && /@example\.invalid$/.test(r.email);
if (!Array.isArray(input.reservations) || !input.reservations.length || !input.reservations.every(SYN)) out({ result: 'FALLO', code: 'ENTRADA_NO_SINTETICA', writes: 0 }, 2);
const apt = input.apartments || {};

const common = { baseUrl: target.baseUrl, database: target.database, apiKey: target.apiKey };
const reader = new OdooJson2Client(common);
let writer;
try { writer = apply ? new CopyWriteClient({ ...common, arm: process.env.ATH_COPY_ARM, productionApiKey: process.env.ODOO_API_KEY || null, maxWrites: 20 }) : new RecordingWriter({ maxWrites: 20 }); }
catch (e) { out({ result: 'FALLO', code: e.code ?? 'WRITER_ERROR', writes: 0 }, 2); }
if (apply && !writer.armed) out({ result: 'FALLO', code: 'COPY_WRITES_DISABLED', hint: 'ATH_COPY_ARM no coincide con la frase de armado de copia', writes: 0 }, 2);

const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const smoobu = { async getReservation(id) { const r = input.reservations.find((x) => x.id === id); if (!r) { const e = new Error('SMOOBU_NOT_FOUND'); e.code = 'SMOOBU_NOT_FOUND'; e.status = 404; throw e; } return { id: r.id, type: 'reservation', apartment: { id: apt[r.unit] }, arrival: r.arrival, departure: r.departure, price: r.price }; } };
const results = [];
try {
  for (const r of input.reservations) {
    const payload = buildCreatePayload({ smoobuId: r.id, unit: r.unit, arrival: r.arrival, departure: r.departure, source: 'direct', otaRef: null, price: r.price, guest: { name: r.name, email: r.email, phone: null } });
    const op = { smoobuId: r.id, unit: r.unit, arrival: r.arrival, departure: r.departure, op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [GUARDS.IMPUESTO_PENDIENTE], payload, changes: [], key: opKey(r.id, OPS.CREATE_ORDER, payload) };
    const res = await applyPlan({ plan: { ops: [op] }, reader, writer, smoobu, journal: new Journal(), lock: new MemoryLock(), today, maxOps: 5 });
    results.push({ smoobuId: r.id, unit: r.unit, result: res.results[0].result, code: res.results[0].code ?? null, steps: res.results[0].steps ?? [] });
  }
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, partial: results, writes: writer.writes }, 1); }
out({ result: apply ? 'EJECUCION_REAL_EN_COPIA' : 'SIMULACION_SIN_ENVIO', database: target.database, client: apply ? 'CopyWriteClient (real, HTTP a la copia)' : 'RecordingWriter (no envia)', writes: writer.writes, log: writer.log, results }, 0);
