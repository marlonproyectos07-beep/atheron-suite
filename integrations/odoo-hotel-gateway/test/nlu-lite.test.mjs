import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, toEngineInput } from '../src/nlu-lite.mjs';

const HOY = '2026-12-01'; // martes, para fijar los calculos de dia de semana

test('"Hola necesito una habitacion manana" -> fecha resuelta, huespedes ausente sin inventarse', () => {
  const slots = parseMessage('Hola necesito una habitación mañana', { referenceDate: HOY });
  assert.equal(slots.intent, 'availability_inquiry');
  assert.equal(slots.check_in, '2026-12-02');
  assert.equal(slots.guests, null);
  assert.ok(slots.missing_fields.includes('guests'));
  assert.ok(slots.missing_fields.includes('check_out'));
});

test('"Somos 4" -> guests=4, sin inventar fechas', () => {
  const slots = parseMessage('Somos 4', { referenceDate: HOY });
  assert.equal(slots.guests, 4);
  assert.equal(slots.check_in, null);
});

test('"Del viernes al domingo" -> resuelve ambas fechas relativas a referenceDate', () => {
  const slots = parseMessage('Del viernes al domingo', { referenceDate: HOY });
  assert.equal(slots.check_in, '2026-12-04'); // viernes siguiente a martes 1
  assert.equal(slots.check_out, '2026-12-06'); // domingo siguiente
});

test('"Cuanto vale?" -> intent ask_price', () => {
  assert.equal(parseMessage('¿Cuánto vale?', { referenceDate: HOY }).intent, 'ask_price');
});

test('"Tienes algo mas barato?" -> intent request_alternatives, no request_discount', () => {
  assert.equal(parseMessage('¿Tienes algo más barato?', { referenceDate: HOY }).intent, 'request_alternatives');
});

test('"Quiero reservar" -> intent request_booking', () => {
  assert.equal(parseMessage('Quiero reservar', { referenceDate: HOY }).intent, 'request_booking');
});

test('"Somos 7, no 5" -> se queda con el ultimo numero (correccion del cliente)', () => {
  const slots = parseMessage('Somos 7, no 5', { referenceDate: HOY });
  assert.equal(slots.guests, 7);
  assert.equal(slots.intent, 'update_guests');
});

test('"Cambiamela para el sabado" -> intent change_dates con la nueva fecha resuelta', () => {
  const slots = parseMessage('Cámbiamela para el sábado', { referenceDate: HOY });
  assert.equal(slots.intent, 'change_dates');
  assert.equal(slots.check_in, '2026-12-05');
});

test('"Me haces descuento?" -> intent request_discount', () => {
  assert.equal(parseMessage('¿Me haces descuento?', { referenceDate: HOY }).intent, 'request_discount');
});

test('"Quiero cancelar" -> intent request_cancellation', () => {
  assert.equal(parseMessage('Quiero cancelar', { referenceDate: HOY }).intent, 'request_cancellation');
});

test('"Necesito hablar con alguien" -> intent human_request', () => {
  assert.equal(parseMessage('Necesito hablar con alguien', { referenceDate: HOY }).intent, 'human_request');
});

test('mensaje sin ningun patron reconocible -> needs_clarification, nunca se inventa una intencion', () => {
  const slots = parseMessage('xkjhsdf asdkjashd', { referenceDate: HOY });
  assert.equal(slots.intent, 'needs_clarification');
  assert.equal(slots.confidence, 'low');
});

test('toEngineInput traduce ask_price al shape que espera advanceConversation', () => {
  const slots = parseMessage('¿Cuánto vale?', { referenceDate: HOY });
  const input = toEngineInput(slots);
  assert.equal(input.askPrice, true);
  assert.equal(input.requestDiscount, undefined);
});

test('toEngineInput nunca pone una fecha/huespedes que la NLU no resolvio (undefined, no null ni inventado)', () => {
  const slots = parseMessage('Quiero reservar', { referenceDate: HOY });
  const input = toEngineInput(slots);
  assert.equal(input.checkIn, undefined);
  assert.equal(input.guests, undefined);
  assert.equal(input.requestBooking, true);
});
