import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_UNITS,
  BOARD_STATUSES,
  deriveCellStatusForReservation,
  buildBoardCell,
  buildDateRange,
  buildMasterBoard,
  CASA_COMPLETA_ATHERON_SUITE,
} from '../src/master-board-model.mjs';

test('BOARD_UNITS incluye exactamente las unidades confirmadas contra Odoo (Gate 009-A)', () => {
  const units = BOARD_UNITS.map((u) => u.unit);
  assert.deepEqual(units, [
    '201',
    '202',
    '203',
    '301',
    '302',
    'CASA_COMPLETA_ATHERON_SUITE',
    'CASA_COMPLETA_ALGARRA',
    'CASA_COMPLETA_NEUSA',
  ]);
});

test('CASA COMPLETA de Atheron Suite declara sus 5 habitaciones como hijas, sin inventar mas', () => {
  const casaCompleta = BOARD_UNITS.find((u) => u.unit === CASA_COMPLETA_ATHERON_SUITE);
  assert.deepEqual(casaCompleta.children, ['201', '202', '203', '301', '302']);
});

test('draft/opcion/cancelled/no_show no ocupan la celda (no bloquean el tablero)', () => {
  for (const real_status of ['draft', 'opcion', 'cancelled', 'no_show']) {
    const r = { real_status, checkin: '2026-10-01', checkout: '2026-10-02' };
    assert.equal(deriveCellStatusForReservation(r, '2026-10-01'), null);
  }
});

test('hold siempre se muestra como HOLD sin importar las fechas', () => {
  const r = { real_status: 'hold', checkin: '2026-10-01', checkout: '2026-10-02' };
  assert.equal(deriveCellStatusForReservation(r, '2026-10-01'), 'HOLD');
});

test('confirmed antes del checkin es RESERVADA, dentro de la estancia es OCUPADA', () => {
  const r = { real_status: 'confirmed', checkin: '2026-10-05', checkout: '2026-10-07' };
  assert.equal(deriveCellStatusForReservation(r, '2026-10-04'), 'RESERVADA');
  assert.equal(deriveCellStatusForReservation(r, '2026-10-05'), 'OCUPADA');
  assert.equal(deriveCellStatusForReservation(r, '2026-10-06'), 'OCUPADA');
  assert.equal(deriveCellStatusForReservation(r, '2026-10-07'), 'OCUPADA');
  assert.equal(deriveCellStatusForReservation(r, '2026-10-08'), null);
});

test('estado real desconocido nunca es optimista: BLOQUEADA', () => {
  const r = { real_status: 'algo_nuevo_no_documentado', checkin: '2026-10-01', checkout: '2026-10-02' };
  assert.equal(deriveCellStatusForReservation(r, '2026-10-01'), 'BLOQUEADA');
});

test('fechas sin verificar nunca son optimistas: BLOQUEADA', () => {
  const r = { real_status: 'confirmed', checkin: 'PENDIENTE_DE_VERIFICAR', checkout: 'PENDIENTE_DE_VERIFICAR' };
  assert.equal(deriveCellStatusForReservation(r, '2026-10-01'), 'BLOQUEADA');
});

test('buildBoardCell sin reserva y sin checkAvailability inyectado asume LIBRE (solo fixtures)', async () => {
  const cell = await buildBoardCell('201', '2026-10-01', [], undefined);
  assert.equal(cell.status, 'LIBRE');
  assert.ok(cell.icon && cell.text);
});

test('buildBoardCell sin reserva SI pregunta al motor real inyectado, nunca asume', async () => {
  const checkAvailability = async (unit, date) => {
    assert.equal(unit, 'CASA_COMPLETA_ATHERON_SUITE');
    assert.equal(date, '2026-10-01');
    return false; // bloqueada por exclusion cruzada (una habitacion hija esta en HOLD)
  };
  const cell = await buildBoardCell('CASA_COMPLETA_ATHERON_SUITE', '2026-10-01', [], checkAvailability);
  assert.equal(cell.status, 'BLOQUEADA');
});

test('buildDateRange genera el horizonte pedido (HOY/7/14/30 dias)', () => {
  assert.deepEqual(buildDateRange('2026-10-01', 'HOY'), ['2026-10-01']);
  assert.equal(buildDateRange('2026-10-01', '7_DIAS').length, 7);
  assert.equal(buildDateRange('2026-10-01', '14_DIAS')[13], '2026-10-14');
  assert.throws(() => buildDateRange('2026-10-01', 'UN_MES'));
});

test('buildMasterBoard arma filas x columnas con reservas reales y celdas libres', async () => {
  const reservations = {
    201: [{ real_status: 'confirmed', checkin: '2026-10-02', checkout: '2026-10-03' }],
  };
  const units = [
    { unit: '201', label: '201', property: 'HOTEL ATHERON SUITE' },
    { unit: '202', label: '202', property: 'HOTEL ATHERON SUITE' },
  ];
  const board = await buildMasterBoard(units, (u) => reservations[u] ?? [], buildDateRange('2026-10-01', '7_DIAS'));
  assert.equal(board.length, 2);
  const row201 = board.find((r) => r.unit === '201');
  const cellDay2 = row201.cells.find((c) => c.date === '2026-10-02');
  assert.equal(cellDay2.status, 'OCUPADA');
  const row202 = board.find((r) => r.unit === '202');
  assert.ok(row202.cells.every((c) => c.status === 'LIBRE'));
});

test('BOARD_STATUSES son exactamente los 5 pedidos por el CEO', () => {
  assert.deepEqual(BOARD_STATUSES, ['LIBRE', 'RESERVADA', 'OCUPADA', 'HOLD', 'BLOQUEADA']);
});
