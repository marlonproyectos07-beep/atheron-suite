// HOTEL-008A: orchestration guards, no commercial writes or price overrides.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises';

const ROOMS = ['201', '202', '203', '301', '302', 'CASA_COMPLETA'];
const data = r => r?.data ?? r;
function demand(value, message) { if (!value) throw new Error(message); }

export async function assertApprovedRate(config, transport) {
  const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
  demand(Number.isInteger(uid) && uid > 0, 'AUTH_FAILED');
  const rows = await transport.call('object', 'execute_kw', [config.database, uid, config.technicalSecret,
    'x_hotel_rate', 'read', [[31]], { fields: ['x_rule_code', 'x_gov_state', 'x_pricing_model',
      'x_price_night', 'x_base_guests', 'x_extra_person_price', 'x_max_guests', 'x_active', 'x_unit_id', 'x_property_id'] }]);
  const r = rows?.[0];
  demand(rows?.length === 1 && r.id === 31 && r.x_gov_state === 'approved', 'RATE_31_NOT_APPROVED');
  demand(r.x_rule_code === 'RATE-AHS-CASA-BASE10-ADD' && r.x_pricing_model === 'base_plus_extra'
    && r.x_price_night === 500000 && r.x_base_guests === 10 && r.x_extra_person_price === 50000
    && r.x_max_guests === 22 && r.x_active === true, 'RATE_31_CONFIGURATION_MISMATCH');
  demand(Number.isInteger(r.x_property_id?.[0]) && Number.isInteger(r.x_unit_id?.[0]), 'RATE_RELATION_MISSING');
  return { propertyId: r.x_property_id[0], houseId: r.x_unit_id[0] };
}

export function windowAt(config, offset, now = Date.now()) {
  const start = Date.parse(config.dates.checkIn + 'T00:00:00Z');
  const end = Date.parse(config.dates.checkOut + 'T00:00:00Z');
  demand(Number.isFinite(start) && Number.isFinite(end) && start > now && end > start, 'INVALID_FUTURE_DATES');
  const duration = end - start;
  const shift = offset * (duration + 7 * 86400000);
  return { checkIn: new Date(start + shift).toISOString().slice(0, 10), checkOut: new Date(end + shift).toISOString().slice(0, 10) };
}

export function inventory(response, config) {
  const options = data(response)?.opciones;
  demand(Array.isArray(options), 'AVAILABILITY_CONTRACT_MISMATCH');
  const result = {};
  for (const room of ROOMS) {
    const name = room === 'CASA_COMPLETA' ? 'CASA COMPLETA' : room;
    const matches = options.filter(o => o.property_id === Number(config.propertyId) && o.nombre === name);
    demand(matches.length === 1 && Number.isInteger(matches[0].unit_id), 'UNIT_MAPPING_AMBIGUOUS');
    const unit = matches[0];
    if (config.unitIds[room]) demand(Number(config.unitIds[room]) === unit.unit_id, 'UNIT_MAPPING_MISMATCH');
    demand(['disponible', 'no_disponible'].includes(unit.estado), 'UNKNOWN_INVENTORY_STATE');
    result[room] = { unit_id: unit.unit_id, estado: unit.estado };
  }
  demand(new Set(Object.values(result).map(u => u.unit_id)).size === 6, 'DUPLICATE_UNIT_ID');
  return result;
}

export async function baseline(adapter, config) {
  const response = await adapter.availability({ check_in: config.dates.checkIn, check_out: config.dates.checkOut,
    guests: 1, property_id: config.propertyId, source_channel: 'sofia' });
  const units = inventory(response, config);
  demand(Object.values(units).every(u => u.estado === 'disponible'), 'BASELINE_NOT_CLEAN');
  return units;
}

function expirationPassed(expiration, now = Date.now()) {
  if (!expiration) return false;
  const raw = String(expiration).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? raw.replace(' ', 'T') + 'Z'
    : raw;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) && timestamp <= now;
}

export async function verifyJournal(adapter, state, { now = Date.now() } = {}) {
  demand(state?.database === 'atheron1-hotel-staging-20260923' && state.holds?.length > 0, 'INVALID_JOURNAL');
  demand(!state.pending, 'UNRESOLVED_REQUEST_REQUIRES_RECONCILIATION');
  const results = [];
  for (const h of state.holds) {
    demand(h.hold_id && h.config?.dates && h.config?.propertyId, 'INCOMPLETE_HOLD_JOURNAL');
    let status;
    try {
      status = data(await adapter.status({ operation_id: h.hold_id, source_channel: 'sofia' }));
    } catch (error) {
      if (error?.message !== 'GATEWAY_NOT_FOUND') throw error;

      // Odoo may purge expired HOLD rows, so status() can legitimately return
      // NOT_FOUND after the expiry timestamp. Do not treat absence alone as PASS:
      // require both (a) expiry time already passed and (b) the full inventory
      // window is clean again. This keeps the verifier fail-closed.
      if (!expirationPassed(h.expiration, now)) {
        results.push({
          hold_id: h.hold_id,
          status: 'hold_not_found_before_expiration',
          restored: false,
          evidence: 'GATEWAY_NOT_FOUND',
        });
        continue;
      }

      try {
        await baseline(adapter, h.config);
        results.push({
          hold_id: h.hold_id,
          status: 'hold_gone_after_expiration',
          restored: true,
          evidence: 'GATEWAY_NOT_FOUND+clean_availability',
        });
      } catch (availabilityError) {
        results.push({
          hold_id: h.hold_id,
          status: 'hold_gone_after_expiration',
          restored: false,
          evidence: 'GATEWAY_NOT_FOUND+availability_not_clean',
          availability_error: availabilityError?.message ?? 'UNKNOWN_AVAILABILITY_ERROR',
        });
      }
      continue;
    }

    let restored = false;
    if (status.hold_id === h.hold_id && status.status === 'hold_expired') {
      await baseline(adapter, h.config);
      restored = true;
    }
    results.push({ hold_id: h.hold_id, status: status.status, restored });
  }
  return { phase: 'verify-expiration', overall: results.every(r => r.restored) ? 'PASS' : 'PENDING_EXPIRY', results };
}

export async function executeSafeRun({ phase, config, adapter, transport, stateFile, runPriceTiers, runGate4, runInverseGate }) {
  // Exclusive local lock: concurrent runners must not overwrite each other's journal.
  const lock = await open(stateFile + '.lock', 'wx');
  try {
    return await executeLocked({ phase, config, adapter, transport, stateFile, runPriceTiers, runGate4, runInverseGate });
  } finally {
    await lock.close();
    await unlink(stateFile + '.lock');
  }
}

async function executeLocked({ phase, config, adapter, transport, stateFile, runPriceTiers, runGate4, runInverseGate }) {
  demand(['all', 'price-tiers', 'gate4', 'inverse-gate', 'verify-expiration'].includes(phase), 'UNKNOWN_PHASE');
  // Only login + read of the named rule before approval. Never approves it.
  const rate = await assertApprovedRate(config, transport);
  if (phase === 'verify-expiration') {
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    const result = await verifyJournal(adapter, saved);
    saved.cleanup_verified = result.overall === 'PASS';
    saved.expiration_verification = result;
    await writeFile(stateFile + '.tmp', JSON.stringify(saved, null, 2), { mode: 0o600 });
    await rename(stateFile + '.tmp', stateFile);
    return result;
  }
  let previous;
  try { previous = JSON.parse(await readFile(stateFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  demand(!previous || previous.cleanup_verified === true, 'EXISTING_RUN_REQUIRES_EXPIRATION_VERIFICATION');
  const state = { database: config.database, run_id: randomUUID(), holds: [], quotes: [], pending: null, phases: [] };
  const persist = async () => {
    await writeFile(stateFile + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(stateFile + '.tmp', stateFile);
  };
  const c = { ...config, propertyId: rate.propertyId, unitIds: { ...config.unitIds, CASA_COMPLETA: rate.houseId }, dates: windowAt(config, 0) };
  const units = await baseline(adapter, c);
  c.unitIds = Object.fromEntries(Object.entries(units).map(([k, v]) => [k, v.unit_id]));
  state.mapping = c.unitIds;
  state.baselines = [{ dates: c.dates, units }];
  await persist();
  let activeConfig = c;
  let lastQuote;
  const monitored = {
    availability: p => adapter.availability(p), status: p => adapter.status(p),
    quote: async p => {
      const request = { ...p, idempotency_key: `${state.run_id}-q-${state.quotes.length}` };
      state.pending = { operation: 'quote', request }; await persist();
      const response = await adapter.quote(request); lastQuote = data(response);
      demand(lastQuote?.quote_id, 'MISSING_QUOTE_ID');
      state.quotes.push({ quote_id: lastQuote.quote_id, idempotency_key: request.idempotency_key });
      state.pending = null; await persist(); return response;
    },
    hold: async p => {
      const option = lastQuote?.opciones?.find(o => o.unit_id === Number(p.unit_id) && o.property_id === activeConfig.propertyId);
      demand(lastQuote?.quote_id === p.quote_id && option?.pricing_status === 'quoted'
        && option.approval_level === 'approved' && Number.isFinite(option.precio_total) && option.precio_total > 0
        && option.currency === 'COP', 'NOT_APPROVED_QUOTE');
      if (Number(p.unit_id) === rate.houseId) demand(option.rate_rule_id === 'RATE-AHS-CASA-BASE10-ADD', 'HOUSE_RULE_MISMATCH');
      const request = { ...p, idempotency_key: `${state.run_id}-h-${state.holds.length}` };
      const snapshot = { dates: activeConfig.dates, propertyId: activeConfig.propertyId, unitIds: activeConfig.unitIds };
      state.pending = { operation: 'hold', request, config: snapshot }; await persist();
      const response = await adapter.hold(request); const hold = data(response);
      // Save before further network calls, including if a later assertion fails.
      state.holds.push({ hold_id: hold?.hold_id, hold_ref: hold?.hold_ref ?? null, quote_id: p.quote_id, unit_id: p.unit_id,
        expiration: hold?.hold_expires_utc ?? null, config: snapshot });
      demand(hold?.hold_id, 'MISSING_HOLD_ID');
      state.pending = null; await persist();
      demand(hold.precio_total === option.precio_total, 'HOLD_PRICE_MISMATCH');
      const status = data(await adapter.status({ operation_id: hold.hold_id, source_channel: 'sofia' }));
      state.holds.at(-1).hold_ref = status.hold_ref ?? state.holds.at(-1).hold_ref;
      state.holds.at(-1).status_evidence = status;
      state.holds.at(-1).expiration = status.hold_expires_utc ?? state.holds.at(-1).expiration;
      await persist();
      demand(status.hold_id === hold.hold_id && status.status === 'hold_active'
        && status.precio_total === option.precio_total, 'HOLD_STATUS_MISMATCH');
      return response;
    },
  };
  const prices = await runPriceTiers(monitored, c); state.phases.push(prices); await persist();
  demand(prices.overall === 'PASS', 'PRICE_TIERS_FAILED_NO_HOLDS_CREATED');
  const jobs = phase === 'all' ? ['gate4', 'inverse-gate', 'gate6'] : phase === 'price-tiers' ? [] : [phase];
  for (const [index, job] of jobs.entries()) {
    activeConfig = { ...c, dates: windowAt(config, index + 1) };
    const clean = await baseline(adapter, activeConfig);
    state.baselines.push({ dates: activeConfig.dates, units: clean });
    await persist();
    const result = job === 'gate4' ? await runGate4(monitored, activeConfig)
      : await runInverseGate(monitored, activeConfig, { roomCode: job === 'gate6' ? '302' : '201' });
    if (job === 'gate4') {
      const after = inventory(await monitored.availability({ check_in: activeConfig.dates.checkIn,
        check_out: activeConfig.dates.checkOut, guests: 1, property_id: c.propertyId, source_channel: 'sofia' }), activeConfig);
      demand(Object.values(after).every(u => u.estado === 'no_disponible'), 'HOUSE_GATE_INCOMPLETE');
      result.inventory = after;
    }
    state.phases.push({ ...result, phase: job }); await persist();
    demand(result.overall === 'PASS', 'INVENTORY_GATE_FAILED');
  }
  return { overall: state.holds.length ? 'PASS_FUNCTIONAL_PENDING_EXPIRY' : 'PASS', phases: state.phases };
}
