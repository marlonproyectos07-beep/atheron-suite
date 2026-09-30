#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Gate 009-F -- tablero gerencial REAL, conectado a
 * Odoo STAGING via odoo-reporting-reader.mjs (SOLO LECTURA, dominio
 * fijo x_order_involves_room=true). Imprime SOLO agregados (nunca
 * huesped/telefono individual) -- para el detalle operativo usar
 * angela-dashboard-live.mjs, que se corre local y no se pega en chat.
 *
 * Uso:
 *   REFERENCE_DATE=2026-09-29 node scripts/manager-dashboard-live.mjs
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { fetchHotelReservations } from '../src/odoo-reporting-reader.mjs';
import { managerDashboard } from '../src/financial-model.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

const reservations = await fetchHotelReservations(transport, {
  database: config.database,
  uid,
  technicalSecret: config.technicalSecret,
});

const referenceDate = process.env.REFERENCE_DATE || new Date().toISOString().slice(0, 10);
const dashboard = managerDashboard(reservations, referenceDate);

console.log(JSON.stringify({
  overall: 'PASS',
  reference_date: referenceDate,
  total_reservations_read: reservations.length,
  sales_created_today: dashboard.sales_created_today,
  sales_created_today_total: dashboard.sales_created_today_total,
  stays_today: dashboard.stays_today,
  collected_today: dashboard.collected_today,
  accounts_receivable: dashboard.accounts_receivable,
  sales_by_channel: dashboard.sales_by_channel,
  sales_by_unit: dashboard.sales_by_unit,
  adr: dashboard.adr,
  unverified_reservation_dates_count: dashboard.unverified_reservation_dates.length,
  note: 'Agregados solamente. Ningun nombre/telefono individual se imprime aqui.',
}, null, 2));
