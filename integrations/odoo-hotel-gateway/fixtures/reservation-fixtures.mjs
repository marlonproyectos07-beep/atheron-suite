/**
 * Fixtures financieros con datos REALES entregados directamente por el CEO
 * (Marlon) en sus ordenes de auditoria ATH-ODOO-HOTEL-008, reutilizados
 * aqui solo para probar el motor de cierre gerencial (financial-model.mjs).
 * No se completa ningun dato que no fue entregado: donde falta, se deja
 * `null` o `PENDIENTE_DE_VERIFICAR` en vez de inventarlo.
 *
 * Fuente de cada cifra: mensajes del CEO en esta sesion + verificacion en
 * vivo en Airbnb/Odoo (Camilo) y Booking (Paola), ya documentada en
 * AI/ATH-ODOO-HOTEL-008_OTA_MAP.md.
 */

import { PENDIENTE_DE_VERIFICAR } from '../src/financial-model.mjs';

export const CAMILO = Object.freeze({
  guest: 'Camilo',
  channel: 'AIRBNB',
  unit: '301',
  external_reference: 'HM4D9HFYRW',
  reservation_date: '2026-09-27',
  checkin: '2026-09-28',
  checkout: '2026-09-29',
  guests: 2,
  gross_sale: 150000,
  ota_commission: 27667.5,
  expected_payout: 122332.5,
  received_payout: null, // "programado" en Airbnb, no confirmado como recibido
  payout_date: '2026-09-29',
  invoiced: 0,
  invoiced_date: null,
  collected: 0,
  collected_date: null,
  payment_method: null,
  payments: [],
});

export const PAOLA = Object.freeze({
  guest: 'Paola',
  channel: 'BOOKING',
  unit: 'CASA_COMPLETA',
  external_reference: '6634915879',
  reservation_date: '2026-09-27',
  checkin: '2026-09-28',
  checkout: '2026-09-29',
  guests: 12,
  gross_sale: 700000,
  ota_commission: 105000, // comision mostrada por Booking Extranet
  expected_payout: 595000,
  received_payout: null,
  payout_date: null,
  invoiced: 0,
  invoiced_date: null,
  collected: 0,
  collected_date: null,
  payment_method: null,
  payments: [],
});

export const KEVIN = Object.freeze({
  guest: 'Kevin',
  channel: 'AIRBNB',
  unit: '302',
  external_reference: 'COT/2026/03615',
  reservation_date: '2026-09-27',
  checkin: '2026-09-27',
  checkout: '2026-09-28',
  guests: null,
  gross_sale: 86448,
  ota_commission: null, // no se entrego el desglose, solo venta y pago
  expected_payout: null,
  received_payout: null,
  payout_date: null,
  invoiced: 86448,
  invoiced_date: '2026-09-27',
  collected: 86448,
  collected_date: '2026-09-27',
  payment_method: 'bancolombia',
  payments: [{ method: 'bancolombia', amount: 86448 }],
});

export const JHON = Object.freeze({
  guest: 'Jhon',
  channel: null,
  unit: '302',
  external_reference: 'COT/2026/03616',
  reservation_date: '2026-09-28',
  checkin: '2026-09-28',
  checkout: '2026-09-29',
  guests: null,
  gross_sale: 55000,
  ota_commission: null,
  expected_payout: null,
  received_payout: null,
  payout_date: null,
  invoiced: 55000,
  invoiced_date: '2026-09-28',
  collected: 55000,
  collected_date: '2026-09-28',
  payment_method: 'daviplata',
  payments: [{ method: 'daviplata', amount: 55000 }],
});

export const BLANCA_301 = Object.freeze({
  guest: 'Blanca',
  channel: null,
  unit: '301',
  external_reference: 'COT/2026/03617',
  reservation_date: '2026-09-27',
  checkin: '2026-09-27',
  checkout: '2026-09-28',
  guests: null,
  gross_sale: 210000,
  ota_commission: null,
  expected_payout: null,
  received_payout: null,
  payout_date: null,
  invoiced: 210000,
  invoiced_date: '2026-09-27',
  collected: 210000,
  collected_date: '2026-09-27',
  payment_method: 'bancolombia',
  payments: [{ method: 'bancolombia', amount: 210000 }],
});

// Segunda reserva de la misma huesped, cobrada dividida entre dos medios
// (40.000 Bancolombia + 15.000 efectivo) -- caso real ya reportado.
export const BLANCA_203 = Object.freeze({
  guest: 'Blanca',
  channel: null,
  unit: '203',
  external_reference: 'COT/2026/03618',
  reservation_date: '2026-09-28',
  checkin: '2026-09-28',
  checkout: '2026-09-29',
  guests: null,
  gross_sale: 55000,
  ota_commission: null,
  expected_payout: null,
  received_payout: null,
  payout_date: null,
  invoiced: 55000,
  invoiced_date: '2026-09-28',
  collected: 55000,
  collected_date: '2026-09-28',
  payment_method: null, // pago mixto: ver `payments`
  payments: [
    { method: 'bancolombia', amount: 40000 },
    { method: 'efectivo', amount: 15000 },
  ],
});

// Monica: el CEO corrigio explicitamente la fecha de venta/factura al
// 27/09 (no 28/09). Se usa la fecha corregida a proposito, para probar que
// el cierre no confunde fecha de venta con fecha de estancia.
export const MONICA = Object.freeze({
  guest: 'Monica',
  channel: null,
  unit: '203',
  external_reference: 'COT/2026/03605',
  reservation_date: '2026-09-27',
  checkin: '2026-09-27',
  checkout: '2026-09-28',
  guests: null,
  gross_sale: 120000,
  ota_commission: null,
  expected_payout: null,
  received_payout: null,
  payout_date: null,
  invoiced: 0,
  invoiced_date: null,
  collected: 0,
  collected_date: null,
  payment_method: null,
  payments: [],
});

// Daniel: el CEO marco explicitamente la fecha de venta como HIPOTESIS
// ("posiblemente ocurrio el sabado"), sin confirmar. Se deja
// PENDIENTE_DE_VERIFICAR en vez de asumir una fecha.
export const DANIEL = Object.freeze({
  guest: 'Daniel',
  channel: null,
  unit: 'CASA_COMPLETA',
  external_reference: 'COT/2026/03614',
  reservation_date: PENDIENTE_DE_VERIFICAR,
  checkin: PENDIENTE_DE_VERIFICAR,
  checkout: PENDIENTE_DE_VERIFICAR,
  guests: null,
  gross_sale: 607775,
  ota_commission: null,
  expected_payout: null,
  received_payout: null,
  payout_date: null,
  invoiced: 0,
  invoiced_date: null,
  collected: 0,
  collected_date: null,
  payment_method: null,
  payments: [],
});

export const ALL_RESERVATIONS = Object.freeze([
  CAMILO,
  PAOLA,
  KEVIN,
  JHON,
  BLANCA_301,
  BLANCA_203,
  MONICA,
  DANIEL,
]);
