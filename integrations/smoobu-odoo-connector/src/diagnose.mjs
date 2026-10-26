import { UNITS, unitForSmoobuApartment } from './unit-map.mjs';
import { loadSmoobuConfig, loadOdooConfig, envStatus, credentialHygiene } from './config.mjs';
import { SmoobuClient } from './smoobu-client.mjs';
import { OdooJson2Client } from './odoo-json2-client.mjs';

export const TARGET_RESERVATION = 161419736;
export const PATH_PREFIXES = ['/api', '/api/v1'];

/** El prefijo entra en la firma y no pudimos leerlo de la fuente primaria: se prueba cada candidato hasta que uno no devuelva 404. */
export async function detectPrefix(makeClient) {
  const tried = [];
  for (const prefix of PATH_PREFIXES) {
    const client = makeClient(prefix);
    try { await client.listProperties(); return { client, prefix, tried: [...tried, { prefix, httpStatus: 200 }] }; } catch (e) {
      tried.push({ prefix, code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, detail: e.detail ?? null });
      // 404 (ruta) y 401 (la ruta equivocada tambien lo da) siguen al siguiente candidato; otro fallo corta
      if (e.status !== 404 && e.status !== 401) return { client, prefix, tried };
    }
  }
  return { client: makeClient(PATH_PREFIXES[0]), prefix: null, tried };
}

/** Ejecuta un paso y devuelve {name, status: OK|FAIL|SKIPPED, ...detalle} sin lanzar. */
async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) {
    return { name, status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null,
      ...(e.detail ? { upstreamMessage: e.detail } : {}), ...(e.serverDate ? { serverDate: e.serverDate } : {}) };
  }
}
const skipped = (name, why) => ({ name, status: 'SKIPPED', why });

/**
 * Diagnostico de SOLO LECTURA. Nunca incluye secretos ni datos de huespedes:
 * solo ids, fechas, conteos y codigos. `clients` es inyectable para pruebas.
 */
export async function runDiagnosis({ env = process.env, clients = {} } = {}) {
  const steps = [];
  let smoobu = clients.smoobu; let odoo = clients.odoo;
  let prefixProbe = null;
  if (!smoobu) { try {
    const cfg = loadSmoobuConfig(env);
    prefixProbe = await detectPrefix((pathPrefix) => new SmoobuClient({ ...cfg, pathPrefix }));
    smoobu = prefixProbe.client;
  } catch (e) { steps.push({ name: 'smoobu.config', status: 'BLOCKED', code: e.code, missing: e.missing }); } }
  if (!odoo) { try { odoo = new OdooJson2Client(loadOdooConfig(env)); } catch (e) { steps.push({ name: 'odoo.config', status: 'BLOCKED', code: e.code, missing: e.missing }); } }

  let reservation = null;
  if (smoobu) {
    steps.push(await step('smoobu.auth+apartments', async () => {
      const aps = await smoobu.listProperties();
      const ids = new Set(aps.map((a) => Number(a.id)));
      const units = UNITS.map((u) => ({ unit: u.unit, smoobuApartmentId: u.smoobuApartmentId, found: ids.has(u.smoobuApartmentId) }));
      return { pathPrefixUsed: prefixProbe?.prefix ?? null, prefixAttempts: prefixProbe?.tried ?? null, apartmentsReturned: aps.length, units, allSixFound: units.every((u) => u.found) };
    }));
    steps.push(await step(`smoobu.reservation.${TARGET_RESERVATION}`, async () => {
      reservation = await smoobu.getReservation(TARGET_RESERVATION);
      const unit = unitForSmoobuApartment(reservation?.apartment?.id);
      return { arrival: reservation.arrival, departure: reservation.departure, type: reservation.type ?? null,
        unit: unit?.unit ?? null, expectedRoleId: unit?.odooRoleId ?? null, isUnit301: unit?.unit === '301' };
    }));
  } else steps.push(skipped('smoobu.*', 'sin credenciales'));

  if (odoo) {
    steps.push(await step('odoo.json2+role37', async () => {
      const roles = await odoo.searchRead('planning.role', [['id', '=', 37]], ['id', 'name']);
      return { role37Exists: roles.length === 1, role37Name: roles[0]?.name ?? null };
    }));
    const res = steps.find((s) => s.name.startsWith('smoobu.reservation') && s.status === 'OK');
    if (res?.expectedRoleId) {
      steps.push(await step('odoo.slots-vs-reservation', async () => {
        const slots = await odoo.listSlotsForRole(res.expectedRoleId, { from: res.arrival, to: res.departure });
        return { roleId: res.expectedRoleId, slotsInRange: slots.length, slotIds: slots.map((s) => s.id),
          rolMatchesReservation: res.expectedRoleId === 37 };
      }));
    } else steps.push(skipped('odoo.slots-vs-reservation', 'reserva Smoobu no leida'));
  } else steps.push(skipped('odoo.*', 'sin credenciales'));

  const real = steps.filter((s) => s.status === 'OK').length;
  const overall = steps.some((s) => s.status === 'BLOCKED') ? 'BLOCKED' : steps.some((s) => s.status === 'FAIL') ? 'FAIL' : 'OK';
  const smoobuFail = steps.find((x) => x.name === 'smoobu.auth+apartments' && x.status === 'FAIL');
  if (smoobuFail && prefixProbe) smoobuFail.prefixAttempts = prefixProbe.tried;
  const report = { overall, realReads: real, env: envStatus(env), credentialHygiene: credentialHygiene(env), steps };
  const skew = clockSkewSeconds(smoobuFail?.serverDate);
  if (skew !== null) report.clockSkewSeconds = skew;
  report.classification = classify(report);
  return report;
}

const SIGNATURE_WORDS = /signature|hmac|timestamp|nonce|canonical|expired|replay/i;

/**
 * Clasificacion unica para el resumen del workflow:
 * ENV_MISSING | SMOOBU_AUTH_401 | SMOOBU_SIGNATURE_ERROR | SMOOBU_ENDPOINT_ERROR |
 * SMOOBU_OTHER_ERROR | ODOO_FAILURE | COMPLETE
 */
export function classify(report) {
  if (report.overall === 'BLOCKED') return 'ENV_MISSING';
  const fails = report.steps.filter((s) => s.status === 'FAIL');
  const sm = fails.find((s) => s.name.startsWith('smoobu'));
  if (sm) {
    const attempts = sm.prefixAttempts ?? [];
    const all = [sm, ...attempts];
    if (all.some((a) => SIGNATURE_WORDS.test(a.upstreamMessage ?? a.detail ?? ''))) return 'SMOOBU_SIGNATURE_ERROR';
    if (sm.httpStatus === 401 || sm.httpStatus === 403) return 'SMOOBU_AUTH_401';
    if (sm.httpStatus === 404) return 'SMOOBU_ENDPOINT_ERROR';
    return 'SMOOBU_OTHER_ERROR';
  }
  if (fails.length) return 'ODOO_FAILURE';
  return report.steps.every((s) => s.status === 'OK') ? 'COMPLETE' : 'ENV_MISSING';
}

/** Segundos de desfase entre el reloj local y la cabecera Date del servidor (null si no hay). */
export function clockSkewSeconds(serverDate, now = Date.now()) {
  const t = Date.parse(serverDate ?? '');
  return Number.isFinite(t) ? Math.round((now - t) / 1000) : null;
}
