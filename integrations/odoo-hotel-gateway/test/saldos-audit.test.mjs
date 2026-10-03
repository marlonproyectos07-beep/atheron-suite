import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSaldos, CANDIDATES, SALDOS_AUDIT_FIELDS } from '../src/saldos-audit.mjs';

const hotel = (status, total, paid, over = {}) => ({
  id: Math.random(),
  state: 'sale',
  invoice_status: 'no',
  amount_total: total,
  x_order_involves_room: true,
  x_reservation_status: status,
  x_hotel_paid: paid,
  x_hotel_balance: Math.max(total - paid, 0),
  ...over,
});
const other = (total, over = {}) => ({ id: Math.random(), state: 'sale', invoice_status: 'to invoice', amount_total: total, x_order_involves_room: false, x_reservation_status: false, x_hotel_paid: 0, x_hotel_balance: 0, ...over });

const rows = [
  hotel('confirmed', 100000, 30000),
  hotel('checked_out', 80000, 0),
  hotel('hold', 500000, 0),
  hotel('opcion', 300000, 0),
  hotel('cancelled', 90000, 0),
  hotel('closed', 50000, 50000),
  other(1000000),
  other(2500000),
];

test('audit: cada candidata calcula count/amount propios y la definicion V2 (C) excluye pipeline y canceladas', () => {
  const a = auditSaldos(rows);
  const by = Object.fromEntries(a.candidates.map((c) => [c.id, c]));
  assert.deepEqual([by.C_hotel_vendidas_balance.count, by.C_hotel_vendidas_balance.amount], [2, 150000]);
  assert.deepEqual([by.A_hotel_no_canceladas_balance.count, by.A_hotel_no_canceladas_balance.amount], [4, 950000]);
  assert.deepEqual([by.D_hotel_con_canceladas_balance.count, by.D_hotel_con_canceladas_balance.amount], [5, 1040000]);
  assert.deepEqual([by.E_hotel_pipeline_balance.count, by.E_hotel_pipeline_balance.amount], [2, 800000]);
  assert.deepEqual([by.F_hotel_terminadas_balance.count, by.F_hotel_terminadas_balance.amount], [1, 80000]);
  assert.equal(a.hotel_rows, 6);
  assert.equal(a.non_hotel_rows, 2);
  assert.equal(a.hotel_by_status.hold.balance, 500000);
});

test('audit: identifica el origen cuando una definicion reproduce el numero del tablero (mezcla con otras lineas)', () => {
  const target = { count: 8 - 0, amount: 100000 + 80000 + 500000 + 300000 + 90000 + 1000000 + 2500000 - 0 };
  // todo sale.order activo (state sale/draft/sent) con total > 0 = 8 filas; suma de amount_total
  const all = rows.reduce((a, r) => a + r.amount_total, 0);
  const a = auditSaldos(rows, { count: 8, amount: all });
  assert.match(a.verdict, /ORIGEN_DEMOSTRADO/);
  assert.ok(a.candidates.find((c) => c.id === 'I_todo_sale_order_activo').reproduces_target);
  assert.ok(target.count === 8);
});

test('audit: si nada reproduce el numero lo dice (no inventa un origen)', () => {
  const a = auditSaldos(rows, { count: 357, amount: 37202549 });
  assert.match(a.verdict, /ORIGEN_NO_REPRODUCIDO/);
  assert.ok(a.candidates.every((c) => c.reproduces_target === false));
});

test('audit: sin objetivo no afirma nada', () => {
  assert.match(auditSaldos(rows).verdict, /SIN_OBJETIVO/);
});

test('audit: detecta desajuste entre x_hotel_balance y total - cobrado', () => {
  const bad = [hotel('confirmed', 100000, 20000, { x_hotel_balance: 10000 })];
  assert.equal(auditSaldos(bad).balance_vs_total_minus_paid_mismatches, 1);
});

test('audit: solo pide campos de agregacion (sin nombre, telefono ni partner)', () => {
  assert.ok(!SALDOS_AUDIT_FIELDS.some((f) => /nombre|telf|partner|phone|email/i.test(f)));
  assert.equal(CANDIDATES.length, 9);
});
