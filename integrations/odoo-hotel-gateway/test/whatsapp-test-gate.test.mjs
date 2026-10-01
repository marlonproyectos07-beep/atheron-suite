import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_011_TEST_MESSAGE, HOTEL_011_TEST_MESSAGE_2, isAuthorizedTestMessage } from '../src/whatsapp-test-gate.mjs';

const config = { allowedFrom: '+573001112233', phoneNumberId: '123456' };
const message = { from: '573001112233', phone_number_id: '123456', text: HOTEL_011_TEST_MESSAGE };

test('solo acepta texto exacto desde remitente y numero TEST autorizados', () => {
  assert.equal(isAuthorizedTestMessage([message], config), true);
  assert.equal(isAuthorizedTestMessage([{ ...message, from: '573009998877' }], config), false);
  assert.equal(isAuthorizedTestMessage([{ ...message, phone_number_id: '654321' }], config), false);
  assert.equal(isAuthorizedTestMessage([{ ...message, text: 'Quiero reservar' }], config), false);
  assert.equal(isAuthorizedTestMessage([message, message], config), false);
  assert.equal(isAuthorizedTestMessage([], config), false);
  assert.equal(isAuthorizedTestMessage([message], { ...config, allowedFrom: null }), false);
});

test('acepta la segunda frase TEST con trim, lowercase y espacios multiples', () => {
  assert.equal(isAuthorizedTestMessage([{ ...message, text: HOTEL_011_TEST_MESSAGE_2 }], config), true);
  assert.equal(isAuthorizedTestMessage([{ ...message, text: '  HOLA  QUIERO  CONSULTAR DISPONIBILIDAD PARA DOS PERSONAS EN HOTEL ATHERON SUITE PARA MAÑANA  ' }], config), true);
});

test('rechaza una frase distinta aunque consulte disponibilidad', () => {
  assert.equal(isAuthorizedTestMessage([{ ...message, text: 'Hola quiero consultar disponibilidad para tres personas en hotel Atheron suite para mañana' }], config), false);
});
