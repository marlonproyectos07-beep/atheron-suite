import test from 'node:test';
import assert from 'node:assert/strict';
import { RecomputeWriteClient, RECOMPUTE_PHRASE } from '../src/odoo-json2-recompute-client.mjs';

const cfg = { baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k' };
test('cliente de recalculo: sin frase o destino distinto no se construye', () => {
  assert.throws(() => new RecomputeWriteClient({ ...cfg, authorization: 'x' }), /RECOMPUTE_NOT_AUTHORIZED/);
  assert.throws(() => new RecomputeWriteClient({ ...cfg, baseUrl: 'https://otra.odoo.com', authorization: RECOMPUTE_PHRASE }), /RECOMPUTE_TARGET_NOT_AUTHORIZED/);
});
test('cliente de recalculo: exactamente una llamada, a la accion 1493', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => true, text: async () => 'true' }; };
  const w = new RecomputeWriteClient({ ...cfg, authorization: RECOMPUTE_PHRASE, fetchImpl });
  await w.runUpdateAvailabilitiesOnce();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/json\/2\/ir\.actions\.server\/run$/);
  assert.deepEqual(calls[0].body.ids, [1493]);
  assert.deepEqual(calls[0].body.context.active_ids, [1171, 1172]);
  await assert.rejects(() => w.runUpdateAvailabilitiesOnce(), /RECOMPUTE_ONLY_ONCE/);
});

test('recompute-run solo usa el metodo unico del escritor y nunca llama a un cron', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/recompute-run.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/writer\.\w+\(/.test(src.replace(/writer\.runUpdateAvailabilitiesOnce/g, '')));
  assert.ok(!/ir\.cron|_trigger|\.write\(|'write'|'create'|'unlink'/.test(src));
});

test('smoobu-once: una sola solicitud GET a /apartments, sin reintentos ni Odoo', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../scripts/smoobu-once.mjs', import.meta.url), 'utf8');
  assert.equal((src.match(/listProperties\(\)/g) ?? []).length, 1);
  assert.ok(!/Odoo|getReservation|listReservations|detectPrefix|for \(|while/.test(src.replace(/\/\/.*$/gm, '')));
});
