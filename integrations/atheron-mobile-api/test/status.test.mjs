import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStatusRequest } from '../api/status.mjs';

test('Sin secretos no hace llamadas y falla cerrado', async () => {
  const r = await handleStatusRequest({ method: 'GET', headers: {} }, {});
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: 'CONFIGURACION_PENDIENTE' });
});
test('Con variables presentes, niega sin token antes de leer APIs', async () => {
  const env = {
    ATHERON_MOBILE_READ_TOKEN: 't'.repeat(48),
    SMOOBU_API_KEY: 'key', SMOOBU_API_SECRET:'secret',
    ODOO_API_KEY:'secret', ODOO_BASE_URL:'https://atheron1.odoo.com', ODOO_DATABASE:'atheron1',
  };
  const a = await handleStatusRequest({ method:'GET', headers:{} }, env);
  assert.equal(a.status, 401);
  const b = await handleStatusRequest({ method:'POST', headers:{ authorization:'Bearer '+ 't'.repeat(48) } }, env);
  assert.equal(b.status, 405);
});
