import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { canonicalQuery, canonicalString, hmacHeaders, isoTimestamp, EMPTY_BODY_HASH, HEADER_NAMES } from '../src/smoobu-hmac.mjs';

const SECRET = 'TEST-SECRET-FICTICIO';
const KEY = 'TEST-KEY-FICTICIA';

test('las cuatro cabeceras son X-API-Key, X-Timestamp, X-Nonce, X-Signature', () => {
  assert.deepEqual(Object.values(HEADER_NAMES), ['X-API-Key', 'X-Timestamp', 'X-Nonce', 'X-Signature']);
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'GET', path: '/api/apartments' });
  assert.deepEqual(Object.keys(h).sort(), ['X-API-Key', 'X-Nonce', 'X-Signature', 'X-Timestamp']);
  assert.match(h['X-Nonce'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(h['X-Timestamp'], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('timestamp ISO UTC sin milisegundos', () => assert.equal(isoTimestamp(1_700_000_000_123), '2023-11-14T22:13:20Z'));

test('query ordenada por clave, codificada; vacia si no hay', () => {
  assert.equal(canonicalQuery({ to: '2026-02-01', from: '2026-01-01', z: undefined }), 'from=2026-01-01&to=2026-02-01');
  assert.equal(canonicalQuery({ b: 'x y', a: 1 }), 'a=1&b=x%20y');
  assert.equal(canonicalQuery({}), '');
});

test('cadena canonica: METHOD, PATH, QUERY, TIMESTAMP, NONCE, SHA256 hex del cuerpo, API_KEY', () => {
  const c = canonicalString({ method: 'get', path: '/api/reservations', query: { to: 'b', from: 'a' }, timestamp: 'T', nonce: 'N', apiKey: KEY });
  assert.equal(c, ['GET', '/api/reservations', 'from=a&to=b', 'T', 'N', EMPTY_BODY_HASH, KEY].join('\n'));
  assert.equal(EMPTY_BODY_HASH, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('vector fijo: firma Base64 coincide con calculo independiente (GET)', () => {
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'GET', path: '/api/reservations', query: { to: '2026-02-01', from: '2026-01-01' }, now: 1_700_000_000_000, nonce: '11111111-1111-4111-8111-111111111111' });
  const canon = ['GET', '/api/reservations', 'from=2026-01-01&to=2026-02-01', '2023-11-14T22:13:20Z', '11111111-1111-4111-8111-111111111111', createHash('sha256').update('').digest('hex'), KEY].join('\n');
  const expected = createHmac('sha256', SECRET).update(canon).digest('base64');
  assert.equal(h['X-Signature'], expected);
  assert.match(expected, /^[A-Za-z0-9+/]+=*$/); // Base64 estandar, no hex
});

test('vector fijo con cuerpo (POST, linea de query vacia)', () => {
  const body = '{"a":1}';
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'POST', path: '/api/x', body, now: 0, nonce: 'n' });
  const canon = ['POST', '/api/x', '', '1970-01-01T00:00:00Z', 'n', createHash('sha256').update(body).digest('hex'), KEY].join('\n');
  assert.equal(h['X-Signature'], createHmac('sha256', SECRET).update(canon).digest('base64'));
});

test('cualquier cambio cambia la firma; el secreto nunca viaja', () => {
  const base = { apiKey: KEY, apiSecret: SECRET, method: 'GET', path: '/a', query: {}, now: 1000, nonce: 'n' };
  const sig = (o) => hmacHeaders({ ...base, ...o })['X-Signature'];
  const ref = sig({});
  for (const o of [{ method: 'POST' }, { path: '/b' }, { query: { q: 1 } }, { body: 'x' }, { apiSecret: 'otro' }, { apiKey: 'otra' }, { nonce: 'm' }, { now: 2000 }]) assert.notEqual(sig(o), ref);
  assert.ok(!JSON.stringify(hmacHeaders(base)).includes(SECRET));
});
