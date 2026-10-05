import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpOdooTransport, rpcErrorDiagnostic } from '../src/odoo-transport.mjs';

const BASE = 'https://example-staging.odoo.com';
const SECRET = 'S3cret-value-XYZ';

function withFetch(body, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ status, json: async () => body });
  return () => { globalThis.fetch = original; };
}

test('resultado correcto: devuelve json.result sin cambios', async () => {
  const restore = withFetch({ jsonrpc: '2.0', id: null, result: [1, 2] });
  try {
    const out = await new HttpOdooTransport({ baseUrl: BASE }).call('object', 'execute_kw', ['db', 2, SECRET, 'x', 'search_read', [], {}]);
    assert.deepEqual(out, [1, 2]);
  } finally { restore(); }
});

test('error Odoo: mensaje estable y diagnostico con modelo, metodo y excepcion', async () => {
  const restore = withFetch({ jsonrpc: '2.0', id: null, error: {
    code: 200, message: 'Odoo Server Error',
    data: { name: 'odoo.exceptions.AccessError', message: 'No tiene permiso sobre x_hotel_api_log' },
  } }, 200);
  try {
    const transport = new HttpOdooTransport({ baseUrl: BASE });
    await assert.rejects(
      transport.call('object', 'execute_kw', ['db', 2, SECRET, 'x_hotel_api_log', 'search_read', [], {}]),
      (error) => {
        assert.equal(error.message, 'ODOO_UPSTREAM_ERROR');
        assert.equal(error.diagnostic.service, 'object');
        assert.equal(error.diagnostic.model, 'x_hotel_api_log');
        assert.equal(error.diagnostic.rpc_method, 'search_read');
        assert.equal(error.diagnostic.http_status, 200);
        assert.equal(error.diagnostic.rpc_code, 200);
        assert.equal(error.diagnostic.exception, 'odoo.exceptions.AccessError');
        assert.match(error.diagnostic.message, /permiso/);
        return true;
      },
    );
  } finally { restore(); }
});

test('el diagnostico nunca contiene el secreto, la URL ni el dominio', () => {
  const diagnostic = rpcErrorDiagnostic({
    service: 'common', method: 'login', args: ['db', 'usuario-tecnico', SECRET], status: 200,
    json: { error: { code: 200, data: { name: 'odoo.exceptions.AccessDenied',
      message: `Fallo con ${SECRET} y usuario-tecnico en https://example-staging.odoo.com/web` } } },
  });
  const text = JSON.stringify(diagnostic);
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes('usuario-tecnico'), false);
  assert.equal(text.includes('example-staging.odoo.com'), false);
  assert.match(diagnostic.message, /\[redacted\]/);
  assert.match(diagnostic.message, /\[url\]/);
});

test('el mensaje diagnostico se acota a 200 caracteres', () => {
  const diagnostic = rpcErrorDiagnostic({
    service: 'object', method: 'execute_kw', args: ['db', 2, SECRET, 'm', 'r', [], {}], status: 200,
    json: { error: { code: 200, data: { name: 'E', message: 'a'.repeat(900) } } },
  });
  assert.equal(diagnostic.message.length, 200);
});

test('error sin datos Odoo: campos nulos, sin lanzar excepcion interna', () => {
  const diagnostic = rpcErrorDiagnostic({ service: 'object', method: 'execute_kw', args: [], status: 500, json: { error: {} } });
  assert.equal(diagnostic.model, null);
  assert.equal(diagnostic.rpc_method, null);
  assert.equal(diagnostic.exception, null);
  assert.equal(diagnostic.http_status, 500);
});
