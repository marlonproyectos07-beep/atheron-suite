import test from 'node:test';
import assert from 'node:assert/strict';
import { atenderConsulta, vistaPublica } from '../src/mobile-readonly.mjs';

const token = 'a'.repeat(48);
const valido = { method: 'GET', path: '/v1/status', authorization: 'Bearer ' + token };
const informe = {
  exitCode: 0,
  stdout: {
    result: 'ATENCION', at: '2026-11-09T16:00:00.000Z',
    window: { from: '2026-11-09', to: '2026-11-10' },
    summary: { MATCH: 4, MISSING_IN_ODOO: 1, EXFILTRAR: 'nombre e identificacion' },
    missing: [{ nombre: 'DATO_PERSONAL' }], conflicts: [], ambiguous: [], overbooking: [],
    client: 'DATO_PERSONAL',
  },
};

test('Sin configuracion no ejecuta lecturas', async () => {
  let lecturas = 0;
  const r = await atenderConsulta(valido, { token: '', obtenerInforme: async () => { lecturas++; return informe; } });
  assert.equal(r.status, 503); assert.equal(lecturas, 0);
});
test('Rechaza acceso sin token, token diferente y metodos de escritura', async () => {
  let lecturas = 0;
  const obtenerInforme = async () => { lecturas++; return informe; };
  assert.equal((await atenderConsulta({ ...valido, authorization: '' }, { token, obtenerInforme })).status, 401);
  assert.equal((await atenderConsulta({ ...valido, authorization: 'Bearer '+ 'b'.repeat(48) }, { token, obtenerInforme })).status, 401);
  assert.equal((await atenderConsulta({ ...valido, method: 'POST' }, { token, obtenerInforme })).status, 405);
  assert.equal((await atenderConsulta({ ...valido, path: '/v1/saldos' }, { token, obtenerInforme })).status, 404);
  assert.equal(lecturas, 0);
});
test('Solo muestra codigos, fechas y cantidades anonimas', async () => {
  const r = await atenderConsulta(valido, { token, obtenerInforme: async () => informe });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.totales, { MATCH: 4, MISSING_IN_ODOO: 1 });
  assert.equal(r.body.alertas.sinPedido, 1);
  assert.doesNotMatch(JSON.stringify(r.body), /DATO_PERSONAL|EXFILTRAR|identificacion/);
  assert.match(r.body.alcance, /SIN_SALDOS_BANCARIOS/);
});
test('Falla cerrado ante errores, resultados incompletos o no verificables', async () => {
  assert.equal(vistaPublica({ ...informe, exitCode: 1 }), null);
  assert.equal(vistaPublica({ ...informe, stdout: { result: 'OK' } }), null);
  assert.equal((await atenderConsulta(valido, { token, obtenerInforme: async () => { throw Error('secreto'); } })).status, 503);
});
