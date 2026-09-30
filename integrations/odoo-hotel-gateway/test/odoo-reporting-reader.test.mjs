import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapSaleOrderToReservation,
  fetchHotelReservations,
  HOTEL_ORDER_DOMAIN,
  HOTEL_ORDER_FIELDS,
  mapAccountPaymentToCollection,
  fetchHotelPayments,
  HOTEL_PAYMENT_DOMAIN,
  HOTEL_PAYMENT_FIELDS,
} from '../src/odoo-reporting-reader.mjs';
import { FakeOdooTransport } from './fakes/odoo-transport.fake.mjs';

// Forma real confirmada via fields_get contra Odoo STAGING (2026-09-30,
// scripts/diagnostico-campos-hotel.mjs) -- no inventada.
const REAL_ROW_SHAPE = {
  id: 22226,
  name: 'COT/2026/03819',
  create_date: '2026-09-29 22:15:00',
  x_hotel_property_id: [1, 'HOTEL ATHERON SUITE'],
  x_hotel_unit_id: [2, '202'],
  x_nombre_cliente: 'Cliente WhatsApp',
  x_telf_cliente: '3000000000',
  x_checkin: '2027-02-10',
  x_checkout: '2027-02-11',
  x_num_adults: 1,
  x_num_children: 0,
  x_reservation_status: 'hold',
  x_booking_source: 'whatsapp',
  x_hold_origin: 'sofia',
  amount_total: 50000,
  x_hotel_paid: 0,
  x_hotel_balance: 50000,
  x_hotel_deposit_required: 15000,
  x_hold_expires: '2027-02-11 00:15:00',
  x_hold_expired: false,
};

test('mapSaleOrderToReservation traduce la fila real a la forma Reservation ya probada (financial-model/operational-read-model)', () => {
  const r = mapSaleOrderToReservation(REAL_ROW_SHAPE);
  assert.equal(r.external_reference, 'COT/2026/03819');
  assert.equal(r.unit, '202');
  assert.equal(r.property, 'HOTEL ATHERON SUITE');
  assert.equal(r.checkin, '2027-02-10');
  assert.equal(r.checkout, '2027-02-11');
  assert.equal(r.guests, 1);
  assert.equal(r.gross_sale, 50000);
  assert.equal(r.balance, 50000);
  assert.equal(r.channel, 'WHATSAPP');
  assert.equal(r.explicit_status, 'HOLD');
});

test('explicit_status solo se fuerza para hold -- el resto se deja sin forzar (deriveStatus calcula desde fechas reales)', () => {
  const confirmed = mapSaleOrderToReservation({ ...REAL_ROW_SHAPE, x_reservation_status: 'confirmed' });
  assert.equal(confirmed.explicit_status, undefined);
  const checkedIn = mapSaleOrderToReservation({ ...REAL_ROW_SHAPE, x_reservation_status: 'checked_in' });
  assert.equal(checkedIn.explicit_status, undefined);
});

test('canal desconocido/ausente nunca se inventa -- null, no un valor por defecto', () => {
  const r = mapSaleOrderToReservation({ ...REAL_ROW_SHAPE, x_booking_source: false });
  assert.equal(r.channel, null);
});

test('guests: 0 adultos y 0 ninos (campo no diligenciado) -- null, no 0 falso', () => {
  const r = mapSaleOrderToReservation({ ...REAL_ROW_SHAPE, x_num_adults: 0, x_num_children: 0 });
  assert.equal(r.guests, null);
});

test('fetchHotelReservations filtra por x_order_involves_room y excluye cancelled/no_show, con lista fija de campos', async () => {
  const transport = new FakeOdooTransport({ result: [REAL_ROW_SHAPE] });
  const rows = await fetchHotelReservations(transport, { database: 'db', uid: 7, technicalSecret: 'x' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].external_reference, 'COT/2026/03819');

  const call = transport.executeKwCalls[0];
  const [, , , model, method, [domain], options] = call.args;
  assert.equal(model, 'sale.order');
  assert.equal(method, 'search_read');
  assert.deepEqual(domain, HOTEL_ORDER_DOMAIN);
  assert.deepEqual(options.fields, HOTEL_ORDER_FIELDS);
  assert.ok(domain.some(([field]) => field === 'x_order_involves_room'));
});

// Forma real confirmada via search_read contra Odoo STAGING (2026-09-30,
// scripts/diagnostico-pagos-reales.mjs) -- 2 pagos reales existentes.
const REAL_PAYMENT_ROW = {
  id: 2349,
  date: '2026-09-23',
  amount: 300000,
  x_hotel_sale_order_id: [21933, 'COT/2026/03593'],
  payment_type: 'inbound',
  journal_id: [7, 'Bancolombia'],
};

test('mapAccountPaymentToCollection traduce la fila real de account.payment (Prioridad 4: COBROS HOY)', () => {
  const c = mapAccountPaymentToCollection(REAL_PAYMENT_ROW);
  assert.equal(c.collected_date, '2026-09-23');
  assert.equal(c.amount, 300000);
  assert.equal(c.external_reference, 'COT/2026/03593');
  assert.equal(c.journal, 'Bancolombia');
});

test('fetchHotelPayments filtra por reserva vinculada y state=paid (nunca cuenta un pago cancelado como cobrado)', async () => {
  const transport = new FakeOdooTransport({ result: [REAL_PAYMENT_ROW] });
  const rows = await fetchHotelPayments(transport, { database: 'db', uid: 7, technicalSecret: 'x' });
  assert.equal(rows.length, 1);

  const call = transport.executeKwCalls[0];
  const [, , , model, method, [domain], options] = call.args;
  assert.equal(model, 'account.payment');
  assert.equal(method, 'search_read');
  assert.deepEqual(domain, HOTEL_PAYMENT_DOMAIN);
  assert.deepEqual(options.fields, HOTEL_PAYMENT_FIELDS);
  assert.ok(domain.some(([field, , value]) => field === 'state' && value === 'paid'));
});
