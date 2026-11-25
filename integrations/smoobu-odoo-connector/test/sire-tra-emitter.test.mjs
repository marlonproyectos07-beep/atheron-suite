import test from 'node:test';
import assert from 'node:assert/strict';
import { TRA_CATALOG_UNVERIFIED, TRA_ONE_KEYS, TRA_TWO_KEYS, bogotaDate, buildPayload, classify, confirmedCost, createTraSimulator, emissionGates, emitStay, stayDeparture } from '../src/sire-tra/tra-emitter.mjs';
import { assertBrowserTarget, assertProductionTarget, assertTestTarget } from '../src/sire-tra/guard.mjs';
import { createTraHttp, traHeaders } from '../src/sire-tra/tra-http.mjs';

const EST = { x_name: 'Atheron Suite (TEST)', x_rnt_number: '999999', x_tra_mode: 'api', x_tra_config_verified: true, x_tra_accommodation_type: 'Habitacion', x_tra_cost_basis: 'total_estancia', x_tra_establishment_name: 'Nombre RNT (TEST)' };
const CAT = { verified: true, docTypes: TRA_CATALOG_UNVERIFIED.docTypes, reasons: { Vacaciones: 'Vacaciones' } };
const ENV = { TRA_ENABLED: 'yes-real', TRA_TOKEN: 't' };
const PAID = { id: 1, x_state: 'confirmado', x_amount: 450000, x_currency_id: [8, 'COP'], x_cutoff_date: '2026-11-12', x_evidence_kind: 'comprobante_pago', x_evidence_ref: 'REF-TEST', x_evidence_name: 'comprobante.pdf', x_excludes_taxes: true, x_covers_all_guests: true, x_confirmed_by: [2, 'u'], x_confirmed_at: '2026-11-12 16:00:00', write_date: '2026-11-12 16:00:00' };

/** Odoo falso con la MISMA maquina de estados que las acciones de servidor (reclamo y aplicar intento). */
function fakeOdoo(lines) {
  const attempts = [];
  const ALLOWED = { enviado: ['pendiente', 'en_envio'], aceptado: ['en_envio', 'enviado', 'incierto'], rechazado: ['en_envio', 'enviado', 'incierto'], incierto: ['en_envio', 'enviado'], error_previo: ['en_envio'], no_recibido: ['incierto', 'rechazado'] };
  const TARGET = { enviado: 'enviado', aceptado: 'aceptado', rechazado: 'rechazado', incierto: 'incierto', error_previo: 'pendiente', no_recibido: 'pendiente' };
  return {
    lines, attempts,
    async searchRead(model, domain) {
      if (model === 'x_guests_line') return lines.map((l) => ({ ...l })); // todas las fichas de la estancia
      if (model === 'l10n_latam.identification.type') return [{ id: 5, l10n_co_document_code: 'national_citizen_id' }, { id: 2, l10n_co_document_code: 'passport' }, { id: 10, l10n_co_document_code: 'PEP' }, { id: 7, l10n_co_document_code: 'civil_registration' }];
      if (model === 'sale.order') return [{ id: 1, state: 'sale', x_checkout: '2026-11-14', amount_total: 450000.4 }]; // fecha prevista distinta de la salida real
      if (model === 'x_tra_amount') return [{ ...PAID }];
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
const line = (id, main, extra = {}) => ({ id, x_is_main: main, x_doc_type_id: [5, 'CC'], x_identity_number: `7000${id}`, x_given_names: 'Nombre', x_surname_1: 'Apellido', x_surname_2: false, x_residence_city_id: [1, 'ZIPAQUIRA'], x_residence_text: false, x_origin_city_id: [2, 'BOGOTA'], x_origin_text: false, x_travel_reason: 'Vacaciones', x_tra_room: '201', x_arrived_at: '2026-11-10 20:00:00', x_departed_at: '2026-11-12 15:00:00', x_tra_state: 'pendiente', x_tra_external_id: false, x_data_state: 'validado', ...extra });
const run = (odoo, tra, mode = 'real', est = EST, catalog = CAT, logs = []) => emitStay({ odoo, tra, orderId: 1, est, catalog, mode, runRef: 'r1', env: ENV, log: (e) => logs.push(e), today: '2026-11-18' });

test('puertas: sin configuracion oficial verificada no se reclama ni se envia', async () => {
  const cases = [[{ ...ENV, TRA_ENABLED: '' }, CAT, EST], [ENV, { ...CAT, verified: false }, EST], [ENV, CAT, { ...EST, x_tra_config_verified: false }], [{ TRA_ENABLED: 'yes-real' }, CAT, EST], [ENV, CAT, { ...EST, x_tra_mode: 'manual' }]];
  for (const [env, catalog, est] of cases) {
    const o = fakeOdoo([line(1, true)]); const sim = createTraSimulator();
    const r = await emitStay({ odoo: o, tra: sim, orderId: 1, est, catalog, mode: 'real', runRef: 'r', env, today: '2026-11-18' });
    assert.equal(r.stop, 'BLOQUEADO'); assert.equal(sim.calls.length, 0); assert.equal(o.lines[0].x_tra_state, 'pendiente');
  }
  assert.equal(emissionGates({ mode: 'otro', est: EST, catalog: CAT }).ok, false);
});

test('principal aceptado y acompanante rechazado: se detiene, no se reenvia el principal y el acompanante solo tras "no recibido"', async () => {
  const o = fakeOdoo([line(1, true), line(2, false), line(3, false)]);
  const sim = createTraSimulator(['ok', '400', 'ok']);
  const r1 = await run(o, sim);
  assert.equal(r1.main.result, 'aceptado');
  assert.deepEqual(r1.companions.map((c) => c.result), ['rechazado']);
  assert.equal(r1.stop, 'ACOMPANANTE_rechazado', 'no se encadena otra peticion tras un fallo');
  assert.equal(sim.calls.length, 2);
  assert.equal(sim.calls[1].padre, Number(o.lines[0].x_tra_external_id));
  assert.equal(o.lines[2].x_tra_state, 'pendiente');
  const r2 = await run(o, sim);
  assert.equal(r2.stop, 'ESTANCIA_NO_LISTA');
  assert.ok(r2.reasons.includes('TRA_RECHAZADO_REVISAR'));
  assert.equal(sim.calls.length, 2, 'sin envios mientras haya un rechazo sin revisar');
  o.lines[1].x_tra_state = 'pendiente'; // Recepcion registra "no recibido" tras revisar el portal
  const r3 = await run(o, sim);
  assert.equal(r3.main, null, 'el principal aceptado no se reenvia');
  assert.deepEqual(r3.companions.map((c) => c.result), ['aceptado', 'aceptado']);
  assert.deepEqual(sim.calls.map((c) => c.kind), ['one', 'two', 'two', 'two']);
});

test('sin reintentos automaticos: tras un rechazo o un incierto no hay otra llamada hasta la revision humana', async () => {
  for (const step of ['400', 'timeout']) {
    const o = fakeOdoo([line(1, true), line(2, false)]);
    const sim = createTraSimulator(['ok', step, 'ok']);
    await run(o, sim);
    for (let i = 0; i < 3; i += 1) await run(o, sim); // ejecuciones repetidas sin revision
    assert.equal(sim.calls.length, 2, `${step}: ninguna llamada nueva sin revision`);
    o.lines[1].x_tra_state = 'pendiente'; // "Comprobado: no recibido" tras mirar el portal
    const r = await run(o, sim);
    assert.equal(r.companions[0].result, 'aceptado', 'el reenvio revisado se admite (sin limite numerico propio)');
    assert.equal(sim.calls.length, 3);
  }
});

test('antes del check-out: cero envios, cero reclamos y cero intentos (falte la salida de uno o de todos)', async () => {
  const variants = [
    [line(1, true, { x_departed_at: false })],
    [line(1, true, { x_departed_at: false }), line(2, false, { x_departed_at: false })],
    [line(1, true), line(2, false, { x_departed_at: false })], // el principal salio, un acompanante sigue alojado
    [line(1, true, { x_departed_at: false }), line(2, false)],
  ];
  for (const lines of variants) {
    const o = fakeOdoo(lines);
    const sim = createTraSimulator();
    const r = await run(o, sim);
    assert.equal(r.stop, 'ESTANCIA_NO_LISTA');
    assert.ok(r.reasons.includes('SIN_SALIDA_REAL'));
    assert.equal(r.sent, 0);
    assert.equal(sim.calls.length, 0);
    assert.equal(o.attempts.length, 0);
    assert.ok(o.lines.every((l) => l.x_tra_state === 'pendiente'));
  }
  assert.equal(stayDeparture([line(1, true), line(2, false, { x_departed_at: '2026-11-13 04:30:00' })]), '2026-11-12', '23:30 en Bogota sigue siendo el dia 12');
  assert.equal(stayDeparture([line(1, true), line(2, false, { x_departed_at: '2026-11-13 05:00:00' })]), '2026-11-13');
  assert.equal(stayDeparture([line(1, true), line(2, false, { x_departed_at: false })]), null);
  assert.equal(stayDeparture([]), null);
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
  const order = { x_checkout: '2026-11-14', amount_total: 450000.4 };
  const cost = confirmedCost({ amounts: [{ ...PAID, x_amount: 400000 }], est: EST, order, today: '2026-11-18', departure: '2026-11-12' });
  const { payload } = buildPayload({ line: { ...line(1, true), doc_code: 'national_citizen_id' }, main: true, order, est: EST, catalog: CAT, companions: 1, cost });
  assert.deepEqual(Object.keys(payload), ['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'motivo', 'numero_acompanantes', 'check_in', 'check_out', 'tipo_acomodacion', 'costo', 'nombre_establecimiento', 'rnt_establecimiento']);
  assert.equal(payload.costo, '400000', 'importe confirmado, no la tarifa');
  assert.equal(payload.nombre_establecimiento, 'Nombre RNT (TEST)', 'nombre del registro oficial, no x_name');
  assert.equal(payload.check_in, '2026-11-10');
  assert.equal(payload.check_out, '2026-11-12', 'salida real, no la fecha prevista de la reserva (14)');
  // los intentos guardan las fechas tal como se enviaron
  assert.ok(o.attempts.every((a) => a.x_reported_checkin === '2026-11-10' && a.x_reported_checkout === '2026-11-12'));
});

// Ejemplo del cuerpo /one/ del manual oficial Grupo 1 (Res. 409 de 2022, version 02-02-2023), transcrito tal cual:
// mismas claves, mismo orden y todos los valores entre comillas.
const MANUAL_ONE = '{"tipo_identificacion":"C.C","numero_identificacion":"00000000","nombres":"Test ","apellidos":"Prueba","cuidad_residencia":"Bogota","cuidad_procedencia":"Mexico","numero_habitacion":"1-04G","motivo":"Trabajo","numero_acompanantes":"3","check_in":"2022-11-01","check_out":"2022-11-01","tipo_acomodacion":"Casa","costo":"1212","nombre_establecimiento":"hotel prueba 12","rnt_establecimiento":"00000000"}';

test('JSON oficial: con los valores del ejemplo del manual, /one/ sale byte a byte igual; /two/ con sus claves, orden y tipos', () => {
  const l = { x_is_main: true, doc_code: 'national_citizen_id', x_identity_number: '00000000', x_given_names: 'Test ', x_surname_1: 'Prueba', x_surname_2: false, x_residence_city_id: [1, 'Bogota'], x_origin_city_id: false, x_origin_text: 'Mexico', x_tra_room: '1-04G', x_travel_reason: 'Trabajo', x_arrived_at: '2022-11-01 15:00:00', x_departed_at: '2022-11-01 22:00:00' };
  const est = { x_tra_accommodation_type: 'Casa', x_tra_establishment_name: 'hotel prueba 12', x_rnt_number: '00000000' };
  const one = buildPayload({ line: l, main: true, est, catalog: { ...CAT, reasons: { Trabajo: 'Trabajo' } }, companions: 3, cost: { ok: true, value: '1212' } });
  assert.deepEqual([one.missing, one.invalid], [[], []]);
  assert.equal(JSON.stringify(one.payload), MANUAL_ONE);
  assert.deepEqual(Object.keys(JSON.parse(MANUAL_ONE)), [...TRA_ONE_KEYS]);
  const two = buildPayload({ line: { ...l, x_is_main: false, doc_code: 'passport', x_identity_number: 'AB123456' }, main: false, est, catalog: CAT, padre: 19 });
  assert.deepEqual([two.missing, two.invalid], [[], []]);
  assert.deepEqual(Object.keys(two.payload), [...TRA_TWO_KEYS]);
  assert.deepEqual(Object.keys(two.payload), ['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'check_in', 'check_out', 'padre']);
  assert.equal(two.payload.padre, 19, 'padre numerico, sin comillas, como en el manual');
  assert.match(JSON.stringify(two.payload), /"padre":19\}$/);
  for (const [k, v] of Object.entries(two.payload)) if (k !== 'padre') assert.equal(typeof v, 'string', k);
  assert.equal(two.payload.numero_identificacion, 'AB123456', 'en /two/ el documento es texto');
});

test('documento del principal: C.C/T.I/C.E solo digitos; pasaporte con letras = excepcion especifica, sin alterar ni bloquear lo demas', async () => {
  const p = (doc, number, e = EST) => buildPayload({ line: { ...line(1, true), doc_code: doc, x_identity_number: number }, main: true, est: e, catalog: CAT, companions: 0, cost: { ok: true, value: '1' } });
  assert.deepEqual([p('national_citizen_id', '1012345678').invalid, p('national_citizen_id', '1012345678').pending], [[], []], 'C.C valida: sin bloqueo');
  assert.deepEqual([p('passport', '123456789').invalid, p('passport', '123456789').pending], [[], []], 'pasaporte numerico: sin bloqueo');
  const pa = p('passport', 'AB123456');
  assert.deepEqual([pa.invalid, pa.pending, pa.missing], [[], ['numero_identificacion'], []], 'pasaporte alfanumerico: excepcion pendiente');
  assert.equal(pa.payload.numero_identificacion, 'AB123456', 'el valor no se altera');
  assert.deepEqual(p('national_citizen_id', '1.012.345').invalid, ['numero_identificacion'], 'Grupo 2, 4.2: sin puntos');
  assert.deepEqual(p('national_citizen_id', ' 123').invalid, ['numero_identificacion'], 'no se recorta ni se altera');
  assert.deepEqual(p('passport', 'AB-1234').invalid, ['numero_identificacion'], 'Grupo 2, 4.2: sin caracteres especiales');
  assert.deepEqual(p('national_citizen_id', '123', { ...EST, x_rnt_number: 'RNT-1' }).invalid, ['rnt_establecimiento']);
  assert.deepEqual(buildPayload({ line: { ...line(1, true), doc_code: 'national_citizen_id', x_departed_at: '2026-11-09 15:00:00' }, main: true, est: EST, catalog: CAT, companions: 0, cost: { ok: true, value: '1' } }).invalid, ['check_out'], 'salida anterior a la llegada');
  // acompanante con pasaporte alfanumerico: /two/ declara texto; se envia tal cual
  const two = buildPayload({ line: { ...line(2, false), doc_code: 'passport', x_identity_number: 'AB123456' }, main: false, est: EST, catalog: CAT, padre: 5 });
  assert.deepEqual([two.invalid, two.pending], [[], []]);
  // en el emisor: excepcion del principal = error previo sin llamada; un caso con C.C sigue su curso
  const o = fakeOdoo([line(1, true, { x_doc_type_id: [2, 'PA'], x_identity_number: 'AB123456' })]);
  const sim = createTraSimulator();
  const r = await run(o, sim);
  assert.equal(r.main.code, 'EXCEPCION_PENDIENTE:numero_identificacion');
  assert.equal(sim.calls.length, 0);
  assert.equal(o.lines[0].x_tra_state, 'pendiente');
  const ok = fakeOdoo([line(1, true), line(2, false, { x_doc_type_id: [2, 'PA'], x_identity_number: 'AB123456' })]);
  const s2 = createTraSimulator();
  const r2 = await run(ok, s2);
  assert.deepEqual([r2.main.result, r2.companions[0].result], ['aceptado', 'aceptado']);
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

test('cliente HTTP: cabecera Authorization "token <token>" del manual, cuerpo intacto, una sola peticion y timeout como incierto', async () => {
  const seen = [];
  const http = createTraHttp({ token: 'tok', fetchImpl: async (url, init) => { seen.push({ url, ...init }); return { status: 200, json: async () => ({ code: 5 }) }; } });
  const body = { tipo_identificacion: 'C.C', padre: 19 };
  assert.deepEqual(await http.post('one', body), { status: 200, json: { code: 5 } });
  assert.equal(seen[0].url, 'https://pms.mincit.gov.co/one/');
  assert.equal(seen[0].method, 'POST');
  assert.deepEqual(seen[0].headers, { Authorization: 'token tok', 'Content-Type': 'application/json' });
  assert.deepEqual(Object.keys(traHeaders('x')), ['Authorization', 'Content-Type']);
  assert.equal(seen[0].body, JSON.stringify(body));
  await http.post('two', body);
  assert.equal(seen[1].url, 'https://pms.mincit.gov.co/two/');
  let n = 0;
  const slow = createTraHttp({ token: 't', fetchImpl: async () => { n += 1; const e = new Error('t'); e.name = 'TimeoutError'; throw e; } });
  assert.deepEqual(await slow.post('two', {}), { error: 'TIMEOUT' });
  assert.equal(n, 1, 'sin reintentos');
  assert.deepEqual(await slow.post('x', {}), { error: 'BEFORE_SEND' });
  assert.equal(n, 1);
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
