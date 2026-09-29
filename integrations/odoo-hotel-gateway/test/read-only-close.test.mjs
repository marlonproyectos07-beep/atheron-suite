import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadonlyOdooClient, ReadonlyViolation } from '../src/readonly-odoo.mjs';

class FakeTransport {
  calls = [];
  async call(service, method, args) {
    this.calls.push({ service, method, args });
    if (service === 'common' && method === 'login') return 27;
    if (service === 'object' && method === 'execute_kw') return [];
    throw new Error('unexpected');
  }
}

function makeClient(transport = new FakeTransport()) {
  return new ReadonlyOdooClient({
    transport,
    database: 'db',
    user: 'u',
    secret: 's',
  });
}

test('permite search_read y solo envia execute_kw de lectura', async () => {
  const transport = new FakeTransport();
  const client = makeClient(transport);
  await client.searchRead('sale.order', [['name', '=', 'COT/1']], ['id', 'name']);
  const objectCalls = transport.calls.filter((x) => x.service === 'object');
  assert.equal(objectCalls.length, 1);
  assert.equal(objectCalls[0].args[4], 'search_read');
});

test('bloquea write/create/unlink/action_post/reconcile antes del transporte', async () => {
  for (const method of ['write', 'create', 'unlink', 'action_post', 'reconcile']) {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    await assert.rejects(
      () => client.execute('sale.order', method, []),
      (error) => error instanceof ReadonlyViolation,
    );
    assert.equal(transport.calls.length, 0, method + ' no debe ni autenticar');
  }
});

test('bloquea modelos fuera de la lista permitida', async () => {
  const transport = new FakeTransport();
  const client = makeClient(transport);
  await assert.rejects(
    () => client.execute('res.users', 'search_read', [[]]),
    /MODEL_BLOCKED/,
  );
  assert.equal(transport.calls.length, 0);
});
