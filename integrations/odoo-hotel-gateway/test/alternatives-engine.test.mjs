import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAccommodationAlternatives, CASA_COMPLETA } from '../src/alternatives-engine.mjs';

function availabilityFixture(unavailableUnits) {
  return (unit) => !unavailableUnits.includes(unit);
}

test('1. unidad solicitada disponible -> no ofrece alternativas', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: availabilityFixture([]) },
  );
  assert.deepEqual(result, { requested_unit: '201', requested_available: true, alternatives: [] });
});

test('2. 201 ocupada, 202 disponible -> alternativa unica', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: availabilityFixture(['201', '203', '301', '302']) },
  );
  assert.equal(result.requested_available, false);
  assert.deepEqual(result.alternatives, [{ unit: '202', capacity: 4 }]);
});

test('3. 201 ocupada, varias habitaciones libres -> varias alternativas', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: availabilityFixture(['201']) },
  );
  assert.equal(result.alternatives.length, 4);
  assert.deepEqual(result.alternatives.map((a) => a.unit).sort(), ['202', '203', '301', '302']);
});

test('4. ninguna habitacion disponible -> alternatives vacio', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: availabilityFixture(['201', '202', '203', '301', '302']) },
  );
  assert.deepEqual(result.alternatives, []);
});

test('5. Casa Completa no disponible -> nunca se ofrecen habitaciones sueltas como alternativa', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 12 },
    { checkAvailability: availabilityFixture([CASA_COMPLETA]) }, // todas las habitaciones "disponibles" a proposito
  );
  assert.equal(result.requested_available, false);
  assert.deepEqual(result.alternatives, []);
});

test('6. capacidad insuficiente: ninguna habitacion individual alcanza para 12 huespedes', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 12 },
    { checkAvailability: availabilityFixture(['201']) },
  );
  assert.deepEqual(result.alternatives, []);
});

test('el motor nunca genera texto comercial: siempre datos crudos (unit/capacity)', async () => {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { checkAvailability: availabilityFixture(['201']) },
  );
  for (const alt of result.alternatives) {
    assert.deepEqual(Object.keys(alt).sort(), ['capacity', 'unit']);
  }
});

test('unidad desconocida lanza error explicito', async () => {
  await assert.rejects(
    requestAccommodationAlternatives(
      { requestedUnit: 'UNIDAD-X', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
      { checkAvailability: availabilityFixture([]) },
    ),
    /UNKNOWN_UNIT/,
  );
});
