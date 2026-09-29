import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sofiaAvailabilityQuery, presentAvailabilityMessage } from '../src/sofia-adapter.mjs';

test('sofiaAvailabilityQuery: unidad disponible -> datos crudos, sin alternativas', async () => {
  const result = await sofiaAvailabilityQuery(
    { unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: () => true },
  );
  assert.deepEqual(result, { requested_unit: '201', available: true, alternatives: [] });
});

test('sofiaAvailabilityQuery: 201 no disponible -> trae alternativas reales (ejemplo del prompt)', async () => {
  const checkAvailability = (unit) => unit !== '201';
  const result = await sofiaAvailabilityQuery(
    { unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability },
  );
  assert.equal(result.requested_unit, '201');
  assert.equal(result.available, false);
  assert.ok(result.alternatives.length > 0);
});

test('presentAvailabilityMessage separa datos de texto comercial (la funcion de datos no genera texto)', async () => {
  const dataResult = await sofiaAvailabilityQuery(
    { unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: (unit) => unit !== '201' },
  );
  const message = presentAvailabilityMessage(dataResult);
  assert.equal(typeof message, 'string');
  assert.match(message, /no est.? disponible/i);
  assert.doesNotMatch(message, /"alternatives"|\[object/); // nunca expone estructura interna, solo texto
});
