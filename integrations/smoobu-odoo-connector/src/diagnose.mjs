import { UNITS, unitForSmoobuApartment } from './unit-map.mjs';
import { loadSmoobuConfig, loadOdooConfig, envStatus } from './config.mjs';
import { SmoobuClient } from './smoobu-client.mjs';
import { OdooJson2Client } from './odoo-json2-client.mjs';

export const TARGET_RESERVATION = 161419736;

/** Ejecuta un paso y devuelve {name, status: OK|FAIL|SKIPPED, ...detalle} sin lanzar. */
async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) {
    return { name, status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null };
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
  if (!smoobu) { try { smoobu = new SmoobuClient(loadSmoobuConfig(env)); } catch (e) { steps.push({ name: 'smoobu.config', status: 'BLOCKED', code: e.code, missing: e.missing }); } }
  if (!odoo) { try { odoo = new OdooJson2Client(loadOdooConfig(env)); } catch (e) { steps.push({ name: 'odoo.config', status: 'BLOCKED', code: e.code, missing: e.missing }); } }

  let reservation = null;
  if (smoobu) {
    steps.push(await step('smoobu.auth+apartments', async () => {
      const aps = await smoobu.listProperties();
      const ids = new Set(aps.map((a) => Number(a.id)));
      const units = UNITS.map((u) => ({ unit: u.unit, smoobuApartmentId: u.smoobuApartmentId, found: ids.has(u.smoobuApartmentId) }));
      return { apartmentsReturned: aps.length, units, allSixFound: units.every((u) => u.found) };
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
  return { overall, realReads: real, env: envStatus(env), steps };
}
