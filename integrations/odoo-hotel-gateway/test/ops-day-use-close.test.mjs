import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBeds24Booking } from '../src/ops/beds24-readonly.mjs';
import { consolidateStays } from '../src/ops/master-stay.mjs';
import { buildOps } from '../src/ops/ops-board.mjs';
import { dailyCloseStaging, JOURNAL_EFECTIVO, salesOn } from '../src/ops/daily-close.mjs';
import { renderDashboardHtml } from '../src/ops/render-html.mjs';
import { rawMedico, registryMedico, STAY } from './fixtures/ops-medico.mjs';

const ROOM_302 = 740220;
/** Walk-in, hab. 302, uso temporal 11/10/2026, COP 100.000, pago confirmado en efectivo. Datos sintéticos de prueba. */
const walkIn = (over = {}) => ({ id: 950001, roomId: ROOM_302, status: 'confirmed', arrival: '2026-10-11', departure: '2026-10-11', firstName: 'Walk-in', lastName: 'Sin reserva', price: 100000, notes: 'DAY_USE walk-in',
  invoiceItems: [{ id: 1, type: 'charge', description: 'uso temporal', qty: 1, amount: 100000 }, { id: 2, type: 'payment', amount: 100000 }], ...over });
const ledgerCash = (over = {}) => [{ id: 'ODOO-PAY-WALKIN', bookingId: '950001', amount: 100000, beds24PaymentId: '950001:2', method: 'cash', journal: JOURNAL_EFECTIVO, date: '2026-10-11', ...over }];
const norm = (rows) => rows.map((r) => normalizeBeds24Booking(r));

test('DAY_USE: se detecta por salida==llegada o por etiqueta, y es una estadía de 0 noches', () => {
  assert.equal(normalizeBeds24Booking(walkIn()).dayUse, true);
  assert.equal(normalizeBeds24Booking(walkIn({ departure: '2026-10-12', notes: 'USO TEMPORAL tarde' })).dayUse, true);
  assert.equal(normalizeBeds24Booking({ ...walkIn(), departure: '2026-10-12', notes: '' }).dayUse, false);
  const { stays } = consolidateStays({ bookings: norm([walkIn()]), asOf: '2026-10-11' });
  assert.equal(stays[0].day_use, true);
  assert.equal(stays[0].total_nights, 0);
  assert.equal(stays[0].segments[0].checkout, '2026-10-11');
});

test('DAY_USE en la grilla: estado propio, no es OCUPADA ni llegada/salida/confirmada, el saldo sí cuenta', () => {
  const o = buildOps({ bookings: norm([walkIn()]), asOf: '2026-10-11' });
  const c = o.grid.find((g) => g.room === '302').cells[0];
  assert.deepEqual(c.states, ['DAY_USE']);
  assert.equal(c.primary, 'DAY_USE');
  assert.equal(c.bucket, 'DISPONIBLE');
  const v = (k) => o.windows.HOY.kpi_row.find((x) => x.key === k).value;
  assert.deepEqual([v('OCUPADAS'), v('LLEGADAS'), v('SALIDAS'), v('CONFIRMADAS')], [0, 0, 0, 0]);
  assert.equal(v('SALDO_PENDIENTE'), 100000);
  assert.equal(o.answers.uso_temporal_hoy.length, 1);
  assert.match(renderDashboardHtml(o), /DAY_USE|DAYU/);
});

test('DAY_USE choca con una estadía que pernocta esa noche en la misma habitación', () => {
  const stay = { id: 950002, roomId: ROOM_302, status: 'confirmed', arrival: '2026-10-10', departure: '2026-10-12', firstName: 'Huésped', lastName: 'Noche', price: 1 };
  const o = buildOps({ bookings: norm([stay, walkIn()]), asOf: '2026-10-11' });
  assert.equal(o.answers.sobreventas[0]?.reason, 'DAY_USE_CHOCA_CON_ESTADIA');
});

test('DAY_USE no rompe el médico: 302 libre el 11 oct y el caso del médico intacto', () => {
  const o = buildOps({ bookings: norm([...rawMedico(), walkIn()]), registry: registryMedico(), asOf: '2026-10-11' });
  assert.equal(o.stays.find((s) => s.stay_id === STAY).total_sale, 1155000);
  assert.equal(o.windows.HOY.kpi_row.find((x) => x.key === 'OCUPADAS').value, 1); // solo el 203 del médico
});

test('cierre del walk-in: venta 100.000, caja 100.000 (confirmado, efectivo, Efectivo_Atheron_Suite), saldo 0', () => {
  const { stays } = consolidateStays({ bookings: norm([walkIn()]), confirmedPayments: ledgerCash(), asOf: '2026-10-11' });
  const c = dailyCloseStaging({ stays, date: '2026-10-11' });
  assert.equal(c.ventas_del_dia, 100000);
  assert.equal(c.dinero_recibido, 100000);
  assert.deepEqual([c.caja.entradas, c.caja.neto, c.caja.diario], [100000, 100000, 'Efectivo_Atheron_Suite']);
  assert.equal(c.banco.entradas, 0);
  assert.equal(c.saldos_huesped.total, 0);
  assert.equal(c.reportado_sin_confirmar.total, 0);
  assert.deepEqual(c.advertencias, []);
  assert.equal(c.diferencia_vs_odoo, 'SIN_DATOS_ODOO');
});

test('PAYMENT_REPORTED no es dinero recibido ni baja el saldo', () => {
  const { stays } = consolidateStays({ bookings: norm([walkIn()]), asOf: '2026-10-11' }); // sin libro Odoo: solo reportado
  const c = dailyCloseStaging({ stays, date: '2026-10-11' });
  assert.equal(c.dinero_recibido, 0);
  assert.equal(c.caja.entradas, 0);
  assert.equal(c.saldos_huesped.total, 100000);
  assert.equal(c.reportado_sin_confirmar.total, 100000);
});

test('efectivo en otro diario, pago sin medio y diferencia contra Odoo se reportan', () => {
  let { stays } = consolidateStays({ bookings: norm([walkIn()]), confirmedPayments: ledgerCash({ journal: 'Otro' }), asOf: '2026-10-11' });
  assert.equal(dailyCloseStaging({ stays, date: '2026-10-11' }).advertencias[0].code, 'EFECTIVO_FUERA_DEL_DIARIO');
  ({ stays } = consolidateStays({ bookings: norm([walkIn()]), confirmedPayments: ledgerCash({ method: undefined }), asOf: '2026-10-11' }));
  assert.equal(dailyCloseStaging({ stays, date: '2026-10-11' }).advertencias[0].code, 'PAGO_SIN_MEDIO');
  ({ stays } = consolidateStays({ bookings: norm([walkIn()]), confirmedPayments: ledgerCash(), asOf: '2026-10-11' }));
  const ok = dailyCloseStaging({ stays, date: '2026-10-11', odoo: { sales: 100000, received: 100000, cash: 100000, bank: 0, expenses: 0 } });
  assert.equal(ok.cuadra, true);
  const off = dailyCloseStaging({ stays, date: '2026-10-11', odoo: { sales: 100000, received: 90000, cash: 90000, bank: 0, expenses: 0 } });
  assert.equal(off.diferencia_vs_odoo.recibido, 10000);
  assert.equal(off.cuadra, false);
});

test('Booking/Airbnb por cobrar, egresos, banco y reconocimiento por noche (médico: 1.155.000 una vez)', () => {
  const ota = [
    { id: 960001, roomId: 740215, status: 'confirmed', channel: 'booking', arrival: '2026-10-11', departure: '2026-10-13', firstName: 'Ana', lastName: 'B', price: 300000 },
    { id: 960002, roomId: 740217, status: 'confirmed', channel: 'airbnb', arrival: '2026-10-11', departure: '2026-10-12', firstName: 'Luis', lastName: 'A', price: 200000,
      invoiceItems: [{ id: 5, type: 'charge', qty: 1, amount: 200000 }, { id: 6, type: 'payment', amount: 80000 }] },
  ];
  const ledger = [...ledgerCash(), { id: 'PAY-AIRBNB', bookingId: '960002', amount: 80000, beds24PaymentId: '960002:6', method: 'ota_payout', journal: 'Banco', date: '2026-10-11' }];
  const { stays } = consolidateStays({ bookings: norm([walkIn(), ...ota, ...rawMedico()]), registry: registryMedico(), confirmedPayments: ledger, asOf: '2026-10-11' });
  const exp = [{ id: 'E1', date: '2026-10-11', amount: 30000, method: 'cash', status: 'PAYMENT_CONFIRMED', concept: 'aseo' }, { id: 'E2', date: '2026-10-11', amount: 5000, method: 'cash', status: 'PAYMENT_REPORTED' }];
  const c = dailyCloseStaging({ stays, date: '2026-10-11', expenses: exp });
  assert.equal(c.ventas_del_dia, 100000 + 150000 + 200000 + 55000); // walk-in + Booking/2 + Airbnb + médico 1.155.000/21
  assert.equal(c.booking_por_cobrar, 300000);
  assert.equal(c.airbnb_por_cobrar, 120000);
  assert.equal(c.banco.entradas, 80000);
  assert.equal(c.caja.neto, 100000 - 30000);
  assert.equal(c.egresos, 30000);
  assert.equal(c.egresos_sin_confirmar, 5000);
  assert.equal(c.saldos_huesped.detalle.find((g) => g.stay_id === STAY).balance, 1155000);
  // suma de las 21 noches del médico = venta total, una sola vez
  const medico = stays.find((s) => s.stay_id === STAY);
  const total = Array.from({ length: 22 }, (_, i) => salesOn(medico, new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10))).reduce((a, b) => a + b, 0);
  assert.equal(total, 1155000);
  assert.equal(salesOn(medico, '2026-10-11', 'CHECKIN'), 1155000);
});
