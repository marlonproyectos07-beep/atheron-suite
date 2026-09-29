import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOpciones, unitAvailability } from '../src/gateway-response-utils.mjs';

// Forma real, confirmada contra el Gateway real (ATH-ODOO-HOTEL-008): el
// sobre HTTP envuelve el envelope propio del adapter.
const REAL_SHAPE = {
  ok: true,
  correlation_id: 'x',
  query_id: null,
  data: {
    ok: true,
    op: 'availability',
    data: {
      opciones: [
        { unit_id: 1, nombre: '201', estado: 'disponible' },
        { unit_id: 2, nombre: '202', estado: 'no_disponible' },
      ],
    },
  },
};

test('findOpciones encuentra el arreglo aunque este doblemente anidado (forma real)', () => {
  assert.equal(findOpciones(REAL_SHAPE).length, 2);
});

test('findOpciones tambien funciona con un solo nivel de anidamiento (fixture/dry-run)', () => {
  assert.equal(findOpciones({ data: { opciones: [{ unit_id: 1 }] } }).length, 1);
});

test('findOpciones tambien reconoce `units` (forma de fixture dry-run existente)', () => {
  assert.equal(findOpciones({ data: { units: [{ unit_id: 1, available: true }] } }).length, 1);
});

test('findOpciones nunca inventa datos: sin arreglo en ningun nivel, devuelve []', () => {
  assert.deepEqual(findOpciones({ ok: true, data: { ok: true } }), []);
  assert.deepEqual(findOpciones(null), []);
  assert.deepEqual(findOpciones('no es un objeto'), []);
});

test('unitAvailability: disponible/no_disponible via estado', () => {
  const opciones = findOpciones(REAL_SHAPE);
  assert.equal(unitAvailability(opciones, 1), true);
  assert.equal(unitAvailability(opciones, 2), false);
});

test('unitAvailability: soporta forma de fixture con `available` booleano directo', () => {
  const opciones = [{ unit_id: 1, available: true }, { unit_id: 2, available: false }];
  assert.equal(unitAvailability(opciones, 1), true);
  assert.equal(unitAvailability(opciones, 2), false);
});

test('unitAvailability: unidad no encontrada -> null, nunca se asume true ni false por defecto', () => {
  assert.equal(unitAvailability(findOpciones(REAL_SHAPE), 999), null);
});
