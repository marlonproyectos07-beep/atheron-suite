import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRA_CATALOG_UNVERIFIED, buildPayload, confirmedCost, reasonStatus } from '../src/sire-tra/tra-emitter.mjs';
import { ACLS, FIELDS, MODELS, SERVER_ACTIONS } from '../src/sire-tra/manifest.mjs';

// ATH-HOTELS-SIRE-TRA-001 · importe pagado confirmado, nombre TRA y motivo. Datos sinteticos.
const EST = { x_name: 'Nombre interno', x_tra_establishment_name: 'Nombre RNT', x_rnt_number: '999999', x_tra_accommodation_type: 'Casa', x_tra_cost_basis: 'total_estancia' };
const ORDER = { x_checkout: '2026-11-19', amount_total: 65000 };
const TODAY = '2026-11-18';
const A = (extra = {}) => ({ id: 1, x_state: 'confirmado', x_amount: 65000, x_currency_id: [8, 'COP'], x_cutoff_date: '2026-11-18', x_evidence_kind: 'comprobante_pago', x_evidence_ref: 'REF', x_evidence_name: 'c.pdf', x_confirmed_by: [2, 'u'], x_confirmed_at: '2026-11-18 15:00:00', write_date: '2026-11-18 15:00:00', ...extra });
const cc = (amounts, est = EST, today = TODAY) => confirmedCost({ amounts, est, order: ORDER, today });
const line = { x_is_main: true, doc_code: 'national_citizen_id', x_identity_number: '1', x_given_names: 'N', x_surname_1: 'A', x_residence_city_id: [1, 'C'], x_origin_city_id: [2, 'O'], x_tra_room: '203', x_arrived_at: '2026-11-18 20:00:00', x_travel_reason: 'Vacaciones' };
const CAT = { ...TRA_CATALOG_UNVERIFIED, reasons: { Vacaciones: 'Vacaciones' } };

test('importe confirmado distinto de la tarifa: se usa lo pagado y se marca la diferencia', () => {
  const r = cc([A({ x_amount: 58500 })]);
  assert.equal(r.ok, true);
  assert.equal(r.value, '58500');
  assert.equal(r.differsFromRate, true);
  assert.equal(r.rate, 65000);
  assert.equal(cc([A()]).differsFromRate, false);
});

test('sin importe confirmado: falta el dato y el payload no lleva costo (nunca la tarifa)', () => {
  for (const [amounts, code] of [[[], 'IMPORTE_AUSENTE'], [[A({ x_state: false })], 'IMPORTE_SIN_CONFIRMAR'], [[A({ x_state: 'borrador' })], 'IMPORTE_SIN_CONFIRMAR']]) {
    const cost = cc(amounts);
    assert.equal(cost.code, code);
    const { payload, missing, invalid } = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost });
    assert.equal(payload.costo, '');
    assert.ok(missing.includes('costo'));
    assert.ok(!invalid.includes('costo'));
  }
  const { payload } = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0 });
  assert.equal(payload.costo, '', 'sin fuente confirmada no hay costo aunque exista amount_total');
});

test('pago sin respaldo o con datos no admitidos: bloqueado como dato invalido', () => {
  const cases = [
    [A({ x_evidence_ref: '' }), 'IMPORTE_SIN_EVIDENCIA'],
    [A({ x_evidence_name: '' }), 'IMPORTE_SIN_EVIDENCIA'],
    [A({ x_evidence_kind: 'reporte_smoobu' }), 'IMPORTE_SIN_EVIDENCIA'],
    [A({ x_confirmed_by: false }), 'IMPORTE_SIN_CONFIRMACION_REGISTRADA'],
    [A({ write_date: '2026-11-18 16:00:00' }), 'IMPORTE_MODIFICADO_TRAS_CONFIRMAR'],
    [A({ x_currency_id: [2, 'USD'] }), 'IMPORTE_MONEDA_NO_COP'],
    [A({ x_currency_id: false }), 'IMPORTE_MONEDA_NO_COP'],
    [A({ x_cutoff_date: false }), 'IMPORTE_SIN_FECHA_CORTE'],
    [A({ x_cutoff_date: '2026-11-19' }), 'IMPORTE_FECHA_CORTE_FUTURA'],
    [A({ x_amount: 0 }), 'IMPORTE_INVALIDO'],
    [A({ x_amount: -5 }), 'IMPORTE_INVALIDO'],
  ];
  for (const [a, code] of cases) {
    const cost = cc([a]);
    assert.equal(cost.code, code, code);
    const { payload, missing, invalid } = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost });
    assert.equal(payload.costo, '');
    assert.ok(invalid.includes('costo') && !missing.includes('costo'), code);
  }
  assert.equal(cc([A(), A({ id: 2 })]).code, 'IMPORTE_AMBIGUO');
  assert.equal(cc([A()], { ...EST, x_tra_cost_basis: 'por_noche' }).code, 'COSTO_BASE_NO_ADMITIDA');
  assert.equal(confirmedCost({ amounts: [A()], est: EST, order: ORDER, today: undefined }).code, 'IMPORTE_FECHA_CORTE_FUTURA', 'sin fecha de hoy no se acepta el corte');
});

test('nombre enviado a TRA: el del registro oficial, nunca el nombre interno', () => {
  const cost = cc([A()]);
  assert.equal(buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost }).payload.nombre_establecimiento, 'Nombre RNT');
  const r = buildPayload({ line, main: true, order: ORDER, est: { ...EST, x_tra_establishment_name: '  ' }, catalog: CAT, companions: 0, cost });
  assert.equal(r.payload.nombre_establecimiento, '');
  assert.ok(r.missing.includes('nombre_establecimiento'));
});

test('motivo: solo la equivalencia verificada del texto declarado; la propuesta no se envia', () => {
  const cat = { ...CAT, reasons: {}, reasonsProposed: { 'Vacaciones, recreación u ocio': 'Vacaciones, recreo y ocio' } };
  const l = { ...line, x_travel_reason: 'Vacaciones, recreación u ocio' };
  assert.equal(reasonStatus(l, cat), 'MOTIVO_EQUIVALENCIA_NO_VERIFICADA');
  assert.equal(buildPayload({ line: l, main: true, order: ORDER, est: EST, catalog: cat, companions: 0, cost: cc([A()]) }).payload.motivo, '');
  assert.equal(reasonStatus({ ...line, x_travel_reason: '' }, cat), 'MOTIVO_NO_DECLARADO');
  assert.equal(reasonStatus({ ...line, x_travel_reason: 'Otro texto' }, cat), 'MOTIVO_SIN_EQUIVALENCIA');
  assert.equal(reasonStatus(line, CAT), 'OK');
  for (const k of ['constructor', 'toString', '__proto__']) {
    assert.equal(buildPayload({ line: { ...line, x_travel_reason: k }, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost: cc([A()]) }).payload.motivo, '', k);
  }
});

test('catalogo del repositorio: sin verificar, sin equivalencias de envio y con propuestas documentadas con fuente', () => {
  const cat = JSON.parse(readFileSync(new URL('../tra-catalog.json', import.meta.url), 'utf8'));
  assert.equal(cat.verified, false);
  assert.deepEqual(cat.reasons, {});
  const proposed = Object.keys(cat.reasonsProposed || {});
  assert.ok(proposed.length > 0);
  for (const k of proposed) assert.ok(cat._fuentesMotivo?.[k], `fuente de la propuesta ${k}`);
});

test('manifiesto: x_tra_amount con evidencia, moneda y corte; confirmar exige todo y no toca contabilidad', () => {
  assert.ok(MODELS.some((m) => m.model === 'x_tra_amount'));
  const f = new Set(FIELDS.filter((x) => x[0] === 'x_tra_amount').map((x) => x[1]));
  for (const k of ['x_sale_order_id', 'x_amount', 'x_currency_id', 'x_cutoff_date', 'x_evidence_kind', 'x_evidence_ref', 'x_evidence', 'x_evidence_name', 'x_state', 'x_confirmed_by', 'x_confirmed_at']) assert.ok(f.has(k), k);
  assert.ok(FIELDS.some((x) => x[0] === 'x_establishment' && x[1] === 'x_tra_establishment_name'));
  const user = ACLS.find((a) => a.model === 'x_tra_amount' && a.group === 'base.group_user');
  assert.deepEqual(user.perms, [1, 0, 1, 0], 'el usuario no edita ni borra; confirma por la accion');
  const code = SERVER_ACTIONS.find((s) => s.xmlid === 'sa_amount_confirm').code;
  for (const needle of ["x_currency_id.name != 'COP'", 'x_cutoff_date > today', 'r.x_evidence', "('x_state', '=', 'confirmado')", 'x_confirmed_by', 'x_confirmed_at']) assert.ok(code.includes(needle), needle);
  for (const s of SERVER_ACTIONS.filter((x) => x.model === 'x_tra_amount')) assert.ok(!/account\.(move|payment)|sale\.order'\]\.(write|create)/.test(s.code), `${s.xmlid} no toca contabilidad ni pedidos`);
});
