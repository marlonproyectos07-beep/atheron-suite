import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runOdooAuthDiagnosis, classifyOdooResult, apiKeyHygiene } from '../src/odoo-auth-diagnosis.mjs';

const KEY = 'CLAVE-FICTICIA-0123456789';
const cfg = { baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: KEY };
const fakeFetch = (status, body = '') => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status, json: async () => ({ uid: 2, lang: 'es_CO' }), text: async () => body }; }; f.calls = calls; return f; };
const run = (status, body) => { const f = fakeFetch(status, body); return runOdooAuthDiagnosis({ client: new OdooJson2Client({ ...cfg, fetchImpl: f }), cfg }).then((r) => ({ r, f })); };

test('200: credencial funciona, una sola llamada de lectura a res.users/context_get', async () => {
  const { r, f } = await run(200);
  assert.equal(f.calls.length, 1); assert.match(f.calls[0].url, /\/json\/2\/res\.users\/context_get$/);
  assert.equal(f.calls[0].init.headers['x-odoo-database'], 'atheron1');
  assert.equal(r.verdict, 'CREDENCIAL_FUNCIONA'); assert.equal(r.authenticated, true); assert.equal(r.target.expectedHost, true); assert.equal(r.writes, 0);
});
test('401: rechazada, sin afirmar caducidad; el mensaje de Odoo se sanea y la clave se redacta', async () => {
  const { r, f } = await run(401, `{"name":"odoo.exceptions.AccessDenied","message":"Invalid apikey ${KEY}"}`);
  assert.equal(f.calls.length, 1);
  assert.equal(r.verdict, 'CREDENCIAL_O_CONFIGURACION_RECHAZADA'); assert.equal(r.authenticated, false); assert.equal(r.httpStatus, 401);
  assert.ok(!JSON.stringify(r).includes(KEY)); assert.ok(r.hint.includes('MENSAJE_MENCIONA_API_KEY')); assert.ok(!/caduc|venci/i.test(r.note));
});
test('403 / 404 / 500 / red se distinguen y nunca se reintenta', async () => {
  assert.equal((await run(403)).r.verdict, 'PERMISO_INSUFICIENTE_O_ACCESO_API_NO_PERMITIDO');
  assert.equal((await run(404)).r.verdict, 'ENDPOINT_O_BASE_NO_ENCONTRADO');
  const five = await run(500); assert.equal(five.r.verdict, 'RESULTADO_INESPERADO_DETENER'); assert.equal(five.f.calls.length, 1);
  const net = await runOdooAuthDiagnosis({ client: new OdooJson2Client({ ...cfg, fetchImpl: async () => { throw new TypeError('x'); } }), cfg });
  assert.equal(net.verdict, 'ERROR_DE_RED_O_CONFIGURACION'); assert.equal(net.httpStatus, null);
});
test('higiene de la clave: solo booleanos, sin longitud ni fragmentos', () => {
  assert.deepEqual(apiKeyHygiene(`${KEY}\n`), { present: true, hasOuterWhitespace: true, hasInnerWhitespace: false, hasQuotes: false, hasNonAscii: false });
  assert.deepEqual(apiKeyHygiene(''), { present: false });
  assert.ok(!JSON.stringify(apiKeyHygiene(KEY)).includes(KEY));
});
test('la salida completa no contiene la clave ni cabeceras de autorizacion', async () => {
  for (const status of [200, 401, 403]) { const { r } = await run(status, `bearer ${KEY}`); const out = JSON.stringify(r); assert.ok(!out.includes(KEY)); assert.ok(!/authorization|bearer/i.test(out)); }
});
test('el script solo usa call() de lectura: sin create/write/unlink/acciones/crons', () => {
  const src = readFileSync(new URL('../src/odoo-auth-diagnosis.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal((src.match(/client\.call\(/g) ?? []).length, 1);
  assert.ok(!/_request|'create'|'write'|'unlink'|\.run\(|_trigger|retry/.test(src));
});
test('classifyOdooResult: 401 no menciona caducidad', () => assert.ok(!/caduc/i.test(JSON.stringify(classifyOdooResult({ httpStatus: 401 })))));
