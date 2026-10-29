/**
 * ATH-DEV-041 — Fixture SINTETICO de control. Los tres primeros registros usan los identificadores reales de los
 * casos de control (solo ids, habitacion y fechas); todo lo demas es inventado (ids 17000000x) para cubrir cada veredicto.
 * Los nombres y textos "PRIVADO" estan ahi a proposito para comprobar que NUNCA salen en el informe.
 * La pareja 160829171 / 170000099 simula la alerta de sobreventa de la 301 (la reserva real en conflicto no se conoce).
 */
const APT = { 201: 3557506, 202: 3557511, 203: 3557516, 301: 3557521, 302: 3557526, CASA: 3557501, CARRERA19: 3567496 };
const CH = { BOOKING: 7192171, DIRECT: 7208046, BLOCKED: 7192161 };
const b = (id, unit, arrival, departure, extra = {}) => ({ id, type: 'reservation', arrival, departure, apartment: { id: APT[unit], name: 'UNIDAD_PRIVADA' }, channel: { id: CH.BOOKING, name: 'Booking.com' }, 'guest-name': 'NOMBRE_PRIVADO_HUESPED', email: 'privado@example.invalid', ...extra });

export const WINDOW_ENV = { RECONCILE_FROM: '2026-10-28', RECONCILE_TO: '2027-01-05' };

export const SMOOBU_BOOKINGS = [
  b(160965781, '302', '2026-10-31', '2026-11-01', { 'reference-id': '6044417870' }),
  b(161787956, '201', '2026-11-01', '2026-11-02', { 'reference-id': '5122466816' }),
  b(160829171, '301', '2027-01-04', '2027-01-05', { 'reference-id': '5046108535' }),
  b(170000099, '301', '2027-01-04', '2027-01-05', { 'reference-id': '9999999901' }),
  b(161661036, '302', '2026-11-01', '2026-11-02', { channel: { id: CH.DIRECT, name: 'Direct booking' } }),
  b(170000001, '202', '2026-11-03', '2026-11-04', { type: 'cancellation', 'reference-id': '1000000001' }),
  b(170000002, '203', '2026-11-05', '2026-11-07', { 'reference-id': '1111111111' }),
  b(170000003, '202', '2026-11-08', '2026-11-09', { type: 'modification of booking', 'reference-id': '2222222222' }),
  b(170000004, '201', '2026-11-12', '2026-11-13', { 'reference-id': '4444444444' }),
  b(170000005, '203', '2026-11-14', '2026-11-15', { 'reference-id': '3333333333' }),
  b(170000006, 'CASA', '2026-11-20', '2026-11-21', { 'reference-id': '6666666666' }),
  b(170000007, '201', '2026-11-20', '2026-11-21', { 'reference-id': '7777777777' }),
  b(170000008, '202', '2026-11-22', '2026-11-23', { type: 'cancellation', 'reference-id': '8888888888' }),
  b(170000010, '302', '2026-11-25', '2026-11-26', { 'is-blocked-booking': true, channel: { id: CH.BLOCKED } }),
  b(170000011, 'CARRERA19', '2026-11-25', '2026-11-26'),
  b(170000012, '301', '2027-02-01', '2027-02-02'),
];

const order = (id, name, ref, checkin, checkout, units, extra = {}) => ({ id, name, state: 'sale', x_pms_reference: ref, x_booking_source: 'booking_com', x_checkin: checkin, x_checkout: checkout, x_reservation_status: 'confirmed', units, ...extra });
export const ODOO_ORDERS = [
  order(1, 'COT/T/0001', 'Smoobu 170000001 / Booking 1000000001 - NOMBRE_PRIVADO_PAGADOR', '2026-11-03', '2026-11-04', ['202']),
  order(2, 'COT/T/0002', 'Smoobu 170000002 / Booking 1111111111', '2026-11-05', '2026-11-07', ['203']),
  order(3, 'COT/T/0003', 'Booking 2222222222', '2026-11-08', '2026-11-10', ['202']),
  order(4, 'COT/T/0004', 'Smoobu 170000004', '2026-11-12', '2026-11-13', ['201']),
  order(5, 'COT/T/0005', 'Booking.com #4444444444', '2026-11-12', '2026-11-13', ['201']),
  order(6, 'COT/T/0006', 'pago 3333333333 Nequi - huesped NOMBRE_PRIVADO CC 1014198033', '2026-11-14', '2026-11-15', ['203']),
  order(7, 'COT/T/0007', false, '2026-11-01', '2026-11-02', ['302'], { x_booking_source: 'direct' }),
  order(8, 'COT/T/0008', 'Smoobu 170009999', '2026-11-28', '2026-11-29', ['203']),
  order(9, 'COT/T/0009', 'Smoobu 170000008', '2026-11-22', '2026-11-23', ['202'], { state: 'cancel' }),
];

const slot = (id, roleId, start, end, extra = {}) => ({ id, role_id: [roleId, 'ROL_PRIVADO'], start_datetime: start, end_datetime: end, state: 'published', x_bloqueo_ref: false, sale_line_id: false, ...extra });
export const ODOO_SLOTS = [
  slot(39667, 29, '2026-10-31 20:00:00', '2026-11-01 16:00:00'),
  slot(39668, 69, '2026-10-31 20:00:00', '2026-11-01 16:00:00', { x_bloqueo_ref: '39667' }),
  slot(39692, 18, '2026-11-01 20:00:00', '2026-11-02 16:00:00'),
  slot(39693, 69, '2026-11-01 20:00:00', '2026-11-02 16:00:00', { x_bloqueo_ref: '39692' }),
  slot(50002, 30, '2026-11-05 20:00:00', '2026-11-07 16:00:00'),
  slot(50003, 19, '2026-11-08 12:00:00', '2026-11-10 12:00:00'),
];
