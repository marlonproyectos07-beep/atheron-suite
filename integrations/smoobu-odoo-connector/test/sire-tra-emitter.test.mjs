import test from 'node:test';
import assert from 'node:assert/strict';
import { TRA_CATALOG_UNVERIFIED, bogotaDate, buildPayload, classify, createTraSimulator, emissionGates, emitStay } from '../src/sire-tra/tra-emitter.mjs';
import { assertBrowserTarget, assertProductionTarget, assertTestTarget } from '../src/sire-tra/guard.mjs';
import { createTraHttp } from '../src/sire-tra/tra-http.mjs';

const EST = { x_name: 'Atheron Suite (TEST)', x_rnt_number: '999999', x_tra_mode: 'api', x_tra_config_verified: true, x_tra_accommodation_type: 'Habitacion', x_tra_cost_basis: 'total_estancia' };
const CAT = { verified: true, docTypes: TRA_CATALOG_UNVERIFIED.docTypes, reasons: { Vacaciones: 'Vacaciones' } };
const ENV = { TRA_ENABLED: 'yes-real', TRA_TOKEN: 't' };

/** Odoo falso con la MISMA maquina de estados que las acciones de servidor (reclamo y aplicar intento). */
function fakeOdoo(lines) {
  const attempts = [];
  const ALLOWED = { enviado: ['pendiente', 'en_envio'], aceptado: ['en_envio', 'enviado', 'incierto'], rechazado: ['en_envio', 'enviado', 'incierto'], incierto: ['en_envio', 'enviado'], error_previo: ['en_envio'], no_recibido: ['incierto', 'rechazado'] };
  const TARGET = { enviado: 'enviado', aceptado: 'aceptado', rechazado: 'rechazado', incierto: 'incierto', error_previo: 'pendiente', no_recibido: 'pendiente' };
  return {
    lines, attempts,
    async searchRead(model, domain) {
      if (model === 'x_guests_line') return lines.filter((l) => l.x_arrived_at && l.x_data_state === 'validado').map((l) => ({ ...l }));
      if (model === 'l10n_latam.identification.type') return [{ id: 5, l10n_co_document_code: 'national_citizen_id' }, { id: 2, l10n_co_document_code: 'passport' }, { id: 10, l10n_co_document_code: 'PEP' }, { id: 7, l10n_co_document_code: 'civil_registration' }];
      if (model === 'sale.order') return [{ id: 1, x_checkout: '2026-11-12', amount_total: 450000.4 }];
      throw new Error(model + domain);
    },
    async claim(ids) {
      const out = [];
      for (const id of ids) {
        const l = lines.find((x) => x.id === id);
        let ok = l.x_tra_state === 'pendiente';
        if (ok && !l.x_is_main) { const m = lines.find((x) => x.x_is_main); ok = m.x_tra_state === 'aceptado' && !!m.x_tra_external_id; }
        if (ok) { l.x_tra_state = 'en_envio'; out.push(id); }
      }
      return out;
    },
    async create(model, v) {
      assert.equal(model, 'x_report_attempt');
      const l = lines.find((x) => x.id === v.x_guest_line_id);
      if (!ALLOWED[v.x_result].includes(l.x_tra_state)) throw new Error('transicion');
      l.x_tra_state = TARGET[v.x_result];
      if (v.x_external_id && l.x_is_main) l.x_tra_external_id = v.x_external_id;
      attempts.push(v);
      return attempts.length;
    },
  };
}
const line = (id, main, extra = {}) => ({ id, x_is_main: main, x_doc_type_id: [5, 'CC'], x_identity_number: `7000${id}`, x_given_names: 'Nombre', x_surname_1: 'Apellido', x_surname_2: false, x_residence_city_id: [1, 'ZIPAQUIRA'], x_residence_text: false, x_origin_city_id: [2, 'BOGOTA'], x_origin_text: false, x_travel_reason: 'Vacaciones', x_tra_room: '201', x_arrived_at: '2026-11-10 20:00:00', x_tra_state: 'pendiente', x_tra_external_id: false, x_data_state: 'validado', ...extra });
const run = (odoo, tra, mode = 'real', est = EST, catalog = CAT, logs = []) => emitStay({ odoo, tra, orderId: 1, est, catalog, mode, runRef: 'r1', env: ENV, log: (e) => logs.push(e) });

test('puertas: sin configuracion oficial verificada no se reclama ni se envia', async () => {
  const cases = [[{ ...ENV, TRA_ENABLED: '' }, CAT, EST], [ENV, { ...CAT, verified: false }, EST], [ENV, CAT, { ...EST, x_tra_config_verified: false }], [{ TRA_ENABLED: 'yes-real' }, CAT, EST], [ENV, CAT, { ...EST, x_tra_mode: 'manual' }]];
  for (const [env, catalog, est] of cases) {
    const o = fakeOdoo([line(1, true)]); const sim = createTraSimulator();
    const r = await emitStay({ odoo: o, tra: sim, orderId: 1, est, catalog, mode: 'real', runRef: 'r', env });
    assert.equal(r.stop, 'BLOQUEADO'); assert.equal(sim.calls.length, 0); assert.equal(o.lines[0].x_tra_state, 'pendiente');
  }
  assert.equal(emissionGates({ mode: 'otro', est: EST, catalog: CAT }).ok, false);
});

test('principal aceptado y acompanante rechazado: no se reenvia el principal; el acompanante solo tras "no recibido"', async () => {
  const o = fakeOdoo([line(1, true), line(2, false), line(3, false)]);
  const sim = createTraSimulator(['ok', '400', 'ok']);
  const r1 = await run(o, sim);
  assert.equal(r1.main.result, 'aceptado');
  assert.deepEqual(r1.companions.map((c) => c.result), ['rechazado', 'aceptado']);
  assert.equal(sim.calls[1].padre, Number(o.lines[0].x_tra_external_id));
  const r2 = await run(o, sim);
  assert.equal(sim.calls.length, 3, 'sin reenvios');
  assert.equal(r2.main, null);
  o.lines[1].x_tra_state = 'pendiente'; // Recepcion registra "no recibido" tras revisar el portal
  await run(o, sim);
  assert.equal(sim.calls.length, 4);
  assert.equal(sim.calls[3].kind, 'two');
});

test('timeout, 500 o respuesta sin codigo en el principal: incierto, no se envian acompanantes ni se reintenta', async () => {
  for (const step of ['timeout', '500', 'no_code', 'network']) {
    const o = fakeOdoo([line(1, true), line(2, false)]);
    const sim = createTraSimulator([step]);
    const r = await run(o, sim);
    assert.equal(r.stop, 'PRINCIPAL_incierto');
    assert.equal(o.lines[0].x_tra_state, 'incierto');
    await run(o, sim);
    assert.equal(sim.calls.length, 1, `reintento ciego tras ${step}`);
  }
});

test('datos incompletos o tipo de documento sin equivalente TRA: error previo, sin llamada', async () => {
  const o = fakeOdoo([line(1, true, { x_doc_type_id: [10, 'PEP'] })]);
  const sim = createTraSimulator();
  const r = await run(o, sim);
  assert.equal(r.main.result, 'error_previo');
  assert.match(r.main.code, /tipo_identificacion/);
  assert.equal(sim.calls.length, 0);
  assert.equal(o.lines[0].x_tra_state, 'pendiente');
});

test('Registro Civil: admitido para acompanante, no para principal (manual oficial Grupo 2, 4.1 y 5.1)', async () => {
  const cat = { ...CAT, mainDocTypes: TRA_CATALOG_UNVERIFIED.mainDocTypes };
  const o1 = fakeOdoo([line(1, true, { x_doc_type_id: [7, 'RC'] })]);
  const s1 = createTraSimulator();
  const r1 = await run(o1, s1, 'real', EST, cat);
  assert.equal(r1.main.result, 'error_previo');
  assert.equal(r1.main.code, 'DATO_NO_ADMITIDO:tipo_identificacion');
  assert.equal(s1.calls.length, 0);
  assert.equal(o1.lines[0].x_tra_state, 'pendiente');
  const o2 = fakeOdoo([line(1, true), line(2, false, { x_doc_type_id: [7, 'RC'] })]);
  const s2 = createTraSimulator();
  const r2 = await run(o2, s2, 'real', EST, cat);
  assert.equal(r2.main.result, 'aceptado');
  assert.equal(r2.companions[0].result, 'aceptado');
  const { payload, invalid } = buildPayload({ line: { ...line(2, false), doc_code: 'civil_registration' }, main: false, order: { x_checkout: '2026-11-12' }, est: EST, catalog: cat, padre: 101 });
  assert.equal(payload.tipo_identificacion, 'Registro Civil');
  assert.deepEqual(invalid, []);
});

test('concurrencia: dos emisores a la vez envian el principal una sola vez', async () => {
  const o = fakeOdoo([line(1, true)]);
  const sim = createTraSimulator(['ok', 'ok']);
  await Promise.all([run(o, sim), run(o, sim)]);
  assert.equal(sim.calls.filter((c) => c.kind === 'one').length, 1);
  assert.equal(o.attempts.length, 1);
});

test('bitacora sin datos personales; payload segun el manual oficial', async () => {
  const o = fakeOdoo([line(1, true), line(2, false)]);
  const logs = [];
  await run(o, createTraSimulator(), 'real', EST, CAT, logs);
  const s = JSON.stringify(logs);
  for (const pii of ['Nombre', 'Apellido', '70001', '70002', 'ZIPAQUIRA']) assert.ok(!s.includes(pii), pii);
  const { payload } = buildPayload({ line: { ...line(1, true), doc_code: 'national_citizen_id' }, main: true, order: { x_checkout: '2026-11-12', amount_total: 450000.4 }, est: EST, catalog: CAT, companions: 1 });
  assert.deepEqual(Object.keys(payload), ['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'check_in', 'check_out', 'motivo', 'numero_acompanantes', 'tipo_acomodacion', 'costo', 'nombre_establecimiento', 'rnt_establecimiento']);
  assert.equal(payload.costo, '450000');
  assert.equal(payload.check_in, '2026-11-10');
});

test('simulador permitido sin catalogo verificado; real no', async () => {
  const o = fakeOdoo([line(1, true)]);
  const r = await run(o, createTraSimulator(), 'simulador', EST, { ...CAT, verified: false });
  assert.equal(r.main.result, 'aceptado');
  assert.equal(o.attempts[0].x_channel, 'simulador');
});

test('clasificacion de respuestas y fecha local', () => {
  assert.deepEqual(classify({ status: 200, json: { code: 19 } }), { result: 'aceptado', externalId: '19' });
  assert.equal(classify({ status: 401 }).result, 'rechazado');
  assert.equal(classify({ status: 422 }).result, 'rechazado');
  assert.equal(classify({ status: 503 }).result, 'incierto');
  assert.equal(classify({ error: 'BEFORE_SEND' }).result, 'error_previo');
  assert.equal(bogotaDate('2026-11-11 03:30:00'), '2026-11-10');
});

test('cliente HTTP: cabecera token, timeout como incierto, sin token no se construye', async () => {
  const seen = [];
  const http = createTraHttp({ token: 'tok', fetchImpl: async (url, init) => { seen.push([url, init.headers.authorization]); return { status: 200, json: async () => ({ code: 5 }) }; } });
  assert.deepEqual(await http.post('one', {}), { status: 200, json: { code: 5 } });
  assert.deepEqual(seen[0], ['https://pms.mincit.gov.co/one/', 'token tok']);
  const slow = createTraHttp({ token: 't', fetchImpl: async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; } });
  assert.deepEqual(await slow.post('two', {}), { error: 'TIMEOUT' });
  assert.deepEqual(await slow.post('x', {}), { error: 'BEFORE_SEND' });
  assert.throws(() => createTraHttp({}));
});

test('guardia: produccion bloqueada por URL, nombre, credencial y sin aprobacion', () => {
  const good = { ODOO_TEST_BASE_URL: 'https://atheron1-pruebas-20261108.odoo.com', ODOO_TEST_DATABASE: 'atheron1-pruebas-20261108', ODOO_TEST_API_KEY: 'k', ODOO_API_KEY: 'p', ODOO_DATABASE: 'atheron1' };
  const code = (fn) => { try { fn(); return 'OK'; } catch (e) { return e.code; } };
  assert.equal(assertTestTarget(good).database, 'atheron1-pruebas-20261108');
  assert.equal(code(() => assertTestTarget({ ...good, ODOO_TEST_BASE_URL: 'https://atheron1.odoo.com', ODOO_TEST_DATABASE: 'atheron1' })), 'TARGET_IS_PRODUCTION');
  assert.equal(code(() => assertTestTarget({ ...good, ODOO_TEST_DATABASE: 'atheron1-hotel-staging-20261009', ODOO_TEST_BASE_URL: 'https://atheron1-hotel-staging-20261009.odoo.com' })), 'TARGET_DATABASE_NOT_ALLOWED');
  assert.equal(code(() => assertTestTarget({ ...good, ODOO_TEST_BASE_URL: 'https://u:p@atheron1-pruebas-20261108.odoo.com' })), 'TARGET_URL_NOT_BARE_ORIGIN');
  assert.equal(code(() => assertTestTarget({ ...good, ODOO_TEST_BASE_URL: 'https://atheron1-pruebas-20261108.odoo.com/odoo' })), 'TARGET_URL_NOT_BARE_ORIGIN');
  assert.equal(code(() => assertTestTarget({ ...good, ODOO_TEST_API_KEY: 'p' })), 'TARGET_USES_PRODUCTION_CREDENTIAL');
  assert.equal(code(() => assertTestTarget({ ...good, ODOO_TEST_BASE_URL: 'https://atheron1-pruebas-20261109.odoo.com' })), 'TARGET_HOST_DATABASE_MISMATCH');
  assert.equal(code(() => assertProductionTarget({ ODOO_BASE_URL: 'https://atheron1.odoo.com', ODOO_DATABASE: 'atheron1', ODOO_API_KEY: 'p' })), 'PRODUCTION_NOT_APPROVED');
  assert.equal(code(() => assertBrowserTarget('atheron1.odoo.com')), 'BROWSER_TARGET_NOT_TEST_COPY');
  assert.equal(code(() => assertBrowserTarget('atheron1-hotel-staging-20261009.odoo.com')), 'BROWSER_TARGET_NOT_TEST_COPY');
  assert.equal(assertBrowserTarget('atheron1-pruebas-20261108.odoo.com'), 'atheron1-pruebas-20261108');
});
