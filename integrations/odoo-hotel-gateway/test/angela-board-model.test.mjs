import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOMS, CASA, KPI_ROW, KPI_GROUPS, WINDOW_NAMES, resolveWindow, isTestRecord, classifyConfirmation, isConfirmed, CRITERION_PENDING,
  realBalance, physicalRooms, roomsOnDate, buildBoard, renderKpiText, PAYMENT_CONFIRMED, PAYMENT_REPORTED,
} from '../src/angela-board-model.mjs';
import { attachConfirmedPayments } from '../src/odoo-reporting-reader.mjs';

const R = (o) => ({ external_reference: o.ref ?? 'R', guest: 'Ana', unit: '201', property: 'HOTEL ATHERON SUITE', checkin: '2026-10-10', checkout: '2026-10-12', gross_sale: 100000, collected: 0, odoo_status_raw: 'confirmed', ...o });
const ASOF = '2026-10-10';
const OK = { '*': 'status' };

// ---- ventanas ----
test('ventanas aprobadas: HOY, MAÑANA, 7 DÍAS (hoy + 6 siguientes), MES calendario', () => {
  assert.deepEqual(resolveWindow('HOY', ASOF).dates, ['2026-10-10']);
  assert.deepEqual(resolveWindow('MAÑANA', ASOF).dates, ['2026-10-11']);
  const w7 = resolveWindow('7 DÍAS', ASOF);
  assert.equal(w7.dates.length, 7); assert.equal(w7.start, '2026-10-10'); assert.equal(w7.end, '2026-10-16');
  const m = resolveWindow('MES', ASOF);
  assert.equal(m.start, '2026-10-01'); assert.equal(m.end, '2026-10-31'); assert.equal(m.dates.length, 31);
  assert.deepEqual(WINDOW_NAMES, ['HOY', 'MAÑANA', '7 DÍAS', 'MES']);
});
test('ventanas: bordes de mes y año bisiesto', () => {
  assert.equal(resolveWindow('MES', '2028-02-15').end, '2028-02-29');
  assert.equal(resolveWindow('MES', '2026-12-31').end, '2026-12-31');
  assert.equal(resolveWindow('MAÑANA', '2026-12-31').start, '2027-01-01');
  assert.equal(resolveWindow('7 DÍAS', '2026-12-29').end, '2027-01-04');
  assert.throws(() => resolveWindow('SEMANA', ASOF));
  assert.throws(() => resolveWindow('HOY', '10/10/2026'));
});

// ---- reserva confirmada ----
test('CONFIRMADA: no basta con existir ni con tener estado confirmed si el criterio comercial no esta definido', () => {
  assert.equal(classifyConfirmation(R({}), {}).state, 'PENDIENTE_CRITERIO');
  assert.equal(isConfirmed(R({}), {}), false);
  assert.equal(classifyConfirmation(R({}), { 'HOTEL ATHERON SUITE': CRITERION_PENDING }).state, 'PENDIENTE_CRITERIO');
});
test('CONFIRMADA: exclusiones aprobadas (cancelada, QA, TEST, FICTICIO, solo HOLD, consulta, no_show)', () => {
  assert.equal(isConfirmed(R({}), OK), true);
  for (const s of ['cancelled', 'hold', 'draft', 'opcion', 'no_show']) assert.equal(isConfirmed(R({ odoo_status_raw: s }), OK), false, s);
  for (const guest of ['QA-1', 'FICTICIO', 'TEST Juan']) assert.equal(isConfirmed(R({ guest }), OK), false, guest);
  assert.equal(isConfirmed(R({ odoo_status_raw: null }), OK), false);
  for (const s of ['pre_checkin', 'checked_in', 'checked_out', 'closed']) assert.equal(isConfirmed(R({ odoo_status_raw: s }), OK), true, s);
});
test('CONFIRMADA: criterio por propiedad/acuerdo (anticipo cubierto) y funcion propia', () => {
  const dep = { 'HOTEL ATHERON SUITE': 'deposit_ok' };
  assert.equal(isConfirmed(R({ deposit_ok: false }), dep), false);
  assert.equal(isConfirmed(R({ deposit_ok: true }), dep), true);
  assert.equal(isConfirmed(R({ deposit_ok: null }), dep), false);
  assert.equal(isConfirmed(R({ property: 'OTRA' }), { OTRA: () => true, '*': CRITERION_PENDING }), true);
  assert.throws(() => isConfirmed(R({}), { '*': 'inventado' }));
});
test('QA/TEST/FICTICIO se detecta por nombre, origen qa o marca explicita', () => {
  assert.equal(isTestRecord(R({ guest: 'Cliente WhatsApp' })), true);
  assert.equal(isTestRecord(R({ hold_origin: 'qa' })), true);
  assert.equal(isTestRecord(R({ is_test: true })), true);
  assert.equal(isTestRecord(R({ guest: 'Maria Lopez' })), false);
});

// ---- saldo real ----
test('SALDO_REAL: solo PAYMENT_CONFIRMED resta; PAYMENT_REPORTED no', () => {
  const r = R({ gross_sale: 200000, payments: [{ amount: 60000, status: PAYMENT_CONFIRMED }, { amount: 100000, status: PAYMENT_REPORTED }] });
  assert.deepEqual(realBalance(r), { balance: 140000, status: 'OK', reported_unconfirmed: 100000 });
  assert.equal(realBalance(R({ gross_sale: 200000, payments: [{ amount: 200000, status: PAYMENT_REPORTED }] })).balance, 200000);
  assert.equal(realBalance(R({ gross_sale: 100000, payments: [{ amount: 150000, status: PAYMENT_CONFIRMED }] })).balance, 0);
});
test('SALDO_REAL: lo que no se puede clasificar no se inventa', () => {
  assert.equal(realBalance(R({ collected: 50000 })).status, 'PENDIENTE_CLASIFICACION');
  assert.equal(realBalance(R({ collected: 50000 })).balance, null);
  assert.equal(realBalance(R({ payments: [{ amount: 5, method: 'bancolombia' }], collected: 5 })).status, 'PENDIENTE_CLASIFICACION');
  assert.deepEqual(realBalance(R({ collected: 0 })), { balance: 100000, status: 'OK' });
  assert.equal(realBalance(R({ gross_sale: null })).status, 'SIN_TOTAL');
});
test('SALDO_REAL: pagos de account.payment (paid) se vinculan como CONFIRMED; reembolso confirmado sube el saldo', () => {
  const [a, b] = attachConfirmedPayments([R({ ref: 'A', collected: 40000 }), R({ ref: 'B', collected: 0 })], [
    { external_reference: 'A', amount: 70000, payment_type: 'inbound' },
    { external_reference: 'A', amount: 10000, payment_type: 'outbound' },
  ]);
  assert.equal(realBalance(a).balance, 40000); // 100000 - (70000 - 10000)
  assert.equal(realBalance(b).balance, 100000); // lista completa y vacia: nada confirmado
});

// ---- ocupacion fisica ----
const day = (rs, blocks = [], date = ASOF, extra = {}) => roomsOnDate(date, { reservations: rs, blocks, asOf: ASOF, criteria: OK, ...extra });

test('OCUPADAS hoy es FISICA: solo checked_in; confirmada sin check-in, HOLD y consulta no ocupan', () => {
  const rs = [R({ ref: '1', unit: '201', odoo_status_raw: 'checked_in' }), R({ ref: '2', unit: '202', odoo_status_raw: 'confirmed' }), R({ ref: '3', unit: '203', odoo_status_raw: 'hold' }), R({ ref: '4', unit: '301', odoo_status_raw: 'draft' })];
  const d = day(rs);
  assert.deepEqual(d.rooms.OCUPADA, ['201']);
  assert.deepEqual(d.rooms.HOLD, ['203']);
  assert.deepEqual(d.rooms.DISPONIBLE, ['202', '301', '302']);
  assert.equal(d.mode, 'FISICA');
});
test('Casa Completa + habitaciones NO duplican: una Casa checked_in = 5 habitaciones, no 5 + 1', () => {
  const casa = R({ ref: 'C', unit: 'CASA COMPLETA', odoo_status_raw: 'checked_in' });
  assert.equal(day([casa]).rooms.OCUPADA.length, 5);
  const dup = day([casa, R({ ref: '1', unit: '201', odoo_status_raw: 'checked_in' })]);
  assert.equal(dup.rooms.OCUPADA.length, 5); // sigue siendo 5
  assert.equal(dup.conflicts.length, 1); // y el solapamiento se reporta como alerta de integridad
  assert.equal(physicalRooms(R({ unit: CASA })).length, 5);
});
test('Casa Completa de otra propiedad no cuenta en las 5 habitaciones de La Magia', () => {
  assert.deepEqual(physicalRooms(R({ unit: 'CASA COMPLETA', property: 'CASA ALGARRA' })), []);
  assert.deepEqual(physicalRooms(R({ unit: 'Casa Algarra' })), []);
});
test('QA/TEST/FICTICIO y canceladas no ocupan', () => {
  const rs = [R({ ref: '1', guest: 'QA-1', odoo_status_raw: 'checked_in' }), R({ ref: '2', unit: '202', odoo_status_raw: 'cancelled' }), R({ ref: '3', unit: '203', guest: 'TEST', odoo_status_raw: 'checked_in' })];
  assert.equal(day(rs).rooms.OCUPADA.length, 0);
});
test('noche = [checkin, checkout): el dia de salida no ocupa', () => {
  const r = R({ odoo_status_raw: 'checked_in', checkin: '2026-10-08', checkout: '2026-10-10' });
  assert.equal(day([r]).rooms.OCUPADA.length, 0);
  assert.equal(day([r], [], '2026-10-09', { asOf: '2026-10-09' }).rooms.OCUPADA.length, 1);
});
test('fechas futuras: ocupacion PROYECTADA con confirmadas que cumplen criterio; sin criterio no ocupan', () => {
  const r = R({ checkin: '2026-10-11', checkout: '2026-10-13' });
  assert.equal(day([r], [], '2026-10-11').mode, 'PROYECTADA');
  assert.deepEqual(day([r], [], '2026-10-11').rooms.OCUPADA, ['201']);
  assert.equal(day([r], [], '2026-10-11', { criteria: {} }).rooms.OCUPADA.length, 0);
});
test('HOLD vencido no bloquea; bloqueo manual si; derived no se cuenta aparte', () => {
  const vivo = R({ ref: 'h1', unit: '201', odoo_status_raw: 'hold', hold_expired: false });
  const muerto = R({ ref: 'h2', unit: '202', odoo_status_raw: 'hold', hold_expired: true });
  const blocks = [{ unit: '203', kind: 'manual', start: '2026-10-09 20:00:00', end: '2026-10-11 16:00:00' }, { unit: '301', kind: 'derived', start: '2026-10-09 20:00:00', end: '2026-10-11 16:00:00' }];
  const d = day([vivo, muerto], blocks);
  assert.deepEqual(d.rooms.HOLD, ['201']);
  assert.deepEqual(d.rooms.BLOQUEADA, ['203']);
  assert.ok(d.rooms.DISPONIBLE.includes('202') && d.rooms.DISPONIBLE.includes('301'));
});
test('bloques external de OTA: por defecto categoria propia (no ocupada ni bloqueada); politicas explicitas', () => {
  const ext = [{ id: 7, unit: '302', kind: 'external', start: '2026-10-09 20:00:00', end: '2026-10-12 16:00:00' }];
  assert.deepEqual(day([], ext).rooms.OTA_EXTERNO, ['302']);
  assert.deepEqual(day([], ext, ASOF, { externalPolicy: 'AS_OCCUPIED' }).rooms.OCUPADA, ['302']);
  assert.deepEqual(day([], ext, ASOF, { externalPolicy: 'AS_BLOCKED' }).rooms.BLOQUEADA, ['302']);
});
test('particion: cada habitacion cae en exactamente una categoria (suma = 5)', () => {
  const rs = [R({ unit: '201', odoo_status_raw: 'checked_in' }), R({ ref: '2', unit: '202', odoo_status_raw: 'hold', hold_expired: false })];
  const d = day(rs, [{ unit: '203', kind: 'manual', start: '2026-10-10', end: '2026-10-11' }, { id: 1, unit: '301', kind: 'external', start: '2026-10-10', end: '2026-10-11' }]);
  assert.equal(Object.values(d.rooms).flat().length, 5);
  assert.deepEqual(new Set(Object.values(d.rooms).flat()), new Set(ROOMS));
});

// ---- tablero ----
const SAMPLE = [
  R({ ref: 'in', unit: '201', odoo_status_raw: 'checked_in', checkin: '2026-10-09', checkout: '2026-10-11', gross_sale: 100000, collected: 0 }),
  R({ ref: 'arr', unit: '202', odoo_status_raw: 'confirmed', checkin: '2026-10-10', checkout: '2026-10-12', gross_sale: 200000, payments: [{ amount: 50000, status: PAYMENT_CONFIRMED }] }),
  R({ ref: 'out', unit: '203', odoo_status_raw: 'checked_out', checkin: '2026-10-08', checkout: '2026-10-10', gross_sale: 80000, payments: [{ amount: 80000, status: PAYMENT_CONFIRMED }] }),
  R({ ref: 'hold', unit: '301', odoo_status_raw: 'hold', hold_expired: false, gross_sale: 90000 }),
  R({ ref: 'qa', unit: '302', guest: 'QA-9', odoo_status_raw: 'checked_in' }),
  R({ ref: 'can', unit: '302', odoo_status_raw: 'cancelled' }),
];
test('fila KPI: orden aprobado y separacion visual', () => {
  assert.deepEqual(KPI_ROW.map((k) => k.key), ['DISPONIBLES', 'OCUPADAS', 'HOLD', 'BLOQUEADAS', 'LLEGADAS', 'SALIDAS', 'CONFIRMADAS', 'SALDO_PENDIENTE']);
  assert.deepEqual(KPI_GROUPS.OPERACION_COMERCIAL, ['DISPONIBLES', 'OCUPADAS', 'LLEGADAS', 'SALIDAS', 'CONFIRMADAS']);
  assert.deepEqual(KPI_GROUPS.INVENTARIO_NO_VENDIBLE, ['HOLD', 'BLOQUEADAS']);
  assert.deepEqual(KPI_GROUPS.FINANCIERO, ['SALDO_PENDIENTE']);
  const b = buildBoard(SAMPLE, { asOf: ASOF, window: 'HOY', criteria: OK });
  assert.deepEqual(b.kpi_row.map((k) => k.key), KPI_ROW.map((k) => k.key));
  assert.deepEqual(b.groups.INVENTARIO_NO_VENDIBLE.map((k) => k.key), ['HOLD', 'BLOQUEADAS']);
  assert.deepEqual(b.groups.FINANCIERO.map((k) => k.key), ['SALDO_PENDIENTE']);
});
test('tablero HOY: cifras de la muestra (verificadas a mano)', () => {
  const b = buildBoard(SAMPLE, { asOf: ASOF, window: 'HOY', criteria: OK });
  const v = Object.fromEntries(b.kpi_row.map((k) => [k.key, k.value]));
  assert.equal(v.OCUPADAS, 1); // solo la checked_in; la que llega hoy aun no hizo check-in
  assert.equal(v.HOLD, 1);
  assert.equal(v.BLOQUEADAS, 0);
  assert.equal(v.DISPONIBLES, 3); // 202, 203, 302 (QA y cancelada no cuentan)
  assert.equal(v.LLEGADAS, 1); // 'arr'
  assert.equal(v.SALIDAS, 1); // 'out' (checkout hoy, ya salio)
  assert.equal(v.CONFIRMADAS, 3); // in, arr, out -- no el HOLD, ni QA, ni cancelada
  assert.equal(v.SALDO_PENDIENTE, 250000); // 100000 (sin pagos) + 150000 (200000-50000) + 0
  assert.equal(v.OCUPADAS + v.HOLD + v.BLOQUEADAS + v.DISPONIBLES, ROOMS.length);
  assert.equal(b.partition_ok, true);
});
test('tablero: rotulos LLEGADAS HOY / SALIDAS HOY solo en la ventana HOY', () => {
  const hoy = buildBoard(SAMPLE, { asOf: ASOF, window: 'HOY', criteria: OK });
  assert.deepEqual(hoy.kpi_row.filter((k) => /LLEGADAS|SALIDAS/.test(k.label)).map((k) => k.label), ['LLEGADAS HOY', 'SALIDAS HOY']);
  const sem = buildBoard(SAMPLE, { asOf: ASOF, window: '7 DÍAS', criteria: OK });
  assert.deepEqual(sem.kpi_row.filter((k) => /LLEGADAS|SALIDAS/.test(k.label)).map((k) => k.label), ['LLEGADAS', 'SALIDAS']);
  assert.equal(sem.total_capacidad, 35);
  assert.equal(sem.kpi_row[0].unit, 'noches-habitación');
});
test('tablero MES: no revienta, particion consistente en todas las noches', () => {
  const b = buildBoard(SAMPLE, { asOf: ASOF, window: 'MES', criteria: OK });
  assert.equal(b.total_capacidad, 155);
  assert.equal(b.partition_ok, true);
  const v = Object.fromEntries(b.kpi_row.map((k) => [k.key, k.value]));
  assert.equal(v.OCUPADAS + v.HOLD + v.BLOQUEADAS + v.DISPONIBLES + b.pendientes.ota_externo.value, 155);
});
test('sin criterio comercial definido: no se cuentan confirmadas ni ocupacion proyectada, y se avisa', () => {
  const b = buildBoard(SAMPLE, { asOf: ASOF, window: 'HOY', criteria: {} });
  const v = Object.fromEntries(b.kpi_row.map((k) => [k.key, k.value]));
  assert.equal(v.CONFIRMADAS, 0);
  assert.equal(b.pendientes.confirmadas_sin_criterio_comercial, 3);
  assert.equal(v.OCUPADAS, 1); // checked_in es hecho fisico, no depende del criterio
});
test('saldo sin clasificar se avisa y NO se suma', () => {
  const rs = [R({ ref: 'x', odoo_status_raw: 'confirmed', gross_sale: 100000, collected: 30000 })];
  const b = buildBoard(rs, { asOf: ASOF, window: 'HOY', criteria: OK });
  const s = b.kpi_row.find((k) => k.key === 'SALDO_PENDIENTE');
  assert.equal(s.value, 0); assert.equal(s.sin_clasificar, 1);
  assert.match(renderKpiText(b), /\+1 sin clasificar/);
});
test('QA/TEST/FICTICIO no entran en ningun KPI', () => {
  const rs = SAMPLE.map((r) => ({ ...r, guest: 'TEST ' + r.guest }));
  const b = buildBoard(rs, { asOf: ASOF, window: 'HOY', criteria: OK });
  const v = Object.fromEntries(b.kpi_row.map((k) => [k.key, k.value]));
  assert.equal(v.DISPONIBLES, 5); assert.equal(v.OCUPADAS + v.HOLD + v.LLEGADAS + v.SALIDAS + v.CONFIRMADAS + v.SALDO_PENDIENTE, 0);
});
test('Casa Completa checked_in mas habitaciones no duplican OCUPADAS en el tablero', () => {
  const rs = [R({ ref: 'C', unit: 'CASA COMPLETA', odoo_status_raw: 'checked_in' }), R({ ref: '1', unit: '201', odoo_status_raw: 'checked_in' })];
  const b = buildBoard(rs, { asOf: ASOF, window: 'HOY', criteria: OK });
  assert.equal(b.kpi_row.find((k) => k.key === 'OCUPADAS').value, 5);
  assert.equal(b.conflictos_de_ocupacion.length, 1);
});
test('payload KPI de R7 coincide con KPI_ROW (fuente unica)', () => {
  const j = JSON.parse(readFileSync(new URL('../recovery/payloads/kpi-row.json', import.meta.url), 'utf8'));
  assert.deepEqual(j.kpi_row, KPI_ROW);
  assert.deepEqual(j.windows, WINDOW_NAMES);
  assert.deepEqual(j.groups, KPI_GROUPS);
});
