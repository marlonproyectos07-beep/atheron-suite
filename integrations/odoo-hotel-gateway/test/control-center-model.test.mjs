import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildControlCenter,
  computeUnitStates,
  buildUnitCatalog,
  resolveUnitKey,
  resolveHorizon,
  nightsInRange,
  normalizeReservation,
  normalizeHousekeepingStage,
  computeFloorRate,
  detectInventoryConflicts,
  odooDomainsFor,
  KPI_DEFINITIONS,
  INVENTORY_STATES,
  SOLD_STATUSES,
} from '../src/control-center-model.mjs';
import { mapSaleOrderToReservation, fetchAllHotelReservations } from '../src/odoo-reporting-reader.mjs';
import { FakeOdooTransport } from './fakes/odoo-transport.fake.mjs';

const TODAY = '2026-10-03'; // sabado
const catalog = buildUnitCatalog();

let seq = 0;
function res(over = {}) {
  seq += 1;
  return {
    external_reference: `COT/T/${seq}`,
    guest: 'Huesped Prueba',
    phone: '3001234567',
    channel: 'DIRECTO',
    unit: '201',
    property: 'HOTEL ATHERON SUITE',
    reservation_date: '2026-09-20',
    checkin: TODAY,
    checkout: '2026-10-05',
    guests: 2,
    gross_sale: 200000,
    collected: 0,
    balance: undefined,
    real_status: 'confirmed',
    hold_expired: false,
    ...over,
  };
}
const cc = (reservations, extra = {}) => buildControlCenter({ reservations, referenceDate: TODAY, ...extra });
const card = (out, unit) => out.units.find((u) => u.unit === unit);

// ---------------------------------------------------------------- fechas / horizonte
test('resolveHorizon: HOY, MANANA, 7_DIAS, MES_ACTUAL y RANGO', () => {
  assert.deepEqual(resolveHorizon(TODAY, 'HOY'), { preset: 'HOY', from: TODAY, to: TODAY, days: 1 });
  assert.equal(resolveHorizon(TODAY, 'MANANA').from, '2026-10-04');
  const w = resolveHorizon(TODAY, '7_DIAS');
  assert.equal(w.to, '2026-10-09');
  assert.equal(w.days, 7);
  const m = resolveHorizon(TODAY, 'MES_ACTUAL');
  assert.deepEqual([m.from, m.to, m.days], ['2026-10-01', '2026-10-31', 31]);
  assert.equal(resolveHorizon('2026-02-10', 'MES_ACTUAL').to, '2026-02-28');
  assert.equal(resolveHorizon(TODAY, 'RANGO', { from: '2026-10-05', to: '2026-10-07' }).days, 3);
});

test('resolveHorizon: rango invalido falla cerrado', () => {
  assert.throws(() => resolveHorizon(TODAY, 'RANGO', { from: '2026-10-07', to: '2026-10-05' }), /INVALID_RANGE/);
  assert.throws(() => resolveHorizon(TODAY, 'RANGO', { from: 'x', to: 'y' }), /INVALID_RANGE/);
  assert.throws(() => resolveHorizon(TODAY, 'RANGO', { from: '2025-01-01', to: '2026-10-05' }), /maximo 366/);
  assert.throws(() => resolveHorizon(TODAY, 'ANUAL'), /UNKNOWN_HORIZON_PRESET/);
  assert.throws(() => resolveHorizon('03/10/2026', 'HOY'), /INVALID_REFERENCE_DATE/);
});

test('nightsInRange: el dia de check-out no es noche; recorta al periodo', () => {
  const r = normalizeReservation(res({ checkin: '2026-10-02', checkout: '2026-10-05' }), catalog);
  assert.equal(nightsInRange(r, '2026-10-01', '2026-10-31'), 3);
  assert.equal(nightsInRange(r, TODAY, TODAY), 1);
  assert.equal(nightsInRange(r, '2026-10-05', '2026-10-05'), 0);
  assert.equal(nightsInRange(r, '2026-10-04', '2026-10-09'), 1);
});

// ---------------------------------------------------------------- resolucion de unidades
test('resolveUnitKey: CASA COMPLETA se resuelve por propiedad, sin adivinar', () => {
  assert.equal(resolveUnitKey('CASA COMPLETA', 'HOTEL ATHERON SUITE', catalog), 'CASA_COMPLETA_ATHERON_SUITE');
  assert.equal(resolveUnitKey('CASA COMPLETA', 'CASA ALGARRA', catalog), 'CASA_COMPLETA_ALGARRA');
  assert.equal(resolveUnitKey('CASA COMPLETA', 'CASA NEUSA', catalog), 'CASA_COMPLETA_NEUSA');
  assert.equal(resolveUnitKey('CASA_COMPLETA', null, catalog), 'CASA_COMPLETA_ATHERON_SUITE'); // fixtures del piloto
  assert.equal(resolveUnitKey('Hotel Atheron Suite - 301', null, catalog), '301');
  assert.equal(resolveUnitKey('401', null, catalog), null);
  assert.equal(resolveUnitKey('', null, catalog), null);
  assert.equal(resolveUnitKey(null, null, catalog), null);
});

// ---------------------------------------------------------------- estados de inventario
test('estados: OCUPADO solo si checked_in; confirmed sin check-in es RESERVADO (reserva != ocupacion)', () => {
  const rs = [
    normalizeReservation(res({ unit: '201', real_status: 'checked_in', checkin: '2026-10-01' }), catalog),
    normalizeReservation(res({ unit: '202', real_status: 'confirmed' }), catalog),
  ];
  const st = computeUnitStates(rs, catalog, TODAY);
  assert.equal(st.get('201').state, 'OCUPADO');
  assert.equal(st.get('202').state, 'RESERVADO');
  assert.equal(st.get('203').state, 'DISPONIBLE');
});

test('estados: HOLD vigente es HOLD (no vendido); HOLD vencido, opcion y consulta no bloquean', () => {
  const rs = [
    normalizeReservation(res({ unit: '201', real_status: 'hold' }), catalog),
    normalizeReservation(res({ unit: '202', real_status: 'hold', hold_expired: true }), catalog),
    normalizeReservation(res({ unit: '203', real_status: 'opcion' }), catalog),
    normalizeReservation(res({ unit: '301', real_status: 'draft' }), catalog),
  ];
  const st = computeUnitStates(rs, catalog, TODAY);
  assert.equal(st.get('201').state, 'HOLD');
  for (const u of ['202', '203', '301']) assert.equal(st.get(u).state, 'DISPONIBLE', u);
});

test('estados: dia de check-out ya no ocupa la noche (checked_out y salida de hoy)', () => {
  const rs = [normalizeReservation(res({ unit: '201', real_status: 'checked_out', checkin: '2026-10-01', checkout: TODAY }), catalog)];
  assert.equal(computeUnitStates(rs, catalog, TODAY).get('201').state, 'DISPONIBLE');
});

test('estados: checked_in con salida vencida sigue OCUPADO hoy (y genera alerta)', () => {
  const out = cc([res({ unit: '201', real_status: 'checked_in', checkin: '2026-09-28', checkout: '2026-10-01' })]);
  assert.equal(card(out, '201').state, 'OCUPADO');
  assert.ok(out.alerts.some((a) => a.code === 'CHECKOUT_VENCIDO'));
});

test('estado desconocido con fechas = BLOQUEADO (revision), nunca disponible ni ocupado', () => {
  const out = cc([res({ unit: '202', real_status: 'algo_nuevo' })]);
  assert.equal(card(out, '202').state, 'BLOQUEADO');
  assert.equal(out.inventory.ocupadas, 0);
  assert.ok(out.alerts.some((a) => a.code === 'RESERVA_INCOMPLETA' && /no catalogado/.test(a.message)));
});

test('fuera de servicio solo existe si se inyecta la fuente y sale del denominador', () => {
  const out = cc([], { outOfService: ['203'] });
  assert.equal(card(out, '203').state, 'FUERA_DE_SERVICIO');
  assert.equal(out.inventory.fuera_de_servicio, 1);
  assert.equal(out.inventory.vendibles, out.inventory.unidades_fisicas - 1);
  assert.equal(cc([]).inventory.fuera_de_servicio, 0);
});

test('INVENTORY_STATES contiene los 8 estados pedidos', () => {
  assert.deepEqual([...INVENTORY_STATES], ['DISPONIBLE', 'RESERVADO', 'OCUPADO', 'HOLD', 'BLOQUEADO', 'ASEO_PENDIENTE', 'LISTO', 'FUERA_DE_SERVICIO']);
});

// ---------------------------------------------------------------- CASA COMPLETA <-> habitaciones
test('CASA COMPLETA vendida: sus 5 habitaciones heredan el estado (via CASA_COMPLETA) y no se cuenta doble', () => {
  const out = cc([res({ unit: 'CASA COMPLETA', real_status: 'checked_in', checkin: '2026-10-02', guests: 15, gross_sale: 700000 })]);
  for (const u of ['201', '202', '203', '301', '302']) {
    assert.equal(card(out, u).state, 'OCUPADO', u);
    assert.equal(card(out, u).via, 'CASA_COMPLETA');
  }
  assert.equal(card(out, 'CASA_COMPLETA_ATHERON_SUITE').state, 'OCUPADO');
  assert.equal(out.inventory.ocupadas, 5);
  assert.equal(out.inventory.unidades_fisicas, 7); // 5 habitaciones + Algarra + Neusa; la compuesta no suma
  assert.equal(out.occupancy.rooms.pct, Math.round((5 / 7) * 1000) / 10);
  // personas: 15 sobre capacidad de la casa completa (22), no sobre 20 ni 42
  const atheron = out.occupancy.pax.by_property.find((p) => p.property === 'HOTEL ATHERON SUITE');
  assert.equal(atheron.personas, 15);
  assert.equal(atheron.capacidad_vendible, 22);
});

test('una habitacion tomada bloquea la CASA COMPLETA (BLOQUEADO por habitacion, no ocupada)', () => {
  const out = cc([res({ unit: '203', real_status: 'checked_in', checkin: '2026-10-02' })]);
  const casa = card(out, 'CASA_COMPLETA_ATHERON_SUITE');
  assert.equal(casa.state, 'BLOQUEADO');
  assert.equal(casa.via, 'HABITACION');
  assert.equal(casa.blocked_by_state, 'OCUPADO');
  assert.equal(out.inventory.ocupadas, 1); // la casa bloqueada no infla la ocupacion
});

test('una habitacion con HOLD tambien bloquea la CASA COMPLETA, y solo esa', () => {
  const out = cc([res({ unit: '301', real_status: 'hold' })]);
  assert.equal(card(out, 'CASA_COMPLETA_ATHERON_SUITE').state, 'BLOQUEADO');
  assert.equal(card(out, '302').state, 'DISPONIBLE');
});

test('conflicto de inventario: CASA COMPLETA y habitacion vendidas la misma noche', () => {
  const rs = [
    normalizeReservation(res({ unit: 'CASA COMPLETA' }), catalog),
    normalizeReservation(res({ unit: '202' }), catalog),
  ];
  const conflicts = detectInventoryConflicts(rs, catalog, [TODAY], TODAY);
  assert.ok(conflicts.some((c) => c.unit === '202'));
  const out = cc([res({ unit: 'CASA COMPLETA' }), res({ unit: '202' })]);
  assert.ok(out.alerts.some((a) => a.code === 'CONFLICTO_INVENTARIO' && a.severity === 'ALTA'));
});

test('sin conflicto cuando las estancias son consecutivas (checkout = checkin)', () => {
  const rs = [
    normalizeReservation(res({ unit: '201', checkin: '2026-10-01', checkout: TODAY }), catalog),
    normalizeReservation(res({ unit: '201', checkin: TODAY, checkout: '2026-10-05' }), catalog),
  ];
  assert.deepEqual(detectInventoryConflicts(rs, catalog, ['2026-10-01', '2026-10-02', TODAY, '2026-10-04'], TODAY), []);
});

// ---------------------------------------------------------------- ocupacion
test('ocupacion por unidades: ocupadas / vendibles x 100 (bloqueado y hold no cuentan)', () => {
  const out = cc([
    res({ unit: '201', real_status: 'checked_in', checkin: '2026-10-02', guests: 2 }),
    res({ unit: '202', real_status: 'checked_in', checkin: '2026-10-02', guests: 3 }),
    res({ unit: '203', real_status: 'hold' }),
    res({ unit: '301', real_status: 'confirmed' }),
  ]);
  assert.equal(out.occupancy.rooms.ocupadas, 2);
  assert.equal(out.occupancy.rooms.vendibles, 7);
  assert.equal(out.occupancy.rooms.pct, 28.6);
  assert.equal(out.occupancy.rooms.vendida_pct, 42.9); // + 1 reservada; el HOLD no suma
  assert.equal(out.inventory.hold, 1);
});

test('ocupacion por personas: personas alojadas / capacidad vendible (Atheron = 2+4+4+7+3 = 20)', () => {
  const out = cc([
    res({ unit: '201', real_status: 'checked_in', checkin: '2026-10-02', guests: 2 }),
    res({ unit: '301', real_status: 'checked_in', checkin: '2026-10-02', guests: 6 }),
  ]);
  const a = out.occupancy.pax.by_property.find((p) => p.property === 'HOTEL ATHERON SUITE');
  assert.equal(a.capacidad_vendible, 20);
  assert.equal(a.personas, 8);
  assert.equal(a.pct, 40);
  assert.equal(out.occupancy.pax.pct, 40);
});

test('ocupacion por personas: Algarra/Neusa sin capacidad confirmada = DATA_GAP, global marcado parcial', () => {
  const out = cc([res({ unit: 'CASA COMPLETA', property: 'CASA ALGARRA', real_status: 'checked_in', checkin: '2026-10-02', guests: 9 })]);
  const alg = out.occupancy.pax.by_property.find((p) => p.property === 'CASA ALGARRA');
  assert.equal(alg.capacidad_vendible, null);
  assert.equal(alg.pct, null);
  assert.equal(alg.data_gap, 'CAPACIDAD_NO_CONFIRMADA');
  assert.equal(out.occupancy.pax.parcial, true);
  assert.equal(out.occupancy.pax.personas, 0); // no se mezclan personas de una propiedad sin capacidad
  assert.ok(out.data_gaps.some((g) => g.code === 'CAPACIDAD_NO_CONFIRMADA'));
  assert.equal(out.occupancy.rooms.ocupadas, 1); // pero SI cuenta como unidad ocupada
});

test('sobreocupacion: personas > capacidad comercial de la unidad', () => {
  const out = cc([res({ unit: '201', real_status: 'confirmed', guests: 4 })]); // 201 admite 2
  assert.ok(out.alerts.some((a) => a.code === 'SOBREOCUPACION' && a.unit === '201'));
  assert.ok(!cc([res({ unit: '301', guests: 7 })]).alerts.some((a) => a.code === 'SOBREOCUPACION'));
});

// ---------------------------------------------------------------- saldos pendientes (auditoria)
test('SALDOS: el saldo operativo excluye HOLD/opcion/consulta; la formula HOTEL-009 los incluia', () => {
  const rs = [
    res({ real_status: 'confirmed', unit: '201', gross_sale: 100000, collected: 30000, balance: 70000 }),
    res({ real_status: 'checked_out', unit: '202', checkin: '2026-09-20', checkout: '2026-09-22', gross_sale: 80000, collected: 0, balance: 80000 }),
    res({ real_status: 'hold', unit: '203', gross_sale: 500000, collected: 0, balance: 500000 }),
    res({ real_status: 'opcion', unit: '301', gross_sale: 300000, collected: 0, balance: 300000 }),
    res({ real_status: 'draft', unit: '302', gross_sale: 200000, collected: 0, balance: 200000 }),
  ];
  const { saldos } = cc(rs).finance;
  assert.deepEqual(saldos.operativo, { count: 2, amount: 150000 });
  assert.deepEqual(saldos.en_casa_o_futuras, { count: 1, amount: 70000 });
  assert.deepEqual(saldos.estancias_terminadas, { count: 1, amount: 80000 });
  assert.equal(saldos.formula_hotel009.count, 5);
  assert.equal(saldos.formula_hotel009.amount, 1150000);
  assert.equal(saldos.diferencia_vs_formula_hotel009, 1000000); // = pipeline no vendido
  assert.equal(saldos.pipeline_no_vendido.hold.valor, 500000);
  assert.equal(saldos.pipeline_no_vendido.opcion.valor, 300000);
  assert.equal(saldos.pipeline_no_vendido.consulta.valor, 200000);
  assert.match(saldos.scope, /solo dominio hotelero/);
});

test('SALDOS: la descomposicion cuadra y pasa las validaciones cruzadas', () => {
  const out = cc([res({ real_status: 'confirmed', gross_sale: 100000, collected: 100000, balance: 0 })]);
  assert.equal(out.finance.saldos.operativo.count, 0);
  assert.ok(out.validation.ok, JSON.stringify(out.validation.checks.filter((c) => !c.ok)));
});

test('SALDOS: x_hotel_balance distinto de total - cobrado se marca como anomalia, no se oculta', () => {
  const out = cc([res({ gross_sale: 100000, collected: 20000, balance: 50000 })]);
  assert.ok(out.alerts.some((a) => a.code === 'ANOMALIA_SALDO'));
});

test('SALDOS: cobrado por fecha real solo con pagos; sin pagos es null (no 0 inventado)', () => {
  const rs = [res({ gross_sale: 100000, collected: 40000, balance: 60000, external_reference: 'COT/PAY/1' })];
  const sin = cc(rs);
  assert.equal(sin.finance.cobrado_hoy_real, null);
  assert.ok(sin.data_gaps.some((g) => g.code === 'COBRADO_POR_FECHA_NO_LEIDO'));
  const con = cc(rs, { payments: [{ collected_date: TODAY, amount: 25000 }, { collected_date: '2026-10-01', amount: 15000 }] });
  assert.equal(con.finance.cobrado_hoy_real, 25000);
  assert.equal(con.headline.cobrado, 25000);
  assert.equal(con.finance.cobrado_acumulado, 40000);
});

// ---------------------------------------------------------------- KPIs gerenciales
test('ventas del dia: solo VENDIDAS creadas hoy; el HOLD creado hoy es reserva del dia pero no venta', () => {
  const out = cc([
    res({ reservation_date: TODAY, real_status: 'confirmed', gross_sale: 150000 }),
    res({ reservation_date: TODAY, real_status: 'hold', unit: '202', gross_sale: 99000 }),
    res({ reservation_date: '2026-10-01', real_status: 'confirmed', unit: '203', gross_sale: 70000 }),
  ]);
  assert.deepEqual(out.finance.ventas_dia, { count: 1, amount: 150000 });
  assert.equal(out.finance.reservas_dia.total, 2);
  assert.equal(out.finance.reservas_dia.por_estado.hold, 1);
});

test('noches vendidas, ingresos devengados, ADR y RevPAR sobre un periodo', () => {
  // 201: 2 noches (3->5) $200.000 => 100.000/noche. 7 unidades, horizonte 2 dias.
  const out = cc([res({ unit: '201', gross_sale: 200000 })], { horizon: { preset: 'RANGO', range: { from: TODAY, to: '2026-10-04' } } });
  const k = out.horizon_kpis;
  assert.equal(k.noches_vendidas, 2);
  assert.equal(k.noches_disponibles, 14);
  assert.equal(k.ingresos, 200000);
  assert.equal(k.adr, 100000);
  assert.equal(k.revpar, Math.round((200000 / 14) * 100) / 100);
  assert.equal(k.ocupacion_vendida_pct, 14.3);
  assert.ok(Math.abs(k.revpar - (k.adr * k.ocupacion_vendida_pct) / 100) < 100); // RevPAR = ADR x ocupacion
});

test('ingresos devengados se prorratean: periodo que solo toca 1 de 4 noches', () => {
  const out = cc([res({ unit: '201', checkin: '2026-10-02', checkout: '2026-10-06', gross_sale: 400000 })], { horizon: { preset: 'HOY' } });
  assert.equal(out.horizon_kpis.ingresos, 100000);
  assert.equal(out.horizon_kpis.noches_vendidas, 1);
  assert.equal(out.finance.valor_reservas_periodo, 400000); // valor completo de la reserva, distinto del devengado
});

test('casa completa Atheron cuenta 5 noches-habitacion por noche en ADR/noches vendidas', () => {
  const out = cc([res({ unit: 'CASA COMPLETA', checkin: TODAY, checkout: '2026-10-04', gross_sale: 500000, guests: 12 })]);
  assert.equal(out.horizon_kpis.noches_vendidas, 5);
  assert.equal(out.horizon_kpis.adr, 100000);
});

test('ADR y RevPAR son null (no 0) sin noches vendidas / sin datos vacios', () => {
  const out = cc([]);
  assert.equal(out.horizon_kpis.adr, null);
  assert.equal(out.horizon_kpis.ocupacion_vendida_pct, 0);
  assert.equal(out.occupancy.rooms.pct, 0);
  assert.equal(out.finance.saldos.operativo.amount, 0);
  assert.deepEqual(out.alerts.filter((a) => a.severity === 'ALTA'), []);
  assert.ok(out.validation.ok);
});

test('canales: reservas, noches e ingresos por canal; sin canal = SIN_CANAL_REGISTRADO; suma = total', () => {
  const out = cc([
    res({ unit: '201', channel: 'BOOKING', gross_sale: 200000 }),
    res({ unit: '202', channel: 'AIRBNB', gross_sale: 100000 }),
    res({ unit: '203', channel: 'WHATSAPP', gross_sale: 100000 }),
    res({ unit: '301', channel: null, gross_sale: 100000 }),
    res({ unit: '302', channel: 'DIRECTO', real_status: 'hold', gross_sale: 900000 }), // HOLD no es ingreso
  ]);
  const by = Object.fromEntries(out.channels.map((c) => [c.channel, c]));
  assert.deepEqual(Object.keys(by).sort(), ['AIRBNB', 'BOOKING', 'SIN_CANAL_REGISTRADO', 'WHATSAPP']);
  assert.equal(by.BOOKING.ingresos, 100000); // 200.000 en 2 noches, HOY toca 1
  assert.equal(by.BOOKING.pct_ingresos, 40);
  assert.equal(out.channels.reduce((a, c) => a + c.ingresos, 0), out.horizon_kpis.ingresos);
  assert.ok(out.validation.checks.find((c) => c.id === 'canales_suman_ingresos').ok);
});

// ---------------------------------------------------------------- filtros
test('filtro por propiedad, unidad, canal y estado', () => {
  const rs = [
    res({ unit: '201', channel: 'BOOKING', real_status: 'checked_in', checkin: '2026-10-02' }),
    res({ unit: '202', channel: 'AIRBNB', real_status: 'confirmed' }),
    res({ unit: 'CASA COMPLETA', property: 'CASA NEUSA', channel: 'DIRECTO', real_status: 'confirmed', guests: 8 }),
  ];
  assert.deepEqual(cc(rs, { filters: { property: 'CASA NEUSA' } }).units.map((u) => u.unit), ['CASA_COMPLETA_NEUSA']);
  assert.deepEqual(cc(rs, { filters: { unit: '202' } }).units.map((u) => u.unit), ['202']);
  // la CASA COMPLETA aparece porque su bloqueo viene de una reserva que si coincide con el filtro
  assert.deepEqual(cc(rs, { filters: { channel: 'BOOKING' } }).units.map((u) => u.unit), ['201', 'CASA_COMPLETA_ATHERON_SUITE']);
  assert.deepEqual(cc(rs, { filters: { status: ['confirmed'] } }).units.map((u) => u.unit).sort(), ['202', 'CASA_COMPLETA_NEUSA']);
  const byChannel = cc(rs, { filters: { channel: 'AIRBNB' } });
  assert.deepEqual(byChannel.channels.map((c) => c.channel), ['AIRBNB']);
  assert.equal(byChannel.meta.reservations_in_scope, 1);
});

test('filtrar por canal NO cambia la verdad del inventario (una casa completa filtrada no libera sus habitaciones)', () => {
  const rs = [res({ unit: 'CASA COMPLETA', channel: 'BOOKING', real_status: 'checked_in', checkin: '2026-10-02', guests: 10 })];
  const out = cc(rs, { filters: { channel: 'AIRBNB' } });
  assert.equal(out.inventory.ocupadas, 5); // el inventario sigue siendo real
  assert.equal(out.units.length, 0); // pero no se muestran unidades que no coinciden con el filtro
});

test('horizonte MANANA y 7_DIAS cambian el periodo de KPI sin cambiar el estado de HOY', () => {
  const rs = [res({ unit: '201', checkin: '2026-10-04', checkout: '2026-10-06', gross_sale: 200000 })];
  const hoy = cc(rs, { horizon: { preset: 'HOY' } });
  const man = cc(rs, { horizon: { preset: 'MANANA' } });
  assert.equal(hoy.horizon_kpis.noches_vendidas, 0);
  assert.equal(man.horizon_kpis.noches_vendidas, 1);
  assert.equal(card(hoy, '201').state, 'DISPONIBLE');
  assert.equal(cc(rs, { horizon: { preset: '7_DIAS' } }).horizon_kpis.noches_vendidas, 2);
  assert.equal(cc(rs, { horizon: { preset: '7_DIAS' } }).daily.length, 7);
});

// ---------------------------------------------------------------- housekeeping
const hkTasks = (rows) => rows.map(([unit, stage, assignee = null]) => ({ unit, stage, assignee, updated_at: '2026-10-03 09:00:00' }));

test('normalizeHousekeepingStage: nombres reales de Odoo y UX', () => {
  assert.equal(normalizeHousekeepingStage('POR LIMPIAR'), 'POR_LIMPIAR');
  assert.equal(normalizeHousekeepingStage('En limpieza'), 'EN_LIMPIEZA');
  assert.equal(normalizeHousekeepingStage('LISTA PARA REVISAR'), 'LISTA_PARA_REVISAR');
  assert.equal(normalizeHousekeepingStage('Lista'), 'LISTA');
  assert.equal(normalizeHousekeepingStage('etapa rara'), null);
  assert.equal(normalizeHousekeepingStage(null), null);
});

test('housekeeping: flujo CHECK-OUT -> ASEO PENDIENTE -> EN LIMPIEZA -> LISTA con responsable y hora', () => {
  const rs = [
    res({ unit: '201', real_status: 'checked_out', checkin: '2026-10-01', checkout: TODAY }),
    res({ unit: '202', real_status: 'checked_out', checkin: '2026-10-01', checkout: TODAY }),
    res({ unit: '203', real_status: 'checked_out', checkin: '2026-10-01', checkout: TODAY }),
    res({ unit: '301', real_status: 'checked_out', checkin: '2026-10-01', checkout: TODAY }),
  ];
  const out = cc(rs, {
    housekeepingTasks: hkTasks([['201', 'POR LIMPIAR'], ['202', 'EN LIMPIEZA', 'Rosa'], ['203', 'LISTA PARA REVISAR'], ['301', 'LISTA'], ['302', 'LISTA']]),
  });
  const hk = out.housekeeping;
  assert.equal(hk.aseos_hoy, 4);
  assert.equal(hk.completados, 1);
  assert.equal(hk.pct_completados, 25);
  assert.equal(hk.pendientes, 1);
  assert.equal(hk.en_limpieza, 1);
  assert.equal(hk.por_revisar, 1);
  assert.deepEqual(hk.habitaciones_no_listas.sort(), ['201', '202', '203']);
  assert.equal(card(out, '201').display_state, 'ASEO_PENDIENTE');
  assert.equal(card(out, '301').display_state, 'LISTO');
  assert.equal(card(out, '302').display_state, 'LISTO');
  assert.equal(card(out, '202').housekeeping.assignee, 'Rosa');
  assert.equal(card(out, '202').housekeeping.updated_at, '2026-10-03 09:00:00');
  assert.equal(out.headline.requieren_aseo, 3);
});

test('housekeeping: salida de hoy sin check-out realizado NO cuenta como aseo completado aunque la tarea diga LISTA', () => {
  const out = cc([res({ unit: '201', real_status: 'checked_in', checkin: '2026-10-01', checkout: TODAY })], { housekeepingTasks: hkTasks([['201', 'LISTA']]) });
  const row = out.housekeeping.detalle.find((d) => d.unit === '201');
  assert.equal(row.estado, 'AUN_NO_SALE');
  assert.equal(out.housekeeping.completados, 0);
  assert.equal(card(out, '201').state, 'OCUPADO');
  assert.equal(card(out, '201').sale_hoy, true);
});

test('alerta: check-in proximo + habitacion no lista (hoy ALTA, manana MEDIA)', () => {
  const rs = [
    res({ unit: '201', real_status: 'confirmed', checkin: TODAY, checkout: '2026-10-05' }),
    res({ unit: '202', real_status: 'confirmed', checkin: '2026-10-04', checkout: '2026-10-05' }),
    res({ unit: '203', real_status: 'confirmed', checkin: TODAY, checkout: '2026-10-05' }),
  ];
  const out = cc(rs, { housekeepingTasks: hkTasks([['201', 'POR LIMPIAR'], ['202', 'EN LIMPIEZA'], ['203', 'LISTA']]) });
  const al = out.alerts.filter((a) => a.code === 'CHECKIN_PROXIMO_NO_LISTA');
  assert.equal(al.length, 2);
  assert.equal(al.find((a) => a.unit === '201').severity, 'ALTA');
  assert.equal(al.find((a) => a.unit === '202').severity, 'MEDIA');
  assert.equal(out.housekeeping.proximos_checkin_no_listos.length, 2);
  assert.ok(out.housekeeping.prioridad.find((p) => p.unit === '201' && p.priority === 'ALTA'));
});

test('llegada de CASA COMPLETA exige las 5 habitaciones listas', () => {
  const out = cc([res({ unit: 'CASA COMPLETA', real_status: 'confirmed', guests: 10 })], {
    housekeepingTasks: hkTasks([['201', 'LISTA'], ['202', 'LISTA'], ['203', 'LISTA'], ['301', 'LISTA'], ['302', 'POR LIMPIAR']]),
  });
  const al = out.alerts.filter((a) => a.code === 'CHECKIN_PROXIMO_NO_LISTA');
  assert.deepEqual(al.map((a) => a.unit), ['302']);
});

test('incidencia de aseo abierta: alerta ALTA y la unidad no queda LISTO', () => {
  const out = cc([], { housekeepingTasks: hkTasks([['201', 'INCIDENCIA']]) });
  assert.equal(card(out, '201').display_state, 'ASEO_PENDIENTE');
  assert.ok(out.alerts.some((a) => a.code === 'ANOMALIA_OPERATIVA' && a.unit === '201'));
  assert.equal(out.housekeeping.con_incidencia, 1);
});

test('housekeeping sin lectura: SIN DATO, porcentajes null, nunca se asume LISTO (DATA_GAP)', () => {
  const out = cc([res({ unit: '201', real_status: 'checked_out', checkin: '2026-10-01', checkout: TODAY })]);
  assert.equal(out.housekeeping.datos_disponibles, false);
  assert.equal(out.housekeeping.pct_completados, null);
  assert.equal(out.headline.requieren_aseo, null);
  assert.equal(out.headline.listas, null);
  assert.equal(card(out, '201').display_state, 'DISPONIBLE');
  assert.ok(out.data_gaps.some((g) => g.code === 'HOUSEKEEPING_SIN_LECTURA'));
});

test('Algarra y Neusa: housekeeping no configurado = DATA_GAP documentado, no se inventan aseos', () => {
  const out = cc([], { housekeepingTasks: [] });
  const alg = card(out, 'CASA_COMPLETA_ALGARRA');
  assert.equal(alg.housekeeping.status, 'DATA_GAP');
  assert.deepEqual(out.housekeeping.sin_housekeeping.sort(), ['CASA ALGARRA', 'CASA NEUSA']);
  assert.ok(out.data_gaps.some((g) => g.code === 'HOUSEKEEPING_NO_CONFIGURADO'));
  assert.ok(!out.housekeeping.habitaciones_no_listas.includes('CASA_COMPLETA_ALGARRA'));
});

// ---------------------------------------------------------------- alertas restantes
test('alertas: HOLD relevante, HOLD vencido, saldo pendiente, reserva incompleta, llegada vencida', () => {
  const out = cc([
    res({ unit: '201', real_status: 'hold', checkin: '2026-10-04', checkout: '2026-10-05', hold_expires: '2026-10-03 18:00:00' }),
    res({ unit: '202', real_status: 'hold', hold_expired: true, checkin: '2026-10-04', checkout: '2026-10-05' }),
    res({ unit: '203', real_status: 'checked_in', checkin: '2026-10-02', gross_sale: 100000, collected: 0, balance: 100000 }),
    res({ unit: null, real_status: 'confirmed' }),
    res({ unit: '301', real_status: 'confirmed', checkin: '2026-09-30', checkout: '2026-10-08' }),
    res({ unit: '302', real_status: 'confirmed', guests: null }),
  ]);
  const codes = out.alerts.map((a) => a.code);
  for (const c of ['HOLD_RELEVANTE', 'HOLD_VENCIDO', 'SALDO_PENDIENTE', 'RESERVA_INCOMPLETA', 'LLEGADA_VENCIDA']) assert.ok(codes.includes(c), c);
  assert.ok(out.alerts.find((a) => a.code === 'SALDO_PENDIENTE' && a.unit === '203' && a.severity === 'ALTA'));
  // ordenadas por severidad
  const sev = out.alerts.map((a) => ({ ALTA: 0, MEDIA: 1, BAJA: 2 })[a.severity]);
  assert.deepEqual(sev, [...sev].sort((a, b) => a - b));
});

test('reserva con fechas invertidas o sin fechas: incompleta y no bloquea ninguna noche', () => {
  const out = cc([res({ unit: '201', checkin: '2026-10-05', checkout: '2026-10-03' }), res({ unit: '202', checkin: null, checkout: null })]);
  assert.equal(card(out, '201').state, 'DISPONIBLE');
  assert.equal(card(out, '202').state, 'DISPONIBLE');
  assert.equal(out.alerts.filter((a) => a.code === 'RESERVA_INCOMPLETA').length, 2);
});

test('nada destructivo: el modelo no muta las reservas de entrada', () => {
  const rs = [res({ unit: '201' }), res({ unit: 'CASA COMPLETA' })];
  const snap = JSON.stringify(rs);
  cc(rs, { filters: { channel: 'DIRECTO' }, housekeepingTasks: [] });
  assert.equal(JSON.stringify(rs), snap);
});

// ---------------------------------------------------------------- tarjeta de unidad
test('tarjeta: unidad, propiedad, capacidad, huesped/referencia, canal, fechas, personas, valor, pago/saldo, aseo (telefono enmascarado)', () => {
  const out = cc([res({ unit: '301', real_status: 'checked_in', checkin: '2026-10-02', checkout: '2026-10-05', guests: 5, channel: 'AIRBNB', gross_sale: 300000, collected: 100000, balance: 200000, external_reference: 'COT/X/1' })], {
    housekeepingTasks: hkTasks([['301', 'LISTA']]),
  });
  const c = card(out, '301');
  assert.equal(c.property, 'HOTEL ATHERON SUITE');
  assert.equal(c.capacity, 7);
  assert.equal(c.reference, 'COT/X/1');
  assert.equal(c.channel, 'AIRBNB');
  assert.equal(c.checkin, '2026-10-02');
  assert.equal(c.checkout, '2026-10-05');
  assert.equal(c.guests, 5);
  assert.equal(c.total, 300000);
  assert.equal(c.balance, 200000);
  assert.equal(c.payment_status, 'PARCIAL');
  assert.equal(c.phone_masked, '****4567');
  assert.ok(!JSON.stringify(out).includes('3001234567'));
  assert.equal(c.housekeeping.stage, 'LISTA');
});

// ---------------------------------------------------------------- revenue intelligence
test('Revenue Intelligence es read-only y sin costos devuelve DATA NOT READY con la lista exacta', () => {
  const out = cc([res({ unit: '201' })]);
  const ri = out.revenue_intelligence;
  assert.equal(ri.read_only, true);
  assert.equal(ri.modifica_tarifas, false);
  assert.equal(ri.status, 'DATA_NOT_READY');
  assert.equal(ri.tarifa_piso.tarifa_piso, null);
  assert.deepEqual(ri.tarifa_piso.missing.sort(), ['comision_ota_pct', 'costo_fijo_diario', 'costo_variable_noche', 'margen_minimo_pct', 'noches_esperadas_dia']);
  assert.equal(ri.costos_requeridos.length, 8);
  assert.ok(ri.costos_requeridos.every((c) => c.disponible === false));
  assert.ok(out.data_gaps.some((g) => g.code === 'COSTOS_NO_DISPONIBLES'));
});

test('computeFloorRate: formula exacta con costos completos; rechaza entradas invalidas; nunca usa valores por defecto', () => {
  const costs = { costo_variable_noche: 30000, comision_ota_pct: 0.15, costo_fijo_diario: 200000, margen_minimo_pct: 0.1, noches_esperadas_dia: 4, adr: 120000 };
  const r = computeFloorRate(costs, { sellableUnits: 5 });
  assert.equal(r.status, 'READY');
  assert.equal(r.tarifa_piso, Math.round(((30000 + 200000 / 4) / (1 - 0.15 - 0.1)) * 100) / 100); // 106666.67
  assert.equal(r.noches_equilibrio, Math.round((200000 / (120000 * 0.85 - 30000)) * 100) / 100); // 2.8
  assert.equal(r.ocupacion_equilibrio, 55.6);
  assert.equal(computeFloorRate({ ...costs, comision_ota_pct: 0.95 }).status, 'INVALID_INPUT');
  assert.equal(computeFloorRate({ ...costs, noches_esperadas_dia: 0 }).status, 'INVALID_INPUT');
  assert.equal(computeFloorRate({ ...costs, costo_fijo_diario: undefined }).status, 'DATA_NOT_READY');
  assert.equal(computeFloorRate(null).status, 'DATA_NOT_READY');
});

test('Revenue Intelligence con costos completos pasa a READY sin tocar tarifas', () => {
  const out = cc([res({ unit: '201' })], { costs: { costo_variable_noche: 30000, comision_ota_pct: 0.1, costo_fijo_diario: 100000, margen_minimo_pct: 0.1, noches_esperadas_dia: 3 } });
  assert.equal(out.revenue_intelligence.status, 'READY');
  assert.ok(out.revenue_intelligence.tarifa_piso.tarifa_piso > 0);
  assert.equal(out.revenue_intelligence.modifica_tarifas, false);
});

test('Revenue Intelligence: sin historial suficiente NO declara dia valle (solo lista los mas bajos)', () => {
  const out = cc([res({ unit: '201', checkin: '2026-10-01', checkout: '2026-10-08' })]);
  const ri = out.revenue_intelligence;
  assert.equal(ri.patron_listo, false);
  assert.ok(ri.proximos_30_dias.every((d) => d.dia_valle === null));
  assert.equal(ri.dias_mas_bajos.length, 5);
  assert.ok(out.data_gaps.some((g) => g.code === 'HISTORIAL_INSUFICIENTE'));
  assert.ok(out.data_gaps.some((g) => g.code === 'COMPARATIVO_ANUAL_NO_DISPONIBLE'));
  assert.equal(ri.booking_pace.comparativo, 'DATA_NOT_READY');
});

test('Revenue Intelligence: con 6 semanas de historia, ocupacion por dia de semana, ADR, RevPAR y dia valle', () => {
  // 2026-08-23 .. 2026-10-02 = 41 dias. Habitacion 201 vendida TODOS los dias menos los sabados; 202 todos los dias.
  const rs = [];
  for (let d = '2026-08-23'; d <= '2026-10-02'; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
    const next = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    rs.push(res({ unit: '202', checkin: d, checkout: next, gross_sale: 100000, real_status: 'closed', reservation_date: d }));
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 6) rs.push(res({ unit: '201', checkin: d, checkout: next, gross_sale: 100000, real_status: 'closed', reservation_date: d }));
  }
  // futuro: domingo 2026-10-11 con solo 1 unidad vendida de 7 (esperado 28.6%) y sabado 2026-10-10 igual (esperado 14.3%)
  rs.push(res({ unit: '202', checkin: '2026-10-11', checkout: '2026-10-12', gross_sale: 100000, reservation_date: '2026-10-02' }));
  rs.push(res({ unit: '202', checkin: '2026-10-10', checkout: '2026-10-11', gross_sale: 100000, reservation_date: '2026-10-02' }));
  const out = cc(rs, { options: { minWeeksPerWeekday: 5 } });
  const ri = out.revenue_intelligence;
  assert.equal(ri.patron_listo, true);
  const sab = ri.por_dia_semana[6];
  const lun = ri.por_dia_semana[1];
  assert.ok(sab.ocupacion_pct < lun.ocupacion_pct); // sabados con menos ocupacion que lunes
  assert.equal(lun.adr, 100000);
  assert.equal(ri.historico.adr, 100000);
  assert.equal(ri.historico.desde, '2026-08-23');
  const dom = ri.proximos_30_dias.find((x) => x.date === '2026-10-11');
  assert.equal(dom.vendidas, 1);
  assert.equal(dom.pickup_7d, 1);
  assert.equal(dom.esperada_pct, 28.6);
  assert.equal(dom.ocupacion_proyectada_pct, 14.3);
  assert.equal(dom.dia_valle, true); // 14.3 < 0.75 x 28.6
  const sabF = ri.proximos_30_dias.find((x) => x.date === '2026-10-10');
  assert.equal(sabF.dia_valle, false); // 14.3 no es inferior al patron habitual del sabado (14.3)
});

// ---------------------------------------------------------------- trazabilidad de KPI
test('cada KPI tiene SOURCE, DOMAIN, FORMULA y VALIDATION', () => {
  assert.ok(KPI_DEFINITIONS.length >= 20);
  for (const k of KPI_DEFINITIONS) {
    for (const f of ['id', 'label', 'source', 'domain', 'formula', 'validation']) assert.ok(k[f] && String(k[f]).length > 2, `${k.id}.${f}`);
  }
  const ids = KPI_DEFINITIONS.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('saldo_operativo') && ids.includes('saldo_formula_hotel009'));
});

test('dominios Odoo equivalentes: siempre acotados a x_order_involves_room = true', () => {
  const d = odooDomainsFor({ referenceDate: TODAY });
  for (const [name, dom] of Object.entries(d)) assert.ok(dom.some((c) => c[0] === 'x_order_involves_room' && c[2] === true), name);
  assert.ok(d.saldo_operativo.some((c) => c[0] === 'x_reservation_status' && c[1] === 'in' && SOLD_STATUSES.every((s) => c[2].includes(s))));
  assert.ok(!d.saldo_operativo.some((c) => c[2] === 'hold'));
});

// ---------------------------------------------------------------- integracion con el lector real
test('integracion: filas reales de sale.order -> mapper -> control center (hold_origin, canal, estado)', () => {
  const row = {
    id: 9, name: 'COT/2026/00001', create_date: '2026-10-03 08:00:00', x_hotel_property_id: [1, 'HOTEL ATHERON SUITE'], x_hotel_unit_id: [4, '301'],
    x_nombre_cliente: 'QA', x_telf_cliente: '3000000000', x_checkin: '2026-10-03 15:00:00', x_checkout: '2026-10-04 11:00:00', x_num_adults: 2, x_num_children: 1,
    x_reservation_status: 'confirmed', x_booking_source: 'booking_com', x_hold_origin: 'web', amount_total: 120000, x_hotel_paid: 36000, x_hotel_balance: 84000, x_hold_expired: false,
  };
  const r = mapSaleOrderToReservation(row);
  assert.equal(r.hold_origin, 'web');
  const out = cc([r]);
  assert.equal(card(out, '301').state, 'RESERVADO');
  assert.equal(card(out, '301').channel, 'BOOKING');
  assert.equal(card(out, '301').guests, 3);
  assert.equal(card(out, '301').balance, 84000);
  assert.equal(out.finance.ventas_dia.amount, 120000);
});

test('fetchAllHotelReservations pagina hasta agotar y no trunca (el lector viejo cortaba en 300)', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: start + i, name: `COT/${start + i}`, x_reservation_status: 'confirmed', amount_total: 1 }));
  const transport = new FakeOdooTransport({ results: [page(200, 0), page(200, 200), page(57, 400)] });
  const { reservations, truncated } = await fetchAllHotelReservations(transport, { database: 'db', uid: 1, technicalSecret: 's', pageSize: 200 });
  assert.equal(reservations.length, 457);
  assert.equal(truncated, false);
  const calls = transport.executeKwCalls.map((c) => c.args[6]);
  assert.deepEqual(calls.map((o) => o.offset), [0, 200, 400]);
  assert.ok(calls.every((o) => o.order === 'id asc'));
  assert.ok(transport.executeKwCalls.every((c) => c.args[4] === 'search_read')); // solo lectura
});

test('fetchAllHotelReservations marca truncated cuando choca con maxRows y el modelo lo declara como DATA_GAP', async () => {
  const transport = new FakeOdooTransport({ result: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `C${i}`, x_reservation_status: 'confirmed' })) });
  const { reservations, truncated } = await fetchAllHotelReservations(transport, { database: 'db', uid: 1, technicalSecret: 's', pageSize: 50, maxRows: 100 });
  assert.equal(reservations.length, 100);
  assert.equal(truncated, true);
  const out = buildControlCenter({ reservations, referenceDate: TODAY, options: { truncated } });
  assert.ok(out.data_gaps.some((g) => g.code === 'LECTURA_TRUNCADA'));
});

test('regresion: la salida completa es serializable y estable ante datos mezclados', () => {
  const out = cc([res({ unit: '201' }), res({ unit: 'CASA COMPLETA', property: 'CASA ALGARRA' }), res({ unit: 'zzz' }), res({ real_status: null })], { housekeepingTasks: hkTasks([['201', 'LISTA']]) });
  assert.doesNotThrow(() => JSON.stringify(out));
  assert.ok(out.headline && out.inventory && out.occupancy && out.housekeeping && out.finance && out.revenue_intelligence);
});

test('CASA COMPLETA bloqueada por una habitacion no muestra los datos del huesped de esa habitacion', () => {
  const out = cc([res({ unit: '203', real_status: 'checked_in', checkin: '2026-10-02', external_reference: 'COT/B/1' })]);
  const casa = card(out, 'CASA_COMPLETA_ATHERON_SUITE');
  assert.equal(casa.reference, null);
  assert.equal(casa.guest, null);
  assert.deepEqual(casa.blocked_by, { unit: '203', reference: 'COT/B/1' });
});
