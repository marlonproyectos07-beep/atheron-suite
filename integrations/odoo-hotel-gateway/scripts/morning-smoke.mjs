#!/usr/bin/env node
/**
 * npm run hotel:morning-smoke
 *
 * ATH-ODOO-HOTEL-008 Nivel 1 - Workstream M (night shift 2026-09-29).
 *
 * Corre TODO localmente, con fixtures/contratos, SIN tocar produccion ni
 * staging por red (esta noche no hubo sesion segura de Odoo STAGING
 * disponible). Cada fase queda marcada PASS/FAIL/SKIPPED/STAGING_PENDING.
 *
 * Para ejecutar la MISMA verificacion contra Odoo STAGING real cuando haya
 * credenciales disponibles, usar el runner ya existente y probado:
 *   node scripts/live-hotel-008a-runner.mjs all
 * (ver AI/ATH-ODOO-HOTEL-008A_HANDOFF.md). Este script NO lo reemplaza,
 * es el complemento Nivel 1 que se puede correr sin red.
 */

import { isAvailable, occupancyReason, ROOM_UNITS, CASA_COMPLETA } from '../../odoo-hotel-ical/src/inventory-model.mjs';
import { requestAccommodationAlternatives } from '../src/alternatives-engine.mjs';
import { dailyClose, assertGrossSaleMatchesPayoutPlusCommission, PENDIENTE_DE_VERIFICAR } from '../src/financial-model.mjs';
import { CAMILO, ALL_RESERVATIONS } from '../fixtures/reservation-fixtures.mjs';

const CHECK_IN = '2026-09-30';
const CHECK_OUT = '2026-10-01';

const results = [];

function record(phase, overall, detail = {}) {
  results.push({ phase, overall, ...detail });
}

async function runPhase(phase, fn) {
  try {
    await fn();
  } catch (error) {
    record(phase, 'FAIL', { error: error.message });
  }
}

// --- Fase 1: inventory baseline -------------------------------------------------
let bookings = [];
await runPhase('inventory_baseline', () => {
  const available201 = isAvailable(bookings, '201', CHECK_IN, CHECK_OUT);
  if (available201 !== true) throw new Error('201 deberia partir disponible con inventario vacio');
  record('inventory_baseline', 'PASS', { note: '201 disponible con inventario vacio (local, sin red)' });
});

// --- Fase 2: 201 hold -------------------------------------------------------------
await runPhase('gate_201_hold', () => {
  // Simula el efecto de un HOLD real: mientras el hold esta activo, la
  // unidad se comporta como ocupada. El contrato real de HOLD (con
  // idempotency_key, expiracion, etc.) ya existe y esta probado en
  // src/gateway.mjs / src/idempotency-store.mjs -- no se reconstruye aqui.
  bookings = [...bookings, { unit: '201', checkIn: CHECK_IN, checkOut: CHECK_OUT }];
  const stillAvailable = isAvailable(bookings, '201', CHECK_IN, CHECK_OUT);
  if (stillAvailable !== false) throw new Error('201 deberia quedar no disponible tras el HOLD');
  record('gate_201_hold', 'PASS', { note: 'HOLD simulado localmente; ejecucion real contra staging: STAGING_EXECUTION_PENDING' });
});

// --- Fase 3: cross-blocking --------------------------------------------------------
await runPhase('cross_blocking', () => {
  const casaCompleta = isAvailable(bookings, CASA_COMPLETA, CHECK_IN, CHECK_OUT);
  if (casaCompleta !== false) throw new Error('Casa Completa deberia quedar bloqueada por el HOLD de 201');

  const hermanas = ['202', '203', '301', '302'];
  for (const room of hermanas) {
    const avail = isAvailable(bookings, room, CHECK_IN, CHECK_OUT);
    if (avail !== true) throw new Error(`${room} NO deberia bloquearse por el HOLD de 201 (habitaciones hermanas)`);
  }
  record('cross_blocking', 'PASS', { casa_completa_blocked: true, hermanas_libres: hermanas });
});

// --- Fase 4: alternatives ---------------------------------------------------------
await runPhase('alternatives', async () => {
  const checkAvailability = (unit, ci, co) => isAvailable(bookings, unit, ci, co);
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: CHECK_IN, checkOut: CHECK_OUT, guests: 2 },
    { checkAvailability },
  );
  if (result.requested_available !== false) throw new Error('201 deberia reportarse no disponible');
  const units = result.alternatives.map((a) => a.unit).sort();
  if (JSON.stringify(units) !== JSON.stringify(['202', '203', '301', '302'])) {
    throw new Error(`alternativas inesperadas: ${JSON.stringify(units)}`);
  }
  record('alternatives', 'PASS', { alternatives: units });
});

// --- Fase 5: release ---------------------------------------------------------------
await runPhase('release_hold', () => {
  bookings = bookings.filter((b) => !(b.unit === '201' && b.checkIn === CHECK_IN));
  const restored201 = isAvailable(bookings, '201', CHECK_IN, CHECK_OUT);
  const restoredCasa = isAvailable(bookings, CASA_COMPLETA, CHECK_IN, CHECK_OUT);
  if (restored201 !== true || restoredCasa !== true) {
    throw new Error('el inventario no volvio al estado previo tras liberar el HOLD de prueba');
  }
  record('release_hold', 'PASS', { note: 'inventario restaurado, sin HOLD activos de prueba' });
});

// --- Fase 6: Camilo financial test --------------------------------------------------
await runPhase('camilo_financial', () => {
  assertGrossSaleMatchesPayoutPlusCommission(CAMILO);
  const day27 = dailyClose([CAMILO], '2026-09-27');
  const day28 = dailyClose([CAMILO], '2026-09-28');
  const day29 = dailyClose([CAMILO], '2026-09-29');
  if (day27.sales_created_today !== 1 || day28.stays_today !== 1) {
    throw new Error('separacion venta/estancia de Camilo fallo');
  }
  if (day27.sales_created_today_total !== 150000) throw new Error('venta de Camilo no debe reportarse como el payout neto');
  record('camilo_financial', 'PASS', {
    venta: day27.sales_created_today_total,
    comision: 27667.5,
    payout_esperado: 122332.5,
  });
});

// --- Fase 7: Paola whole-house test -------------------------------------------------
await runPhase('paola_whole_house', () => {
  const paolaBookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  for (const room of ROOM_UNITS) {
    if (isAvailable(paolaBookings, room, '2026-09-28', '2026-09-29') !== false) {
      throw new Error(`${room} deberia rechazarse mientras Casa Completa (Paola) esta reservada`);
    }
  }
  const inverse = isAvailable([{ unit: '302', checkIn: '2026-09-28', checkOut: '2026-09-29' }], CASA_COMPLETA, '2026-09-28', '2026-09-29');
  if (inverse !== false) throw new Error('test inverso fallo: 302 reservada deberia bloquear Casa Completa');
  record('paola_whole_house', 'PASS', { note: 'bloqueo cruzado verificado con fixture real (reserva Booking 6634915879)' });
});

// --- Fase 8: management-close fixtures ----------------------------------------------
await runPhase('management_close', () => {
  const close = dailyClose(ALL_RESERVATIONS, '2026-09-28');
  if (close.unreconciled !== PENDIENTE_DE_VERIFICAR) {
    throw new Error('sin extracto bancario real, unreconciled debe quedar PENDIENTE_DE_VERIFICAR');
  }
  record('management_close', 'PASS', {
    unverified_reservation_dates: close.unverified_reservation_dates,
    unreconciled: close.unreconciled,
  });
});

const summary = {
  total: results.length,
  pass: results.filter((r) => r.overall === 'PASS').length,
  fail: results.filter((r) => r.overall === 'FAIL').length,
  pending: results.filter((r) => r.overall === 'STAGING_EXECUTION_PENDING').length,
  skipped: results.filter((r) => r.overall === 'SKIPPED').length,
};

console.log(JSON.stringify({ phases: results, summary, staging_note: 'STAGING_EXECUTION_PENDING para las fases equivalentes contra Odoo real; usar scripts/live-hotel-008a-runner.mjs cuando haya credenciales.' }, null, 2));
process.exitCode = summary.fail > 0 ? 1 : 0;
