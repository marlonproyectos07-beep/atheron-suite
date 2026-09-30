import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnitMappingRegistry } from '../src/unit-mapping.mjs';

test('resuelve un mapeo registrado por source+listingId', () => {
  const registry = new UnitMappingRegistry([
    { source: 'booking', listingId: 'abc', unitId: 'u1', propertyId: 'p1' },
  ]);
  const record = registry.resolve('booking', 'abc');
  assert.equal(record.unitId, 'u1');
});

test('devuelve null para un listing no mapeado (nunca inventa un mapeo)', () => {
  const registry = new UnitMappingRegistry([]);
  assert.equal(registry.resolve('booking', 'inexistente'), null);
});

test('rechaza mapeos duplicados para el mismo source+listingId', () => {
  assert.throws(
    () =>
      new UnitMappingRegistry([
        { source: 'airbnb', listingId: 'dup', unitId: 'u1', propertyId: 'p1' },
        { source: 'airbnb', listingId: 'dup', unitId: 'u2', propertyId: 'p1' },
      ]),
    (err) => err.code === 'MAPPING_DUPLICATE',
  );
});

test('rechaza una entrada sin los campos obligatorios', () => {
  assert.throws(
    () => new UnitMappingRegistry([{ source: 'airbnb', listingId: 'x' }]),
    (err) => err.code === 'MAPPING_INVALID_ENTRY',
  );
});

test('blockGroupFor devuelve [unitId] cuando no hay grupo explícito', () => {
  const registry = new UnitMappingRegistry([{ source: 'booking', listingId: 'x', unitId: 'u1', propertyId: 'p1' }]);
  assert.deepEqual(registry.blockGroupFor('u1'), ['u1']);
});

test('blockGroupFor devuelve el grupo completo para CASA COMPLETA', () => {
  const registry = new UnitMappingRegistry([
    { source: 'airbnb', listingId: 'casa', unitId: 'casa-completa', propertyId: 'p1', isCasaCompleta: true, blockGroup: ['casa-completa', 'r1', 'r2'] },
  ]);
  assert.deepEqual(registry.blockGroupFor('casa-completa'), ['casa-completa', 'r1', 'r2']);
});
