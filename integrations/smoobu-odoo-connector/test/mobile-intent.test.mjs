import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilotInbox } from '../src/mobile-intent.mjs';
const valid = { operationKey:'sample-001-2026', type:'PROPONER_RESERVA', source:'CHATGPT', room:'301', arrival:'2026-11-10', departure:'2026-11-11', amountCOP:80000 };
test('ChatGPT y Claude reutilizan la misma propuesta, no dos registros', () => {
  const inbox = createPilotInbox();
  const one = inbox.receive(valid);
  const two = inbox.receive({ ...valid, source:'CLAUDE' });
  assert.equal(one.status, 'PROPUESTA_NO_EJECUTADA');
  assert.equal(two.status, 'PROPUESTA_EXISTENTE');
  assert.equal(one.reference, two.reference);
  assert.equal(inbox.count(), 1);
  assert.equal(one.writes + two.writes, 0);
});
test('Misma llave con precio diferente se bloquea', () => {
  const inbox = createPilotInbox();
  inbox.receive(valid);
  assert.equal(inbox.receive({...valid, source:'CLAUDE', amountCOP:90000}).status, 'CONFLICTO_CLAVE');
  assert.equal(inbox.count(), 1);
});
test('No permite precios vacios ni una fecha invalida', () => {
  const inbox = createPilotInbox();
  assert.equal(inbox.receive({ ...valid, amountCOP: 0 }).status, 'RECHAZADA');
  assert.equal(inbox.receive({ ...valid, departure:'2026-11-09' }).status, 'RECHAZADA');
  assert.equal(inbox.count(), 0);
});
