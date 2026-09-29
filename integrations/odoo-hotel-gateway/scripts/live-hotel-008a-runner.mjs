#!/usr/bin/env node
/**
 * HOTEL-008A. CLI uses live-runner-safety.mjs and the complete HotelGateway.
 * Required environment: ODOO_DATABASE, ODOO_ACTION_ID=1967, ODOO_BASE_URL,
 * ODOO_TECHNICAL_USER, ODOO_TECHNICAL_SECRET. No dotenv file is loaded implicitly.
 * CLI phases: all | price-tiers | gate4 | inverse-gate | verify-expiration.
 * Before business operations: read rate 31 and require APPROVED and the CEO's
 * exact configuration. Never approves or writes master data.
 * Unit mapping is discovered from property-scoped availability, with clean
 * baselines. all uses independent windows for house, room 201 and room 302.
 * Quotes/HOLDs, request keys and windows are journaled without credentials.
 * verify-expiration checks every journaled HOLD and all six units per window.
 * Legacy subject/control helpers below remain for offline regression only;
 * the CLI does not create simultaneous controls expected to outlive subjects.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { executeSafeRun } from './live-runner-safety.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { randomUUID } from 'node:crypto';

export const ALLOWED_DATABASE = 'atheron1-hotel-staging-20260923';
export const COMMERCIAL_PRICE_TEST_CASES = [10, 11, 12, 22];
export const HOLD_ROOM_CODES = ['201', '202', '203', '301', '302'];

export class GuardError extends Error {}

export function commercialExpectation(guests) {
  return Math.max(500_000, guests * 50_000);
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value || String(value).trim() === '') {
    throw new GuardError(`Falta ${name} (obligatorio, sin valor por defecto).`);
  }
  return value;
}

/**
 * Construye y valida la configuracion LIVE a partir de env. Lanza
 * GuardError (nunca ContractError/silencio) ante cualquier cosa insegura.
 * No construye ningun transporte/adapter todavia -- eso es responsabilidad
 * de buildLiveAdapter, para que este guard se pueda probar solo.
 */
export function loadGuardedConfig(env = process.env) {
  const database = requireEnv(env, 'ODOO_DATABASE');
  if (database !== ALLOWED_DATABASE) {
    throw new GuardError(
      `ODOO_DATABASE='${database}' no coincide con la unica base autorizada ('${ALLOWED_DATABASE}'). Abortando sin tocar red.`
    );
  }

  const actionIdRaw = requireEnv(env, 'ODOO_ACTION_ID');
  const actionId = Number(actionIdRaw);
  if (actionId !== 1967) {
    throw new GuardError(`ODOO_ACTION_ID='${actionIdRaw}' no es un entero valido. Abortando.`);
  }

  const baseUrl = requireEnv(env, 'ODOO_BASE_URL');
  if (baseUrl !== `https://${ALLOWED_DATABASE}.odoo.com`) {
    throw new GuardError('ODOO_BASE_URL debe ser el origen HTTPS exacto de STAGING.');
  }
  const technicalUser = requireEnv(env, 'ODOO_TECHNICAL_USER');
  const technicalSecret = requireEnv(env, 'ODOO_TECHNICAL_SECRET');

  const unitIds = {
    201: env.UNIT_ID_201 && env.UNIT_ID_201.trim() !== '' ? env.UNIT_ID_201 : '1',
    202: env.UNIT_ID_202 || null,
    203: env.UNIT_ID_203 || null,
    301: env.UNIT_ID_301 || null,
    302: env.UNIT_ID_302 || null,
    CASA_COMPLETA: env.UNIT_ID_CASA_COMPLETA || null,
  };

  const dates = {
    checkIn: env.HOTEL008A_CHECK_IN || '2026-11-10',
    checkOut: env.HOTEL008A_CHECK_OUT || '2026-11-11',
  };

  const propertyId = env.HOTEL008A_PROPERTY_ID || null;

  return { database, actionId, baseUrl, technicalUser, technicalSecret, unitIds, dates, propertyId };
}

export function buildLiveAdapter(config, { transport } = {}) {
  return new OdooHotelAdapter({
    dryRun: false,
    config: {
      baseUrl: config.baseUrl,
      database: config.database,
      technicalUser: config.technicalUser,
      technicalSecret: config.technicalSecret,
      actionId: config.actionId,
    },
    transport: transport ?? new HttpOdooTransport({ baseUrl: config.baseUrl }),
  });
}

function extractData(response) {
  return response && typeof response === 'object' && response.data ? response.data : response;
}

function findUnitInAvailability(availabilityResponse, roomCode, unitId) {
  const data = extractData(availabilityResponse);
  const units = Array.isArray(data?.opciones) ? data.opciones.map(u => ({
    ...u, name: u.nombre,
    available: u.estado === 'disponible' ? true : u.estado === 'no_disponible' ? false : null,
  })) : Array.isArray(data?.units) ? data.units : [];
  return (
    (unitId ? units.find((u) => String(u.unit_id) === String(unitId)) : null) ??
    null
  );
}

/**
 * FASE: cotiza Casa Completa para 10/11/12/22 huespedes. Compara
 * `precio_total` (o `data.precio_total`) real de Odoo contra la
 * EXPECTATIVA COMERCIAL -- nunca al reves. Si Odoo rechaza por gobernanza
 * (tarifa no APPROVED), se clasifica como GOVERNANCE_BLOCKED, no como ERROR
 * generico ni como FAIL silencioso.
 */
export async function runPriceTiers(adapter, config) {
  const results = [];
  for (const guests of COMMERCIAL_PRICE_TEST_CASES) {
    const idempotency_key = `hotel008a-price-${guests}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      const response = await adapter.quote({
        check_in: config.dates.checkIn,
        check_out: config.dates.checkOut,
        guests,
        ...(config.propertyId ? { property_id: config.propertyId } : {}),
        idempotency_key,
        source_channel: 'sofia',
      });
      const data = extractData(response);
      const option = data?.opciones?.find(u => String(u.unit_id) === String(config.unitIds.CASA_COMPLETA)
        && String(u.property_id) === String(config.propertyId));
      const precio = option?.precio_total ?? null;
      const nights = (Date.parse(config.dates.checkOut) - Date.parse(config.dates.checkIn)) / 86400000;
      const expectation = commercialExpectation(guests) * nights;
      results.push({
        guests,
        status: precio === null ? 'NO_PRICE_FIELD' : precio === expectation ? 'MATCH' : 'MISMATCH',
        precio_total_odoo: precio,
        expectativa_comercial: expectation,
        tax_status: option?.tax_status ?? null,
        policy_governance: data?.policy_governance ?? null,
        quote_id: data?.quote_id ?? null,
        raw: data,
      });
    } catch (error) {
      const governanceCodes = new Set(['REQUIRES_MANUAL_CONFIRMATION', 'INSUFFICIENT_CAPACITY', 'UNAVAILABLE']);
      results.push({
        guests,
        status: governanceCodes.has(error.code) ? 'GOVERNANCE_BLOCKED' : 'ERROR',
        error_code: error.code ?? null,
        error_message: error.message,
      });
    }
  }
  const overall = results.every((r) => r.status === 'MATCH')
    ? 'PASS'
    : results.some((r) => r.status === 'GOVERNANCE_BLOCKED')
      ? 'PENDING_APPROVAL'
      : 'REVIEW_NEEDED';
  return { phase: 'price-tiers', overall, results };
}

/**
 * GATE 4: HOLD Casa Completa -> las 5 habitaciones deben quedar
 * `no_disponible`. Requiere UNIT_ID_CASA_COMPLETA explicito; sin el, SKIPPED
 * (nunca se inventa un id).
 */
export async function runGate4(adapter, config, { guests = 10 } = {}) {
  if (!config.unitIds.CASA_COMPLETA) {
    return { phase: 'gate4', overall: 'SKIPPED', reason: 'Falta UNIT_ID_CASA_COMPLETA (no se inventa).' };
  }

  const quoteResponse = await adapter.quote({
    check_in: config.dates.checkIn,
    check_out: config.dates.checkOut,
    guests,
    ...(config.propertyId ? { property_id: config.propertyId } : {}),
    idempotency_key: `gate4-quote-${Date.now()}`,
    source_channel: 'sofia',
  });
  const quoteData = extractData(quoteResponse);
  const quoteId = quoteData?.quote_id;
  if (!quoteId) {
    return { phase: 'gate4', overall: 'ERROR', reason: 'quote no devolvio quote_id', raw: quoteData };
  }

  const holdResponse = await adapter.hold({
    quote_id: quoteId,
    unit_id: config.unitIds.CASA_COMPLETA,
    idempotency_key: `gate4-hold-${Date.now()}`,
    source_channel: 'sofia',
  });
  const holdData = extractData(holdResponse);
  const holdId = holdData?.hold_id;

  const availabilityResponse = await adapter.availability({
    check_in: config.dates.checkIn,
    check_out: config.dates.checkOut,
    guests: 1,
    ...(config.propertyId ? { property_id: config.propertyId } : {}),
    source_channel: 'sofia',
  });

  const perRoom = {};
  for (const room of HOLD_ROOM_CODES) {
    const unit = findUnitInAvailability(availabilityResponse, room, config.unitIds[room]);
    perRoom[room] = unit ? { unit_id: unit.unit_id, available: unit.available ?? null } : { found: false };
  }
  const allBlocked = HOLD_ROOM_CODES.every((r) => perRoom[r].available === false);
  const anyUnknown = HOLD_ROOM_CODES.some((r) => perRoom[r].found === false || perRoom[r].available == null);

  return {
    phase: 'gate4',
    overall: allBlocked ? 'PASS' : anyUnknown ? 'REVIEW_NEEDED (datos incompletos, ver perRoom)' : 'FAIL',
    quote_id: quoteId,
    hold_id: holdId,
    perRoom,
  };
}

/**
 * Comprobacion inversa (ya probada en HOTEL-002/008A): HOLD de UNA
 * habitacion (201 por defecto, el unico unit_id confirmado) debe bloquear
 * Casa Completa, pero NO debe bloquear las otras habitaciones sueltas.
 */
export async function runInverseGate(adapter, config, { guests = 2, roomCode = '201' } = {}) {
  const roomUnitId = config.unitIds[roomCode];
  if (!roomUnitId) {
    return { phase: 'inverse-gate', overall: 'SKIPPED', reason: `Falta UNIT_ID_${roomCode} (no se inventa).` };
  }

  const quoteResponse = await adapter.quote({
    check_in: config.dates.checkIn,
    check_out: config.dates.checkOut,
    guests,
    ...(config.propertyId ? { property_id: config.propertyId } : {}),
    idempotency_key: `inverse-gate-quote-${Date.now()}`,
    source_channel: 'sofia',
  });
  const quoteData = extractData(quoteResponse);
  const quoteId = quoteData?.quote_id;
  if (!quoteId) {
    return { phase: 'inverse-gate', overall: 'ERROR', reason: 'quote no devolvio quote_id', raw: quoteData };
  }

  const holdResponse = await adapter.hold({
    quote_id: quoteId,
    unit_id: roomUnitId,
    idempotency_key: `inverse-gate-hold-${Date.now()}`,
    source_channel: 'sofia',
  });
  const holdData = extractData(holdResponse);
  const holdId = holdData?.hold_id;

  const availabilityResponse = await adapter.availability({
    check_in: config.dates.checkIn,
    check_out: config.dates.checkOut,
    guests: 1,
    ...(config.propertyId ? { property_id: config.propertyId } : {}),
    source_channel: 'sofia',
  });

  const casaCompletaUnit = config.unitIds.CASA_COMPLETA
    ? findUnitInAvailability(availabilityResponse, 'CASA', config.unitIds.CASA_COMPLETA)
    : null;
  const otherRooms = HOLD_ROOM_CODES.filter((r) => r !== roomCode);
  const perOtherRoom = {};
  for (const room of otherRooms) {
    const unit = findUnitInAvailability(availabilityResponse, room, config.unitIds[room]);
    perOtherRoom[room] = unit ? { unit_id: unit.unit_id, available: unit.available ?? null } : { found: false };
  }

  const casaCompletaBlocked = casaCompletaUnit ? casaCompletaUnit.available === false : null;
  const othersUnaffected = otherRooms
    .every((r) => perOtherRoom[r].available === true);
  const heldRoom = findUnitInAvailability(availabilityResponse, roomCode, roomUnitId);

  return {
    phase: 'inverse-gate',
    overall:
      casaCompletaBlocked === null
        ? 'REVIEW_NEEDED (falta UNIT_ID_CASA_COMPLETA para verificar el bloqueo)'
        : casaCompletaBlocked && othersUnaffected && heldRoom?.available === false
          ? 'PASS'
          : 'FAIL',
    quote_id: quoteId,
    hold_id: holdId,
    casa_completa_blocked: casaCompletaBlocked,
    perOtherRoom,
  };
}

/**
 * Crea los HOLDs necesarios para probar expiracion mas tarde: uno "sujeto de
 * prueba" (el que se dejara expirar) y uno "de control" en una habitacion
 * NO relacionada (para probar que expirar el primero no libera ni afecta al
 * segundo). Persiste el estado (solo IDs y timestamps, CERO secretos) para
 * que verify-expiration lo recoja horas despues, incluso en otra sesion.
 */
export async function runCreateHoldsForExpiration(adapter, config, { subjectRoom = '201', controlRoom = '302' } = {}) {
  const subjectUnitId = config.unitIds[subjectRoom];
  const controlUnitId = config.unitIds[controlRoom];
  if (!subjectUnitId || !controlUnitId) {
    return {
      phase: 'create-holds-for-expiration',
      overall: 'SKIPPED',
      reason: `Falta UNIT_ID_${subjectRoom} o UNIT_ID_${controlRoom} (no se inventan).`,
    };
  }

  async function quoteAndHold(unitId, tag) {
    const quoteResponse = await adapter.quote({
      check_in: config.dates.checkIn,
      check_out: config.dates.checkOut,
      guests: 2,
      idempotency_key: `${tag}-quote-${Date.now()}`,
      source_channel: 'sofia',
    });
    const quoteData = extractData(quoteResponse);
    const holdResponse = await adapter.hold({
      quote_id: quoteData.quote_id,
      unit_id: unitId,
      idempotency_key: `${tag}-hold-${Date.now()}`,
      source_channel: 'sofia',
    });
    const holdData = extractData(holdResponse);
    return { quote_id: quoteData.quote_id, hold_id: holdData.hold_id };
  }

  const subject = await quoteAndHold(subjectUnitId, 'expiration-subject');
  const control = await quoteAndHold(controlUnitId, 'expiration-control');

  const state = {
    created_at: new Date().toISOString(),
    subject: { room: subjectRoom, unit_id: subjectUnitId, ...subject },
    control: { room: controlRoom, unit_id: controlUnitId, ...control },
    note: 'Solo IDs/timestamps. Cero secretos. Verificar expiracion no antes de 2h (politica vigente).',
  };
  return { phase: 'create-holds-for-expiration', overall: 'CREATED', state };
}

/**
 * Corre horas despues (posiblemente en otra sesion): confirma que el HOLD
 * "sujeto" expiro y que la disponibilidad se restauro, y que el HOLD "de
 * control" (independiente) SIGUE activo -- es decir, que expirar uno no
 * libero al otro por error.
 */
export async function runVerifyExpiration(adapter, config, state) {
  if (!state?.subject?.hold_id || !state?.control?.hold_id) {
    return { phase: 'verify-expiration', overall: 'ERROR', reason: 'Estado invalido/incompleto.' };
  }

  const subjectStatus = extractData(
    await adapter.status({ operation_id: state.subject.hold_id, source_channel: 'sofia' })
  );
  const controlStatus = extractData(
    await adapter.status({ operation_id: state.control.hold_id, source_channel: 'sofia' })
  );

  const availabilityResponse = await adapter.availability({
    check_in: config.dates.checkIn,
    check_out: config.dates.checkOut,
    guests: 1,
    source_channel: 'sofia',
  });
  const subjectUnit = findUnitInAvailability(availabilityResponse, state.subject.room, state.subject.unit_id);

  const subjectExpired = subjectStatus?.status === 'hold_expired';
  const subjectRestored = subjectUnit ? subjectUnit.available === true : null;
  const controlUnaffected = controlStatus?.status === 'hold_active';

  return {
    phase: 'verify-expiration',
    overall: subjectExpired && subjectRestored === true && controlUnaffected ? 'PASS' : 'REVIEW_NEEDED',
    subjectStatus,
    controlStatus,
    subjectRestored,
  };
}

export function summarize(phaseResults) {
  const overall = phaseResults.length > 0 && phaseResults.every((p) => p.overall === 'PASS' || p.overall === 'PENDING_APPROVAL')
    ? phaseResults.some((p) => p.overall === 'PENDING_APPROVAL')
      ? 'PENDING_APPROVAL'
      : 'PASS'
    : 'REVIEW_NEEDED';
  return { overall, phases: phaseResults };
}

// --- CLI ---
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

async function main() {
  const phase = process.argv[2] ?? 'all';
  const stateFile = process.env.LIVE_RUNNER_STATE_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'live-runner-state.local.json');

  let config;
  try {
    config = loadGuardedConfig(process.env);
  } catch (error) {
    if (error instanceof GuardError) {
      console.error(`GUARD FAIL-CLOSED: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  const built = buildGatewayFromEnv({ ...process.env, DRY_RUN: 'false' });
  const rawKey = randomUUID();
  built.identityStore.register({ agentId: 'hotel008a-local', actor: 'codex', rawKey });
  const adapter = Object.fromEntries(['availability', 'quote', 'hold', 'status'].map(operation => [operation, async payload => {
    const { source_channel, ...body } = payload;
    const r = await built.gateway.handle({ operation, agentId: 'hotel008a-local', rawKey, body });
    if (!r.envelope.ok) throw new GuardError('GATEWAY_' + r.code);
    return r.envelope.data;
  }]));
  const summary = await executeSafeRun({ phase, config, adapter,
    transport: new HttpOdooTransport({ baseUrl: config.baseUrl }), stateFile,
    runPriceTiers, runGate4, runInverseGate });
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = ['PASS', 'PASS_FUNCTIONAL_PENDING_EXPIRY'].includes(summary.overall) ? 0 : 1;
}

if (isMainModule) {
  main().catch((error) => {
    console.error('RUNNER STOP:', /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'SAFE_ERROR_REVIEW_LOCAL_STATE');
    process.exit(3);
  });
}
