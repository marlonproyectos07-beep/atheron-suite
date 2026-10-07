import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEPTION_UNITS,
  STATUS,
  buildReceptionAvailability,
  classifyOption,
  dataUnavailableResult,
  validateReceptionQuery,
} from '../src/reception-availability.mjs';

const TODAY = '2026-10-06';
const QUERY = { checkin: '2027-03-01', checkout: '2027-03-03', guests: 2 };

const opcion = (unit_id, estado, extra = {}) => ({ unit_id, estado, nombre: `u${unit_id}`, capacidad_comercial: 4, motivos: [], ...extra });
const gatewayWith = (opciones) => ({ ok: true, correlation_id: 'c1', data: { ok: true, inventory_checked_at: '2026-10-06 13:00:00 UTC', opciones } });

test('la lista de unidades de recepción son seis, con ids de Odoo', () => {
  assert.deepEqual(RECEPTION_UNITS.map((u) => u.key), ['201', '202', '203', '301', '302', 'CASA_COMPLETA']);
  assert.deepEqual(RECEPTION_UNITS.map((u) => u.odooUnitId), ['1', '2', '3', '4', '5', '6']);
});

test('disponible con capacidad y sin motivos es DISPONIBLE', () => {
  assert.deepEqual(classifyOption(opcion(1, 'disponible', { capacidad_comercial: 2 })), { status: STATUS.DISPONIBLE, motivo: null, capacidad_comercial: 2 });
});

test('no_disponible es NO DISPONIBLE', () => {
  const r = classifyOption(opcion(4, 'no_disponible', { motivos: [{ tipo: 'reserva' }] }));
  assert.equal(r.status, STATUS.NO_DISPONIBLE);
  assert.equal(r.motivo, 'RESERVADA_O_BLOQUEADA');
});

test('capacidad_insuficiente es NO DISPONIBLE por capacidad', () => {
  const r = classifyOption(opcion(1, 'capacidad_insuficiente', { capacidad_comercial: 2 }));
  assert.equal(r.status, STATUS.NO_DISPONIBLE);
  assert.equal(r.motivo, 'CAPACIDAD_INSUFICIENTE');
  assert.equal(r.capacidad_comercial, 2);
});

test('requiere_aprobacion nunca es DISPONIBLE: VERIFICAR', () => {
  assert.equal(classifyOption(opcion(5, 'requiere_aprobacion', { capacidad_comercial: 3 })).status, STATUS.VERIFICAR);
});

test('estado desconocido es VERIFICAR, nunca LIBRE', () => {
  assert.equal(classifyOption(opcion(2, 'quizas')).status, STATUS.VERIFICAR);
  assert.equal(classifyOption(opcion(2, undefined)).status, STATUS.VERIFICAR);
});

test('disponible con motivos de bloqueo es inconsistente: VERIFICAR', () => {
  const r = classifyOption(opcion(3, 'disponible', { motivos: [{ tipo: 'reserva' }] }));
  assert.equal(r.status, STATUS.VERIFICAR);
  assert.equal(r.motivo, 'INCONSISTENCIA_MOTIVOS');
});

test('disponible sin capacidad recibida es VERIFICAR', () => {
  const r = classifyOption(opcion(3, 'disponible', { capacidad_comercial: undefined }));
  assert.equal(r.status, STATUS.VERIFICAR);
  assert.equal(r.motivo, 'CAPACIDAD_NO_RECIBIDA');
});

test('unidad ausente en la respuesta es VERIFICAR, nunca LIBRE', () => {
  assert.equal(classifyOption(undefined).status, STATUS.VERIFICAR);
});

test('construye las seis unidades y usa la capacidad del gateway, no un catálogo', () => {
  const res = gatewayWith([
    opcion(1, 'disponible', { capacidad_comercial: 2 }),
    opcion(2, 'disponible', { capacidad_comercial: 4 }),
    opcion(3, 'no_disponible', { capacidad_comercial: 4 }),
    opcion(4, 'disponible', { capacidad_comercial: 7 }),
    opcion(5, 'requiere_aprobacion', { capacidad_comercial: 3 }),
    opcion(6, 'disponible', { capacidad_comercial: 22 }),
  ]);
  const out = buildReceptionAvailability(res, QUERY);
  assert.equal(out.inventory_checked_at, '2026-10-06 13:00:00 UTC');
  assert.deepEqual(out.units.map((u) => [u.key, u.status]), [
    ['201', STATUS.DISPONIBLE],
    ['202', STATUS.DISPONIBLE],
    ['203', STATUS.NO_DISPONIBLE],
    ['301', STATUS.DISPONIBLE],
    ['302', STATUS.VERIFICAR],
    ['CASA_COMPLETA', STATUS.DISPONIBLE],
  ]);
  assert.equal(out.units.find((u) => u.key === '301').capacidad_comercial, 7);
  assert.equal(out.units.find((u) => u.key === 'CASA_COMPLETA').capacidad_comercial, 22);
});

test('ignora unidades de otras propiedades (p. ej. 101 Colonial Confort, Casa Algarra)', () => {
  const res = gatewayWith([opcion(36, 'no_disponible'), opcion(7, 'no_disponible'), opcion(8, 'no_disponible'), opcion(1, 'disponible', { capacidad_comercial: 2 })]);
  const out = buildReceptionAvailability(res, QUERY);
  assert.equal(out.units.length, 6);
  assert.equal(out.units.find((u) => u.key === '201').status, STATUS.DISPONIBLE);
  assert.equal(out.units.find((u) => u.key === '202').status, STATUS.VERIFICAR);
});

test('respuesta del gateway sin opciones deja todas las unidades en VERIFICAR, nunca LIBRE', () => {
  const out = buildReceptionAvailability({ ok: true, data: {} }, QUERY);
  assert.ok(out.units.every((u) => u.status === STATUS.VERIFICAR));
});

test('fallo del gateway marca todo como VERIFICAR DISPONIBILIDAD, nunca LIBRE', () => {
  const out = dataUnavailableResult(QUERY);
  assert.equal(out.units.length, 6);
  assert.ok(out.units.every((u) => u.status === STATUS.VERIFICAR));
  assert.ok(out.units.every((u) => u.status !== STATUS.DISPONIBLE));
  assert.equal(out.inventory_checked_at, null);
});

test('valida fechas: salida posterior, no pasado, máximo de noches, huéspedes', () => {
  assert.equal(validateReceptionQuery({ ...QUERY, todayIso: TODAY }).guests, 2);
  assert.equal(validateReceptionQuery({ checkin: '2026-10-07', checkout: '2026-10-07', guests: 2, todayIso: TODAY }).error, 'CHECKOUT_MUST_BE_AFTER_CHECKIN');
  assert.equal(validateReceptionQuery({ checkin: '2026-10-01', checkout: '2026-10-03', guests: 2, todayIso: TODAY }).error, 'CHECKIN_IN_PAST');
  assert.equal(validateReceptionQuery({ checkin: '2027-01-01', checkout: '2027-04-01', guests: 2, todayIso: TODAY }).error, 'TOO_MANY_NIGHTS');
  assert.equal(validateReceptionQuery({ ...QUERY, guests: 0, todayIso: TODAY }).error, 'INVALID_GUESTS');
  assert.equal(validateReceptionQuery({ ...QUERY, guests: 61, todayIso: TODAY }).error, 'INVALID_GUESTS');
  assert.equal(validateReceptionQuery({ checkin: 'mañana', checkout: '2027-03-03', guests: 2, todayIso: TODAY }).error, 'INVALID_CHECKIN');
});

test('acepta casa de 22 huéspedes (el límite lo decide el gateway, no esta función)', () => {
  assert.equal(validateReceptionQuery({ ...QUERY, guests: 22, todayIso: TODAY }).guests, 22);
});
