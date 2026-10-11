import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeBeds24Booking, createReadOnlyTransport, Beds24ReadOnlyClient } from '../src/ops/beds24-readonly.mjs';
import { consolidateStays } from '../src/ops/master-stay.mjs';
import { buildOps, cellFor } from '../src/ops/ops-board.mjs';
import { renderDashboardHtml } from '../src/ops/render-html.mjs';
import { STAY, rawMedico, registryMedico, ledgerFirstPaid, otherBookings } from './fixtures/ops-medico.mjs';

const norm = (rows) => rows.map((r) => normalizeBeds24Booking(r));
const ops = (asOf, extra = {}, rows = rawMedico()) => buildOps({ bookings: norm(rows), registry: registryMedico(), asOf, ...extra });
const medico = (o) => o.stays.find((s) => s.stay_id === STAY);

test('médico: UNA estadía, 3 segmentos, 21 noches, venta 1.155.000 contada una sola vez', () => {
  const o = ops('2026-10-11');
  assert.equal(o.stays.length, 1);
  const s = medico(o);
  assert.equal(s.total_nights, 21);
  assert.equal(s.total_sale, 1155000);
  assert.equal(s.check_in_global, '2026-10-11');
  assert.equal(s.check_out_global, '2026-11-01');
  assert.deepEqual(s.room_segments.map((x) => [x.room_location, x.segment_checkin, x.segment_checkout, x.nights]),
    [['203', '2026-10-11', '2026-10-17', 6], ['EXTERNO', '2026-10-17', '2026-10-18', 1], ['302', '2026-10-18', '2026-11-01', 14]]);
  assert.deepEqual(o.anomalies, []); // cargos 330.000+55.000+770.000 = total registrado
});

test('pago solo REPORTADO no reduce el saldo; el confirmado sí', () => {
  let s = medico(ops('2026-10-11'));
  assert.equal(s.payment_reported_unconfirmed, 577500);
  assert.equal(s.payment_confirmed, 0);
  assert.equal(s.balance, 1155000);
  s = medico(ops('2026-10-11', { confirmedPayments: ledgerFirstPaid() }));
  assert.equal(s.payment_confirmed, 577500);
  assert.equal(s.payment_reported_unconfirmed, 0);
  assert.equal(s.balance, 577500);
  assert.equal(s.next_payment_date, '2026-10-19');
  assert.equal(s.next_payment_amount, 577500);
  assert.deepEqual(s.payment_plan.map((p) => p.status), ['PAID', 'PENDING']);
});

test('cuota vencida se marca OVERDUE y el pago confirmado no se cuenta dos veces', () => {
  const o = ops('2026-10-20', { confirmedPayments: [...ledgerFirstPaid(), ...ledgerFirstPaid()] });
  const s = medico(o);
  assert.equal(s.payment_confirmed, 577500);
  assert.equal(s.payment_plan[1].status, 'OVERDUE');
  assert.equal(s.payment_overdue, true);
  assert.equal(o.answers.deben_pagar[0].overdue, true);
});

test('rotación: habitación actual, siguiente y fecha de cambio', () => {
  const at = (d) => medico(ops(d, { confirmedPayments: ledgerFirstPaid() }));
  assert.deepEqual([at('2026-10-12').current_room, at('2026-10-12').next_room, at('2026-10-12').next_move_date], ['203', 'EXTERNO', '2026-10-17']);
  assert.deepEqual([at('2026-10-17').current_room, at('2026-10-17').next_room, at('2026-10-17').next_move_date], ['EXTERNO', '302', '2026-10-18']);
  assert.deepEqual([at('2026-10-20').current_room, at('2026-10-20').next_room, at('2026-10-20').next_move_date], ['302', null, null]);
  assert.deepEqual([at('2026-10-05').current_room, at('2026-10-05').next_room, at('2026-10-05').next_move_date], [null, '203', null]);
  const o = ops('2026-10-16');
  assert.deepEqual(o.answers.cambios_manana.map((m) => [m.from, m.to]), [['203', 'EXTERNO']]);
});

test('grilla: ROOM_MOVE en 203 el 17 y 302 el 18; 302 libre la noche externa; sin ARRIVAL/DEPARTURE falsas', () => {
  const o = ops('2026-10-11');
  const cell = (room, d) => o.grid.find((g) => g.room === room).cells.find((c) => c.date === d);
  assert.equal(cell('203', '2026-10-11').primary, 'ARRIVAL');
  assert.deepEqual(cell('203', '2026-10-11').states, ['ARRIVAL', 'OCCUPIED']);
  assert.equal(cell('203', '2026-10-16').primary, 'OCCUPIED');
  assert.equal(cell('203', '2026-10-17').primary, 'ROOM_MOVE');
  assert.equal(cell('203', '2026-10-17').bucket, 'DISPONIBLE');
  assert.equal(cell('302', '2026-10-17').primary, 'FREE');
  assert.equal(cell('302', '2026-10-18').primary, 'ROOM_MOVE');
  assert.ok(cell('302', '2026-10-18').states.includes('OCCUPIED'));
  for (const g of o.grid) for (const c of g.cells) assert.ok(!(c.stays.includes(STAY) && c.states.includes('DEPARTURE')));
});

test('KPI: el médico no se cuenta varias veces (llegada, salida, confirmadas, saldo, ocupación)', () => {
  const kpi = (o, w, k) => o.windows[w].kpi_row.find((x) => x.key === k).value;
  const o1 = ops('2026-10-11');
  assert.equal(kpi(o1, 'HOY', 'LLEGADAS'), 1);
  assert.equal(kpi(o1, 'HOY', 'OCUPADAS'), 1);
  assert.equal(kpi(o1, 'HOY', 'DISPONIBLES'), 4);
  const o17 = ops('2026-10-17');
  assert.equal(kpi(o17, 'HOY', 'LLEGADAS'), 0);   // pasar al externo no es llegada
  assert.equal(kpi(o17, 'HOY', 'SALIDAS'), 0);    // ni salida
  assert.equal(kpi(o17, 'HOY', 'OCUPADAS'), 0);
  assert.equal(kpi(o17, 'HOY', 'DISPONIBLES'), 5);
  const o18 = ops('2026-10-18');
  assert.equal(kpi(o18, 'HOY', 'LLEGADAS'), 0);
  assert.equal(kpi(o18, 'HOY', 'OCUPADAS'), 1);
  const oMes = ops('2026-10-11');
  assert.equal(kpi(oMes, 'MES', 'CONFIRMADAS'), 1);
  assert.equal(kpi(oMes, 'MES', 'SALDO_PENDIENTE'), 1155000);
  assert.equal(kpi(ops('2026-11-01'), 'HOY', 'SALIDAS'), 1);
  for (const w of Object.values(oMes.windows)) assert.equal(w.partition_ok, true);
  assert.deepEqual(oMes.windows.HOY.kpi_row.map((k) => k.key), ['DISPONIBLES', 'OCUPADAS', 'HOLD', 'BLOQUEADAS', 'LLEGADAS', 'SALIDAS', 'CONFIRMADAS', 'SALDO_PENDIENTE']);
});

test('OTA y directas visibles, fuente correcta; HOLD y BLACKOUT separados de OCUPADAS', () => {
  const o = ops('2026-10-12', {}, [...rawMedico(), ...otherBookings()]);
  const src = Object.fromEntries(o.stays.map((s) => [s.stay_id, s.source]));
  assert.equal(src['BEDS24-900101'], 'BOOKING');
  assert.equal(src['BEDS24-900102'], 'AIRBNB');
  assert.equal(src['BEDS24-900103'], 'DIRECT');
  const hoy = o.windows.HOY.kpi_row; const v = (k) => hoy.find((x) => x.key === k).value;
  assert.equal(v('OCUPADAS'), 3);   // 203 médico, 201 Booking, 202 Airbnb
  assert.equal(v('HOLD'), 1);       // 301
  assert.equal(v('BLOQUEADAS'), 0);
  assert.equal(v('DISPONIBLES'), 1);
  assert.deepEqual(o.answers.libres_hoy, ['302']);
  assert.equal(o.blackouts.length, 1);
  assert.deepEqual(o.answers.alojados.map((a) => a.room).sort(), ['201', '202', '203']);
  assert.equal(o.windows['7 DÍAS'].kpi_row.find((x) => x.key === 'BLOQUEADAS').value, 0);
  assert.equal(o.windows.MES.kpi_row.find((x) => x.key === 'BLOQUEADAS').value, 2);
});

test('HOLD vencido deja de bloquear', () => {
  const o = ops('2026-10-12', { now: '2026-10-12T19:00' }, [...rawMedico(), ...otherBookings()]);
  assert.equal(o.windows.HOY.kpi_row.find((x) => x.key === 'HOLD').value, 0);
});

test('sobreventa visible: dos reservas confirmadas en la misma habitación y noche', () => {
  const dup = { id: 900201, roomId: 740218, status: 'confirmed', arrival: '2026-10-13', departure: '2026-10-15', firstName: 'Otro', lastName: 'Huésped', price: 1 };
  const o = ops('2026-10-11', {}, [...rawMedico(), dup]);
  assert.ok(o.answers.sobreventas.length >= 2);
  assert.equal(o.answers.sobreventas[0].room, '203');
  assert.ok(o.grid.find((g) => g.room === '203').cells.find((c) => c.date === '2026-10-13').states.includes('OVERBOOKING'));
  assert.equal(o.windows.HOY.kpi_row.find((x) => x.key === 'OCUPADAS').value, 1); // una habitación, una vez
});

test('Casa Completa no duplica ocupación: ocupa cada física una vez; choca con una habitación vendida', () => {
  const casa = { id: 900301, roomId: 740221, status: 'confirmed', arrival: '2026-10-11', departure: '2026-10-12', firstName: 'Grupo', lastName: 'Casa', price: 1 };
  const o = buildOps({ bookings: norm([casa]), asOf: '2026-10-11' });
  assert.equal(o.windows.HOY.kpi_row.find((x) => x.key === 'OCUPADAS').value, 5);
  assert.equal(o.windows.HOY.kpi_row.find((x) => x.key === 'CONFIRMADAS').value, 1);
  const o2 = buildOps({ bookings: norm([casa, otherBookings()[0]]), asOf: '2026-10-11' });
  assert.equal(o2.windows.HOY.kpi_row.find((x) => x.key === 'OCUPADAS').value, 5);
  assert.ok(o2.answers.sobreventas.some((s) => s.room === '201'));
});

test('continuaciones sin enlace se avisan, no se fusionan; reserva sin habitación y etiqueta huérfana se reportan', () => {
  const a = { id: 1, roomId: 740215, status: 'confirmed', arrival: '2026-12-01', departure: '2026-12-03', firstName: 'Eva', lastName: 'Sola', price: 1 };
  const b = { id: 2, roomId: 740217, status: 'confirmed', arrival: '2026-12-03', departure: '2026-12-05', firstName: 'Eva', lastName: 'Sola', price: 1 };
  const c = { id: 3, roomId: 999999, status: 'confirmed', arrival: '2026-12-01', departure: '2026-12-02', firstName: 'X', lastName: 'Y', price: 1 };
  const d = { id: 4, roomId: 740219, status: 'confirmed', arrival: '2026-12-01', departure: '2026-12-02', firstName: 'Z', lastName: 'W', price: 1, notes: 'ATH-STAY-NOEXISTE-001' };
  const { stays, anomalies } = consolidateStays({ bookings: norm([a, b, c, d]), asOf: '2026-12-01' });
  assert.equal(stays.length, 3);
  const codes = anomalies.map((x) => x.code);
  assert.ok(codes.includes('POSIBLE_CONTINUACION'));
  assert.ok(codes.includes('RESERVA_SIN_HABITACION'));
  assert.ok(codes.includes('MASTER_SIN_REGISTRO'));
});

test('registro con total que no coincide con los cargos genera TOTAL_DISCREPANCIA', () => {
  const reg = registryMedico(); reg[0].commercial.total_sale = 1000000; reg[0].commercial.nightly_rate = 1000000 / 21;
  const { anomalies } = consolidateStays({ bookings: norm(rawMedico()), registry: reg });
  assert.ok(anomalies.some((x) => x.code === 'TOTAL_DISCREPANCIA'));
});

test('adaptador: normaliza sin PII y detecta HOLD/estado', () => {
  const n = normalizeBeds24Booking({ ...rawMedico()[0], email: 'x@y.z', phone: '1' });
  assert.equal(JSON.stringify(n).includes('x@y.z'), false);
  assert.equal(n.unit, '203'); assert.equal(n.chargeTotal, 330000); assert.equal(n.payments[0].status, 'PAYMENT_REPORTED');
  assert.equal(normalizeBeds24Booking(otherBookings()[2]).status, 'HOLD');
  assert.equal(normalizeBeds24Booking(otherBookings()[3]).status, 'BLACKOUT');
});

test('SOLO LECTURA: el transporte rechaza escritura y rutas fuera de la lista; no filtra el token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([String(url), init.method]); return { ok: true, status: 200, json: async () => ({ data: [], pages: { nextPageExists: false } }) }; };
  const t = createReadOnlyTransport({ fetchImpl, token: 'SECRETO-NO-FILTRAR' });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await assert.rejects(() => t.request({ method, path: '/bookings' }), { code: 'BEDS24_WRITE_FORBIDDEN' });
  await assert.rejects(() => t.request({ path: '/bookings/delete' }), { code: 'BEDS24_PATH_NOT_ALLOWED' });
  await assert.rejects(() => t.request({ path: '/authentication/token' }), { code: 'BEDS24_PATH_NOT_ALLOWED' });
  await assert.rejects(() => createReadOnlyTransport({ fetchImpl }).request({ path: '/bookings' }), { code: 'BEDS24_TOKEN_MISSING' });
  const client = new Beds24ReadOnlyClient({ transport: t });
  assert.deepEqual(await client.listBookings({ from: '2026-10-01', to: '2026-10-31' }), []);
  assert.ok(calls.length === 1 && calls.every(([, m]) => m === 'GET'));
  assert.ok(calls[0][0].includes('propertyId=359051'));
  assert.throws(() => new Beds24ReadOnlyClient({ transport: { request() {} } }), { code: 'READ_ONLY_TRANSPORT_REQUIRED' });
  const boom = createReadOnlyTransport({ fetchImpl: async () => { throw new Error('SECRETO-NO-FILTRAR'); }, token: 'x' });
  await assert.rejects(() => boom.request({ path: '/bookings' }), (e) => e.code === 'BEDS24_NETWORK_ERROR' && !e.message.includes('SECRETO'));
});

test('paginación de lectura y tope de páginas', async () => {
  let n = 0;
  const t = { readOnly: true, request: async () => { n += 1; return { data: [{ id: n }], pages: { nextPageExists: n < 3 } }; } };
  assert.equal((await new Beds24ReadOnlyClient({ transport: t }).listBookings({ from: 'a', to: 'b' })).length, 3);
  const inf = { readOnly: true, request: async () => ({ data: [], pages: { nextPageExists: true } }) };
  await assert.rejects(() => new Beds24ReadOnlyClient({ transport: inf, maxPages: 2 }).listBookings({}), { code: 'BEDS24_TOO_MANY_PAGES' });
});

test('el código de src/ops no contiene métodos de escritura HTTP', () => {
  for (const f of fs.readdirSync(new URL('../src/ops/', import.meta.url))) {
    const src = fs.readFileSync(new URL(`../src/ops/${f}`, import.meta.url), 'utf8');
    assert.equal(/method:\s*['"](POST|PUT|PATCH|DELETE)/i.test(src), false, f);
  }
});

test('HTML: renderiza el tablero, escapa texto y muestra las preguntas de Ángela', () => {
  const html = renderDashboardHtml(ops('2026-10-12', { confirmedPayments: ledgerFirstPaid() }, [...rawMedico(), ...otherBookings(), { id: 7, roomId: 740215, status: 'confirmed', arrival: '2026-11-20', departure: '2026-11-21', firstName: '<script>x</script>', lastName: '', price: 1 }]));
  assert.match(html, /CENTRO DE OPERACIONES ATHERON/);
  for (const k of ['DISPONIBLES', 'OCUPADAS', 'HOLD', 'BLOQUEADAS', 'LLEGADAS', 'SALIDAS', 'CONFIRMADAS', 'SALDO PENDIENTE']) assert.ok(html.includes(k), k);
  assert.ok(html.includes('ATH-STAY-MEDICO-OCT2026-001'));
  assert.ok(html.includes('577.500'));
  assert.equal(html.includes('<script>x'), false);
  assert.match(html, /ROOM_MOVE/);
});

// ---- ATH-OPS-DASHBOARD-002: cifras reales del médico informadas por dirección (ids y totales de Beds24) ----
import { inventoryFields, missingExpectedFields } from '../src/ops/field-probe.mjs';
import { spawnSync } from 'node:child_process';

const realShape = () => ({
  raw: [
    { id: 94515854, roomId: 740218, status: 'confirmed', arrival: '2026-10-11', departure: '2026-10-17', firstName: 'Dr. Piloto', lastName: 'Sintético', price: 385000, notes: STAY },
    { id: 94517233, roomId: 740220, status: 'confirmed', arrival: '2026-10-18', departure: '2026-11-01', firstName: 'Dr. Piloto', lastName: 'Sintético', price: 770000, notes: STAY },
  ],
  registry: [{ ref: STAY, guest: 'Dr. Piloto Sintético', source: 'DIRECT', commercial: { nights: 21, nightly_rate: 55000, total_sale: 1155000 },
    members: [{ kind: 'BEDS24', bookingId: '94515854' }, { kind: 'EXTERNAL', label: 'Otra propiedad', checkin: '2026-10-17', checkout: '2026-10-18', charge: 0 }, { kind: 'BEDS24', bookingId: '94517233' }],
    payment_plan: [{ seq: 1, amount: 577500, due_date: '2026-10-19' }, { seq: 2, amount: 577500, due_date: null }] }],
});

test('cifras reales del médico: 385.000 + 770.000 = 1.155.000 (la noche externa va dentro de #94515854), sin avisos', () => {
  const { raw, registry } = realShape();
  const o = buildOps({ bookings: raw.map((r) => normalizeBeds24Booking(r)), registry, asOf: '2026-10-12' });
  const s = o.stays[0];
  assert.equal(o.stays.length, 1);
  assert.deepEqual(s.booking_ids, ['94515854', '94517233']);
  assert.equal(s.total_sale, 1155000); assert.equal(s.payment_confirmed, 0); assert.equal(s.balance, 1155000);
  assert.equal(s.total_nights, 21);
  assert.deepEqual(o.anomalies, []);
  assert.equal([s.current_room, s.next_room, s.next_move_date, s.next_payment_amount, s.next_payment_date].join('|'), '203|EXTERNO|2026-10-17|577500|2026-10-19');
});

test('inventario de campos: nombres y tipos, nunca valores; reporta los esperados que faltan', () => {
  const inv = inventoryFields([{ id: 1, roomId: 2, firstName: 'Secreto', invoiceItems: [{ id: 9, type: 'payment', amount: 5 }] }]);
  assert.equal(JSON.stringify(inv).includes('Secreto'), false);
  assert.deepEqual(inv.booking_fields.id.types, ['number']);
  assert.ok(inv.invoice_item_fields.type);
  assert.ok(missingExpectedFields(inv).includes('arrival'));
});

test('sonda real sin BEDS24_TOKEN: sale con código 3 e indica la variable, sin red', () => {
  const env = { ...process.env }; delete env.BEDS24_TOKEN;
  const r = spawnSync(process.execPath, [new URL('../scripts/ops-beds24-probe.mjs', import.meta.url).pathname], { env, encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /BEDS24_TOKEN/);
});
