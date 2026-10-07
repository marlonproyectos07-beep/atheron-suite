import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  LoginLimiter,
  hashPin,
  isValidPinFormat,
  parseRoster,
  resolveOperatorName,
  signSession,
  verifyPin,
  verifySession,
} from '../src/reception-auth.mjs';

const SECRET = 'x'.repeat(40);

test('el formato de PIN exige 6 a 8 dígitos', () => {
  assert.equal(isValidPinFormat('123456'), true);
  assert.equal(isValidPinFormat('12345678'), true);
  assert.equal(isValidPinFormat('12345'), false);
  assert.equal(isValidPinFormat('123456789'), false);
  assert.equal(isValidPinFormat('12a456'), false);
  assert.equal(isValidPinFormat(123456), false);
});

test('hash y verificación de PIN: acepta el correcto y rechaza el resto', async () => {
  const stored = await hashPin('482910', randomBytes(16));
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(await verifyPin('482910', stored), true);
  assert.equal(await verifyPin('482911', stored), false);
  assert.equal(await verifyPin('', stored), false);
  assert.equal(await verifyPin('482910', 'no-es-hash'), false);
});

test('dos hashes del mismo PIN usan sales distintas', async () => {
  const a = await hashPin('482910');
  const b = await hashPin('482910');
  assert.notEqual(a, b);
  assert.equal(await verifyPin('482910', a), true);
  assert.equal(await verifyPin('482910', b), true);
});

test('hashPin rechaza un PIN con formato inválido', async () => {
  await assert.rejects(() => hashPin('12'), /PIN_FORMAT_INVALID/);
});

test('roster: exige los cuatro operadores y solo ids conocidos', async () => {
  const h = await hashPin('111111');
  const full = JSON.stringify(['marlon', 'angela', 'hermarit', 'otro'].map((id) => ({ id, pinHash: h })));
  assert.equal(parseRoster(full).size, 4);
  assert.throws(() => parseRoster(JSON.stringify([{ id: 'marlon', pinHash: h }])), /ROSTER_MISSING_ANGELA/);
  assert.throws(() => parseRoster(JSON.stringify([{ id: 'intruso', pinHash: h }])), /ROSTER_UNKNOWN_OPERATOR/);
  assert.throws(() => parseRoster('{no json'), /ROSTER_INVALID_JSON/);
  assert.throws(() => parseRoster(JSON.stringify({ id: 'marlon' })), /ROSTER_NOT_ARRAY/);
  // Formato del almacén: envoltorio {"operators":[...]}
  assert.equal(parseRoster(JSON.stringify({ operators: ['marlon', 'angela', 'hermarit', 'otro'].map((id) => ({ id, pinHash: h })) })).size, 4);
});

test('bloqueo tras 5 fallos dentro de la ventana, y se libera al expirar', () => {
  let now = 0;
  const limiter = new LoginLimiter({ max: 5, windowMs: 1000, clock: () => now });
  for (let i = 0; i < 4; i += 1) limiter.recordFailure('marlon');
  assert.equal(limiter.isLocked('marlon'), false);
  limiter.recordFailure('marlon');
  assert.equal(limiter.isLocked('marlon'), true);
  assert.equal(limiter.isLocked('angela'), false);
  now = 1001;
  assert.equal(limiter.isLocked('marlon'), false);
});

test('reset limpia los fallos de un operador', () => {
  const limiter = new LoginLimiter({ max: 2 });
  limiter.recordFailure('x');
  limiter.recordFailure('x');
  assert.equal(limiter.isLocked('x'), true);
  limiter.reset('x');
  assert.equal(limiter.isLocked('x'), false);
});

test('sesión firmada: ida y vuelta con operador y nombre', () => {
  const token = signSession({ operatorId: 'angela', name: 'Ángela', now: 1000 }, SECRET);
  assert.deepEqual(verifySession(token, SECRET, 2000), { operatorId: 'angela', name: 'Ángela' });
});

test('sesión: rechaza manipulación, otro secreto, expiración y token mal formado', () => {
  const token = signSession({ operatorId: 'marlon', name: 'Marlon', now: 1000 }, SECRET);
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ op: 'otro', name: 'X', exp: 9e12 })).toString('base64url');
  assert.equal(verifySession(`${forged}.${sig}`, SECRET, 2000), null);
  assert.equal(verifySession(token, 'y'.repeat(40), 2000), null);
  assert.equal(verifySession(token, SECRET, 1000 + 10 * 60 * 60 * 1000 + 1), null);
  assert.equal(verifySession('basura', SECRET, 2000), null);
  assert.equal(verifySession(`${payload}.`, SECRET, 2000), null);
});

test('sesión: no firma con secreto corto', () => {
  assert.throws(() => signSession({ operatorId: 'marlon', name: 'Marlon' }, 'corto'), /SESSION_SECRET_TOO_SHORT/);
  assert.equal(verifySession('a.b', 'corto', 1), null);
});

test('nombre del operador: fijo por lista; «Otro» requiere nombre escrito limpio', () => {
  assert.equal(resolveOperatorName('marlon', 'lo que sea'), 'Marlon');
  assert.equal(resolveOperatorName('otro', '  Luisa <script>  '), 'Luisa script');
  assert.equal(resolveOperatorName('otro', '<<>>'), null);
  assert.equal(resolveOperatorName('otro', ''), null);
});
