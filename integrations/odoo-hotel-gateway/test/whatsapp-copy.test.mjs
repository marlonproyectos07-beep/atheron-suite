import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentOptions, presentPrice, holdCreated, WHATSAPP_COPY } from '../src/whatsapp-copy.mjs';

test('presentOptions nunca inventa una opcion cuando la lista viene vacia', () => {
  const msg = presentOptions([]);
  assert.match(msg, /no tengo disponibilidad/i);
});

test('presentOptions redacta exactamente las unidades recibidas, ninguna otra', () => {
  const msg = presentOptions([{ unit: '201', capacity: 4 }]);
  assert.match(msg, /201/);
  assert.doesNotMatch(msg, /302/);
});

test('presentPrice usa el total recibido tal cual, nunca calcula uno propio', () => {
  const msg = presentPrice({ unit: '201', total: 220000 });
  assert.match(msg, /220[.,]000|220000/);
});

test('holdCreated nunca afirma una reserva CONFIRMADA, solo temporal/pendiente', () => {
  const msg = holdCreated({ holdId: 'H-1' });
  assert.doesNotMatch(msg, /confirmada/i);
  assert.match(msg, /temporal/i);
});

test('todos los mensajes son cortos (menos de 220 caracteres), nada tipo robot', () => {
  const args = {
    greeting: [],
    askDates: [],
    askGuests: [],
    presentOptions: [[{ unit: '201', capacity: 4 }]],
    presentPrice: [{ unit: '201', total: 220000 }],
    askGuestName: [],
    preparingHold: [],
    holdCreated: [{ holdId: 'H-1' }],
    escalateToHuman: [],
    temporaryError: [],
    farewell: [],
  };
  for (const [name, fn] of Object.entries(WHATSAPP_COPY)) {
    const sample = fn(...(args[name] ?? []));
    assert.ok(sample.length < 220, `${name} demasiado largo: ${sample.length} chars`);
  }
});
