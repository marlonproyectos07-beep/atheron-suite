import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkCredentialSwap, renderCredentialSwap, KEY_FORMAT } from '../src/credential-swap.mjs';
import { execFileSync } from 'node:child_process';

// valores FICTICIOS; la huella de referencia de la prueba se calcula del ficticio
const REAL_LIKE = `usr_live_${'0123456789abcdef'.repeat(2)}`;
const REF = createHash('sha256').update(REAL_LIKE).digest('hex').slice(0, 12);
const OTHER = 'x'.repeat(44);

test('formato: usr_live_ + 32 hex (41 caracteres)', () => {
  assert.equal(REAL_LIKE.length, 41);
  assert.ok(KEY_FORMAT.test(REAL_LIKE));
  assert.ok(!KEY_FORMAT.test(`usr_live_${'g'.repeat(32)}`));
  assert.ok(!KEY_FORMAT.test(`${REAL_LIKE}0`));
});
test('intercambiadas: el valor real esta en SECRET', () => {
  const r = checkCredentialSwap({ SMOOBU_API_KEY: OTHER, SMOOBU_API_SECRET: REAL_LIKE }, REF);
  assert.equal(r.keyMatch, false); assert.equal(r.secretMatch, true);
  assert.equal(r.verdict, 'CREDENCIALES PROBABLEMENTE INTERCAMBIADAS');
  assert.deepEqual(r.formatCorrect, ['SMOOBU_API_SECRET']);
});
test('asignacion correcta y espacios exteriores toleran la comparacion', () => {
  const r = checkCredentialSwap({ SMOOBU_API_KEY: ` ${REAL_LIKE}\n`, SMOOBU_API_SECRET: OTHER }, REF);
  assert.equal(r.keyMatch, true); assert.equal(r.verdict, 'ASIGNACION CORRECTA DE LA CLAVE');
});
test('ninguno coincide / ausentes', () => {
  assert.equal(checkCredentialSwap({ SMOOBU_API_KEY: OTHER, SMOOBU_API_SECRET: OTHER }, REF).verdict, 'NINGUNO COINCIDE CON LA HUELLA DE REFERENCIA');
  assert.equal(checkCredentialSwap({}, REF).keyMatch, false);
});
test('la salida no contiene valores, prefijos ni huellas', () => {
  const env = { SMOOBU_API_KEY: OTHER, SMOOBU_API_SECRET: REAL_LIKE };
  const out = renderCredentialSwap(checkCredentialSwap(env, REF));
  for (const secret of [OTHER, REAL_LIKE, 'usr_live', REF, createHash('sha256').update(OTHER).digest('hex').slice(0, 12)]) assert.ok(!out.includes(secret), 'filtra un dato');
  assert.equal(out.split('\n').length, 4);
});
test('el script real imprime solo las lineas previstas, usa referencia fija y no importa red', () => {
  const out = execFileSync('node', ['scripts/credential-swap.mjs'], { env: { PATH: process.env.PATH, SMOOBU_API_KEY: OTHER, SMOOBU_API_SECRET: REAL_LIKE }, encoding: 'utf8' });
  assert.match(out, /^SMOOBU_API_KEY: NO MATCH\nSMOOBU_API_SECRET: NO MATCH\n/); // la referencia real no coincide con valores ficticios
  assert.ok(!out.includes(OTHER) && !out.includes(REAL_LIKE));
});
test('el modulo no tiene red ni escritura', async () => {
  const { readFileSync } = await import('node:fs');
  const src = ['../src/credential-swap.mjs', '../scripts/credential-swap.mjs'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n');
  assert.ok(!/fetch|http|net\b|writeFile|appendFile|console\.error/.test(src.replace(/node:crypto/, '')));
});
