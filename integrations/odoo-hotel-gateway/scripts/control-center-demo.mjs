#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-012 V2 -- genera un informe HTML del Control Center con
 * DATOS FICTICIOS (sin Odoo, sin red) para revisar el diseno y como
 * evidencia reproducible. El propio informe lo rotula como demostracion.
 *
 *   node scripts/control-center-demo.mjs [salida.html]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildControlCenter } from '../src/control-center-model.mjs';
import { renderControlCenterHtml } from '../src/control-center-render.mjs';

const TODAY = '2026-10-03';
const out = process.argv[2] || '../../AI/hotel-012-v2-evidence/control-center-demo.html';
const ATH = 'HOTEL ATHERON SUITE';
let n = 0;
const r = (o) => ({ external_reference: `DEMO/${String(++n).padStart(3, '0')}`, guest: 'Huésped demo', phone: '3000000000', channel: 'DIRECTO', property: ATH, reservation_date: '2026-09-28', guests: 2, gross_sale: 200000, collected: 0, hold_expired: false, real_status: 'confirmed', ...o });
const add = (d, k) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

const reservations = [
  r({ unit: '201', real_status: 'checked_in', channel: 'BOOKING', checkin: '2026-10-01', checkout: TODAY, gross_sale: 240000, collected: 240000, balance: 0 }),
  r({ unit: '202', channel: 'AIRBNB', checkin: TODAY, checkout: '2026-10-05', guests: 3, gross_sale: 300000, collected: 90000, balance: 210000 }),
  r({ unit: '203', real_status: 'checked_out', channel: 'WHATSAPP', checkin: '2026-10-01', checkout: TODAY, gross_sale: 220000, collected: 220000, balance: 0 }),
  r({ unit: '301', real_status: 'hold', channel: 'WHATSAPP', checkin: '2026-10-04', checkout: '2026-10-06', guests: 5, gross_sale: 480000, hold_expires: '2026-10-03 20:00:00' }),
  r({ unit: '302', checkin: '2026-10-04', checkout: '2026-10-05', guests: 3, gross_sale: 110000 }),
  r({ unit: 'CASA COMPLETA', property: 'CASA ALGARRA', checkin: '2026-10-10', checkout: '2026-10-12', guests: 12, gross_sale: 900000, channel: 'DIRECTO' }),
  r({ unit: '201', real_status: 'opcion', checkin: '2026-10-08', checkout: '2026-10-09', gross_sale: 120000 }),
  r({ unit: '202', real_status: 'draft', checkin: '2026-10-15', checkout: '2026-10-16', gross_sale: 130000 }),
  r({ unit: '203', real_status: 'closed', channel: 'BOOKING', checkin: '2026-09-25', checkout: '2026-09-27', gross_sale: 200000, collected: 150000, balance: 50000 }),
  r({ unit: 'CASA COMPLETA', channel: 'AIRBNB', checkin: add(TODAY, 8), checkout: add(TODAY, 9), guests: 14, gross_sale: 650000 }),
];
const hk = [
  ['201', 'LISTA'], ['202', 'POR LIMPIAR'], ['203', 'EN LIMPIEZA', 'Rosa'], ['301', 'LISTA'], ['302', 'LISTA PARA REVISAR', 'Marta'],
].map(([unit, stage, assignee]) => ({ unit, stage, assignee: assignee ?? null, updated_at: '2026-10-03 09:40:00' }));

const cc = buildControlCenter({
  reservations,
  referenceDate: TODAY,
  horizon: { preset: process.env.HORIZON || '7_DIAS' },
  housekeepingTasks: hk,
  payments: [{ collected_date: TODAY, amount: 90000 }],
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderControlCenterHtml(cc, { demo: true }));
console.log(JSON.stringify({ written: out, validation_ok: cc.validation.ok, alerts: cc.alerts.length, headline: cc.headline }, null, 2));
