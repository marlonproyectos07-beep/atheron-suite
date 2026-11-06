#!/usr/bin/env node
// ATH-DEV-140: PILOTO AISLADO de contacto asistido por WhatsApp. UNA reserva de Smoobu elegida por ID (PILOT_WA_ID).
// Por defecto es SIMULACION (PILOT_WA_DRY distinto de '0'): lecturas reales, escritor de simulacion, 0 escrituras. Publica la lista
//   de verificacion previa, los dos tokens que gerencia debe dar y comprueba (en memoria) que la nota HTML con la ancla wa.me
//   quedaria bien formada. No imprime telefono, correo, nombre, enlaces ni el ID completo.
// Los «tokens» que publica la simulacion son DESAFIOS PUBLICOS (NO secretos, no autorizan nada por si solos).
// Modo real (PILOT_WA_DRY=0): exige ademas la AUTORIZACION PRIVADA: PILOT_WA_AUTH_KEY (secreto de gerencia) y los codigos HMAC
//   PILOT_WA_AUTH_CODE (y PILOT_WA_ADMIN_AUTH_CODE si la clave es de administrador), ligados a ID/operacion/huella y con caducidad
//   <= 60 min. El margen de 7 dias es fijo; solo baja con PILOT_WA_LEAD_EXCEPTION (codigo firmado). Usa PilotWaWriteClient, que con
//   PILOT_WA_ARMED=false NO PUEDE escribir. No toca SYNC_ARM, SYNC_DESBLOQUEO ni el bloqueo #101.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow, addDays } from '../src/window.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { Journal, MemoryLock, FileLock } from '../src/sync-journal.mjs';
import { isAdminKey, stateFingerprint } from '../src/sync-pilot.mjs';
import { parsePilotSelection, pilotWaPreflight, pilotWaApprovalToken, pilotWaAdminToken, runPilotWa, ShadowWaWriter, daysUntil, PILOT_WA_MIN_LEAD_DAYS } from '../src/sync-pilot-wa.mjs';
import { verifyPilotWaAuth } from '../src/sync-pilot-wa-auth.mjs';
import { PilotWaWriteClient } from '../src/sync-pilot-wa-client.mjs';
import { normalizePhoneE164 } from '../src/guest-contact.mjs';
import { maskSmoobu, sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';

const out = (o, code) => { console.log(JSON.stringify(o)); process.exit(code); };
const now = new Date();
const dry = process.env.PILOT_WA_DRY !== '0';
let id; let sc; let oc; let watchIds;
try { id = parsePilotSelection(process.env.PILOT_WA_ID); sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env); watchIds = resolveWatchIds(process.env); } catch (e) { out({ result: 'FALLO', category: 'CONFIGURACION', code: e.code ?? 'CONFIG_ERROR', writes: 0 }, 2); }
const authCfg = { key: process.env.PILOT_WA_AUTH_KEY ?? null, code: process.env.PILOT_WA_AUTH_CODE ?? null, adminCode: process.env.PILOT_WA_ADMIN_AUTH_CODE ?? null, leadException: process.env.PILOT_WA_LEAD_EXCEPTION ?? null };
const today = new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
try {
  const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
  const reader = new OdooJson2Client(oc);
  const fresh0 = await smoobu.getReservation(id);
  const arrival = String(fresh0?.arrival ?? '').slice(0, 10); const departure = String(fresh0?.departure ?? '').slice(0, 10);
  const early = daysUntil(today, arrival);
  if (!(early >= 1)) out({ at: now.toISOString(), result: 'PILOTO_NO_APTO', target: { ref: maskSmoobu(id) }, preflight: ['LLEGADA_FUTURA_CON_MARGEN:LLEGADA_NO_FUTURA'], writesSentToOdoo: 0 }, 0);
  // ventana = solo las noches de la estancia elegida: alli estan todos los posibles conflictos
  const window = resolveWindow({ RECONCILE_FROM: arrival, RECONCILE_TO: addDays(departure, -1) });
  const { plan, report } = await runSyncDryRun({ smoobu, odoo: reader, window, today, watchIds });
  const matches = plan.ops.filter((o) => o.smoobuId === id);
  if (matches.length !== 1) out({ at: now.toISOString(), result: 'PILOTO_NO_APTO', target: { ref: maskSmoobu(id) }, preflight: [`SELECCION_UNICA:${matches.length === 0 ? 'RESERVA_NO_ESTA_EN_EL_PLAN' : 'SELECCION_NO_UNICA'}`], writesSentToOdoo: 0 }, 0);
  const op = matches[0];
  const who = await isAdminKey(reader); const admin = who === true || who.admin;
  const fresh = await smoobu.getReservation(id);
  const fp = stateFingerprint(fresh);
  const tokens = { approval: pilotWaApprovalToken(op, fp), admin: admin ? pilotWaAdminToken(op, fp) : null }; // desafios PUBLICOS, no secretos
  const exc = authCfg.leadException ? verifyPilotWaAuth({ key: authCfg.key, kind: 'EXC', code: authCfg.leadException, smoobuId: id, opKey: op.key, fp, now }) : null;
  const approval = dry ? tokens.approval : (process.env.PILOT_WA_APPROVAL ?? null);
  const adminApproval = dry ? tokens.admin : (process.env.PILOT_WA_ADMIN_APPROVAL ?? null);
  const preflight = await pilotWaPreflight({ plan, op, fresh, fp, approval, adminApproval, admin, reader, smoobu, selectedId: id, today, leadExceptionDays: exc?.ok ? exc.days : null, writer: { maxWrites: 3, writes: 0 } });
  let res; let note = null;
  if (dry) {
    const writer = new ShadowWaWriter({ maxWrites: 3 });
    res = await runPilotWa({ plan, smoobuId: id, approval, adminApproval, reader, writer, smoobu, journal: new Journal(), lock: new MemoryLock(), today, auth: authCfg, now });
    note = writer.noteFacts(fresh?.phone);
  } else {
    res = await runPilotWa({ plan, smoobuId: id, approval, adminApproval, reader, writer: new PilotWaWriteClient({ ...oc, op, selectedId: id, arm: process.env.PILOT_WA_ARM ?? null }), smoobu,
      journal: Journal.fromFile(process.env.SYNC_JOURNAL_PATH ?? 'sync-journal.jsonl'), lock: new FileLock(process.env.SYNC_LOCK_PATH ?? 'sync.lock'), today, auth: authCfg, now });
  }
  const phone = normalizePhoneE164(fresh?.phone);
  const pub = { at: now.toISOString(), result: dry ? 'PILOTO_WA_SIMULADO' : 'PILOTO_WA_REAL', target: { ref: maskSmoobu(op.smoobuId), unit: op.unit, arrival: op.arrival, departure: op.departure, op: op.op, status: op.status, guards: op.guards, leadDays: daysUntil(today, op.arrival) },
    phone: { valid: phone.ok, reason: phone.ok ? null : phone.reason }, keyIsAdmin: admin, ...(dry ? { desafio: { ...tokens, clave: op.key, huella: fp, nota: 'IDENTIFICADORES_PUBLICOS_NO_SECRETOS_NO_AUTORIZAN_POR_SI_SOLOS' } } : {}), minLeadDays: exc?.ok ? exc.days : PILOT_WA_MIN_LEAD_DAYS, authorizationFailure: res.authCode ?? null,
    preflight: preflight.checks.map((c) => `${c.name}:${c.ok ? 'OK' : c.code}`), ...(note ? { noteHtml: note } : {}), halted: res.halted ?? null,
    results: (res.results ?? []).map((r) => ({ result: r.result, code: r.code ?? null, steps: r.steps ?? [] })), writesSentToOdoo: dry ? 0 : (res.writes ?? 0) };
  const text = JSON.stringify(pub);
  const g = op.payload?.partner?.guest ?? {};
  const pii = [g.name, g.email, g.phone, phone.ok ? phone.digits : null].filter((v) => typeof v === 'string' && v.length > 3);
  const tokenValues = [process.env.PILOT_WA_APPROVAL, process.env.PILOT_WA_ADMIN_APPROVAL, process.env.PILOT_WA_ARM, authCfg.key, authCfg.code, authCfg.adminCode, authCfg.leadException].filter((v) => typeof v === 'string' && v.length > 3);
  const guard = assertPublicSafe(text, { identifiers: [...sensitiveValues(report), ...pii], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey, ...tokenValues] });
  if (!guard.safe) out({ result: 'DETALLE_RETENIDO', category: 'PRIVACIDAD', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, halted: pub.halted, writesSentToOdoo: pub.writesSentToOdoo }, 3);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Piloto aislado WhatsApp (${dry ? 'SIMULADO, sin escrituras' : 'REAL'})`, '',
    `Reserva: ${pub.target.ref} | ${op.unit} | ${op.arrival} -> ${op.departure} (en ${pub.target.leadDays} dias) | ${op.op} ${op.status}`,
    `Telefono valido: ${phone.ok ? 'si' : `NO (${phone.reason})`} | Clave de administrador: ${admin ? 'SI (exige doble aprobacion)' : 'no'}`,
    `Verificacion previa: ${pub.preflight.join(' | ')}`,
    ...(note ? [`Nota HTML (solo hechos): ${JSON.stringify(note)}`] : []),
    ...(dry ? ['Desafio (IDENTIFICADORES PUBLICOS, NO SECRETOS; no autorizan nada por si solos):', `- clave de operacion: \`${op.key}\` | huella del estado: \`${fp}\` | administrador: ${admin ? 'SI' : 'no'}`, 'La autorizacion de escritura la emite gerencia en privado con `npm run sync-pilot-wa-autoriza` (clave privada, caduca en <= 60 min).'] : ['Modo real: la autorizacion privada se verifica en el codigo; no se publica ningun codigo.']),
    `Margen minimo de llegada: ${pub.minLeadDays} dias${exc?.ok ? ' (EXCEPCION de gerencia verificada)' : ' (fijo)'}`,
    `Resultado: ${pub.results.map((r) => `${r.result} ${r.code ?? ''} [${r.steps.join(', ')}]`).join('; ') || pub.halted}`, `Escrituras enviadas a Odoo: ${pub.writesSentToOdoo}`, ''].join('\n'));
  process.exit(0);
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writes: 0 }, 1); }
