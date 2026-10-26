import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { canonicalQuery, canonicalString, hmacHeaders, HEADER_NAMES } from '../src/smoobu-hmac.mjs';

const SECRET = 'TEST-SECRET-FICTICIO';

test('query canonica ordenada y codificada', () => {
  assert.equal(canonicalQuery({ b: 'x y', a: 1, z: undefined }), 'a=1&b=x%20y');
});

test('firma coincide con calculo independiente', () => {
  const h = hmacHeaders({ keyId: 'kid', secret: SECRET, method: 'get', path: '/api/apartments', query: { page: 1 }, now: 1_700_000_000_000, nonce: 'n1' });
  const canon = ['GET', '/api/apartments', 'page=1', createHash('sha256').update('').digest('hex'), '1700000000', 'n1'].join('\n');
  assert.equal(h[HEADER_NAMES.signature], createHmac('sha256', SECRET).update(canon).digest('hex'));
  assert.equal(h[HEADER_NAMES.timestamp], '1700000000');
});

test('cambiar metodo, path, query, cuerpo o secreto cambia la firma', () => {
  const base = { keyId: 'k', secret: SECRET, method: 'GET', path: '/a', query: {}, now: 1000, nonce: 'n' };
  const sig = (o) => hmacHeaders({ ...base, ...o })[HEADER_NAMES.signature];
  const ref = sig({});
  for (const o of [{ method: 'POST' }, { path: '/b' }, { query: { q: 1 } }, { body: 'x' }, { secret: 'otro' }, { nonce: 'm' }, { now: 2000 }]) {
    assert.notEqual(sig(o), ref);
  }
});

test('el secreto nunca aparece en las cabeceras', () => {
  const h = hmacHeaders({ keyId: 'k', secret: SECRET, method: 'GET', path: '/a' });
  assert.ok(!JSON.stringify(h).includes(SECRET));
  assert.ok(canonicalString({ method: 'get', path: '/a', timestamp: 1, nonce: 'n' }).startsWith('GET\n/a\n'));
});
