import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignature, verifySignature } from '../src/whatsapp-webhook-security.mjs';

const TEST_APP_SECRET = 'test-app-secret-not-real-never-meta'; // solo para probar el mecanismo, nunca el secreto real
const RAW_BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

test('computeSignature produce el formato real sha256=<hex>', () => {
  const sig = computeSignature(RAW_BODY, TEST_APP_SECRET);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
});

test('verifySignature acepta una firma correcta', () => {
  const sig = computeSignature(RAW_BODY, TEST_APP_SECRET);
  assert.equal(verifySignature(RAW_BODY, sig, TEST_APP_SECRET), true);
});

test('verifySignature rechaza una firma incorrecta (cuerpo alterado)', () => {
  const sig = computeSignature(RAW_BODY, TEST_APP_SECRET);
  const alteredBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'x' }] });
  assert.equal(verifySignature(alteredBody, sig, TEST_APP_SECRET), false);
});

test('verifySignature rechaza con el secreto equivocado', () => {
  const sig = computeSignature(RAW_BODY, TEST_APP_SECRET);
  assert.equal(verifySignature(RAW_BODY, sig, 'otro-secreto'), false);
});

test('verifySignature falla cerrado sin appSecret configurado -- nunca "valido por defecto"', () => {
  const sig = computeSignature(RAW_BODY, TEST_APP_SECRET);
  assert.equal(verifySignature(RAW_BODY, sig, undefined), false);
  assert.equal(verifySignature(RAW_BODY, sig, ''), false);
});

test('verifySignature falla cerrado sin cabecera de firma', () => {
  assert.equal(verifySignature(RAW_BODY, undefined, TEST_APP_SECRET), false);
  assert.equal(verifySignature(RAW_BODY, '', TEST_APP_SECRET), false);
});

test('verifySignature nunca lanza con una cabecera malformada (longitud distinta)', () => {
  assert.doesNotThrow(() => verifySignature(RAW_BODY, 'sha256=corta', TEST_APP_SECRET));
  assert.equal(verifySignature(RAW_BODY, 'sha256=corta', TEST_APP_SECRET), false);
});
