import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSEKEEPING_EVENT_TYPES, buildHousekeepingEvent } from '../src/housekeeping-events.mjs';

test('HOUSEKEEPING_EVENT_TYPES cubre exactamente los 5 eventos del flujo de HOTEL-012', () => {
  assert.deepEqual(HOUSEKEEPING_EVENT_TYPES, [
    'checkout_completed',
    'cleaning_started',
    'cleaning_finished',
    'ready_for_guest',
    'incident_reported',
  ]);
});

test('buildHousekeepingEvent arma el evento con traza obligatoria', () => {
  const event = buildHousekeepingEvent('checkout_completed', { unit: '201', correlation_id: 'c1' });
  assert.equal(event.type, 'checkout_completed');
  assert.equal(event.unit, '201');
  assert.equal(event.correlation_id, 'c1');
  assert.ok(typeof event.timestamp === 'string' && !Number.isNaN(Date.parse(event.timestamp)));
});

test('rechaza un tipo de evento no declarado', () => {
  assert.throws(() => buildHousekeepingEvent('evento_inventado', { unit: '201', correlation_id: 'c1' }));
});

test('exige unit y correlation_id', () => {
  assert.throws(() => buildHousekeepingEvent('cleaning_started', { unit: '201' }));
  assert.throws(() => buildHousekeepingEvent('cleaning_started', { correlation_id: 'c1' }));
});

test('nunca incluye datos sensibles por su cuenta: solo lo que el llamador pasa explicitamente en data', () => {
  const event = buildHousekeepingEvent('incident_reported', { unit: '201', correlation_id: 'c1' }, { category: 'ELECTRICIDAD' });
  assert.deepEqual(Object.keys(event).sort(), ['category', 'correlation_id', 'timestamp', 'type', 'unit']);
});
