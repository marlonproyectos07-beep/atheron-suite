#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Gate 009-B -- tablero de Angela REAL (HOY),
 * conectado a Odoo STAGING via odoo-reporting-reader.mjs. Pensado para
 * correr LOCAL (PowerShell de Marlon) -- enmascara telefono (protege
 * PII incluso en la propia consola) y nunca debe pegarse tal cual en un
 * chat sin revisar.
 *
 * Uso:
 *   REFERENCE_DATE=2026-09-29 node scripts/angela-dashboard-live.mjs
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { fetchHotelReservations } from '../src/odoo-reporting-reader.mjs';
import { today, arrivals, departures, inHouse, holds, paymentPending, upcoming } from '../src/operational-read-model.mjs';

function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****${digits.slice(-4)}`;
}

function summarize(item) {
  return {
    unit: item.unit,
    status: item.reservation_status,
    guest_initial: item.guest ? item.guest.trim().charAt(0).toUpperCase() : null,
    phone_masked: maskPhone(item.phone),
    payment_status: item.payment_status,
    balance: item.balance,
    checkin: item.check_in,
    checkout: item.check_out,
  };
}

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

const reservations = await fetchHotelReservations(transport, {
  database: config.database,
  uid,
  technicalSecret: config.technicalSecret,
});

const referenceDate = process.env.REFERENCE_DATE || new Date().toISOString().slice(0, 10);

console.log(JSON.stringify({
  overall: 'PASS',
  reference_date: referenceDate,
  total_reservations_read: reservations.length,
  resumen: {
    llegan: arrivals(reservations, referenceDate).length,
    salen: departures(reservations, referenceDate).length,
    ocupadas: inHouse(reservations, referenceDate).length,
    hold_activos: holds(reservations, referenceDate).length,
    pendientes_de_pago: paymentPending(reservations, referenceDate).length,
  },
  hoy: today(reservations, referenceDate).map(summarize),
  pendientes_de_pago: paymentPending(reservations, referenceDate).map(summarize),
  proximas_entradas_14d: upcoming(reservations, referenceDate).map(summarize),
  note: 'Telefono enmascarado (solo ultimos 4 digitos). Nombre reducido a inicial. No pegar sin revisar si contiene datos reales de huespedes.',
}, null, 2));
