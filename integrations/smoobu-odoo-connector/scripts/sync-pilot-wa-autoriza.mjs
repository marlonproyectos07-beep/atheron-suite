#!/usr/bin/env node
// ATH-DEV-140: herramienta LOCAL de gerencia para emitir la AUTORIZACION PRIVADA del piloto aislado de WhatsApp.
// No se ejecuta en GitHub Actions ni en el chat. La clave privada llega SOLO por la variable de entorno PILOT_WA_AUTH_KEY de la maquina
// de gerencia (la misma que se guarda como secreto PILOT_WA_AUTH_KEY en GitHub); nunca por argumento ni se imprime.
//   PILOT_WA_AUTH_KEY=... node scripts/sync-pilot-wa-autoriza.mjs --id <ID> --clave <16 hex> --huella <12 hex> [--admin] [--margen <1-6>] [--minutos <1-60>]
// --clave y --huella salen del resumen de la simulacion (son publicos). Imprime los codigos y su caducidad (UTC); no toca red ni Odoo.
import { issuePilotWaAuth, stampOf, AUTH_MAX_MINUTES } from '../src/sync-pilot-wa-auth.mjs';
import { parsePilotSelection } from '../src/sync-pilot-wa.mjs';

const args = process.argv.slice(2);
const get = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(2); };
try {
  const key = process.env.PILOT_WA_AUTH_KEY;
  const smoobuId = parsePilotSelection(get('id'));
  const opKey = get('clave'); const fp = get('huella');
  if (!/^[0-9a-f]{16}$/.test(opKey ?? '')) fail('--clave debe ser 16 caracteres hexadecimales (resumen de la simulacion)');
  if (!/^[0-9a-f]{12}$/.test(fp ?? '')) fail('--huella debe ser 12 caracteres hexadecimales (resumen de la simulacion)');
  const minutes = get('minutos') === undefined ? 30 : Number(get('minutos'));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > AUTH_MAX_MINUTES) fail(`--minutos debe ser un entero entre 1 y ${AUTH_MAX_MINUTES}`);
  const expires = new Date(Math.floor((Date.now() + minutes * 60000) / 60000) * 60000);
  const out = { caducaUTC: stampOf(expires), ejecutar: issuePilotWaAuth({ key, kind: 'E', smoobuId, opKey, fp, expires }) };
  if (args.includes('--admin')) out.administrador = issuePilotWaAuth({ key, kind: 'A', smoobuId, opKey, fp, expires });
  if (get('margen') !== undefined) out.excepcionMargen = issuePilotWaAuth({ key, kind: 'EXC', smoobuId, opKey, fp, expires, days: Number(get('margen')) });
  console.log(JSON.stringify(out, null, 2));
} catch (e) { fail(e.code ?? e.message); }
