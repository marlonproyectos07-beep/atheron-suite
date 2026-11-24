import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRA_CATALOG_UNVERIFIED, createTraSimulator } from '../src/sire-tra/tra-emitter.mjs';
import { ODOO_MAX_ID, parseOrderId, runEmitter } from '../src/sire-tra/tra-run.mjs';

// ATH-HOTELS-SIRE-TRA-001 · recorrido del emisor (scripts/tra-emit.mjs -> runEmitter). Datos 100 % sinteticos.
export const EST = { id: 1, x_active: true, x_name: 'Nombre interno (TEST)', x_tra_establishment_name: 'Nombre RNT (TEST)', x_rnt_number: '999999', x_tra_mode: 'api', x_tra_config_verified: true, x_tra_accommodation_type: 'Casa', x_tra_cost_basis: 'total_estancia' };
export const CAT = { verified: true, docTypes: TRA_CATALOG_UNVERIFIED.docTypes, mainDocTypes: TRA_CATALOG_UNVERIFIED.mainDocTypes, reasons: { Vacaciones: 'Vacaciones' } };
const OPEN = { TRA_ENABLED: 'yes-real', TRA_TOKEN: 'token-sintetico' };
const NOW = () => Date.UTC(2026, 10, 19, 22, 0, 0); // 19/11/2026 17:00 en Bogota, despues del check-out
export const paid = (order, extra = {}) => ({ id: 100 + order, x_sale_order_id: [order, `P${order}`], x_state: 'confirmado', x_amount: 65000, x_currency_id: [8, 'COP'], x_cutoff_date: '2026-11-19', x_evidence_kind: 'comprobante_pago', x_evidence_ref: `REF-${order}`, x_evidence_name: 'comprobante.pdf', x_excludes_taxes: true, x_covers_all_guests: true, x_confirmed_by: [2, 'u'], x_confirmed_at: '2026-11-19 18:00:00', write_date: '2026-11-19 18:00:00', ...extra });

export const g = (id, order, main, extra = {}) => ({ id, x_sale_order_id: [order, `P${order}`], x_establishment_id: [1, 'E'], x_is_main: main, x_doc_type_id: [5, 'CC'], x_identity_number: `9${order}${id}`, x_given_names: `Nombre${order}`, x_surname_1: 'Apellido', x_surname_2: false, x_residence_city_id: [1, 'CIUDAD'], x_residence_text: false, x_origin_city_id: [2, 'ORIGEN'], x_origin_text: false, x_travel_reason: 'Vacaciones', x_tra_room: String(200 + order), x_arrived_at: '2026-11-18 20:00:00', x_departed_at: '2026-11-19 15:00:00', x_tra_state: 'pendiente', x_tra_external_id: false, x_data_state: 'validado', ...extra });

/** Odoo falso que respeta los dominios y cuenta lecturas y escrituras. */
export function fakeOdoo({ lines = [], orders = {}, amounts = [], est = EST } = {}) {
  const calls = { reads: [], creates: [], claims: [] };
  const val = (rec, f) => (Array.isArray(rec[f]) ? rec[f][0] : rec[f]);
  const match = (rec, [f, op, v]) => {
    const x = val(rec, f);
    if (op === '=') return x === v;
    if (op === '!=') return v === false ? !!x : x !== v;
    if (op === 'in') return v.includes(x);
    throw new Error(`op ${op}`);
  };
  const where = (rows, domain) => rows.filter((r) => domain.every((d) => match(r, d))).map((r) => ({ ...r }));
  return {
    lines, calls, amounts,
    async searchRead(model, domain) {
      calls.reads.push({ model, domain });
      if (model === 'x_guests_line') return where(lines, domain);
      if (model === 'x_establishment') return where(est ? [est] : [], domain);
      if (model === 'x_tra_amount') return where(amounts, domain);
      if (model === 'x_report_attempt') return where(calls.creates, domain);
      if (model === 'l10n_latam.identification.type') return [{ id: 5, l10n_co_document_code: 'national_citizen_id' }];
      if (model === 'sale.order') { const id = domain[0][2]; return orders[id] === null ? [] : [{ id, state: 'sale', x_reservation_status: false, x_checkout: '2026-11-19', amount_total: 65000, ...(orders[id] || {}) }]; }
      throw new Error(model);
    },
    async claim(ids) {
      calls.claims.push([...ids]);
      const out = [];
      for (const id of ids) { const l = lines.find((x) => x.id === id); if (l.x_tra_state === 'pendiente') { l.x_tra_state = 'en_envio'; out.push(id); } }
      return out;
    },
    async create(model, v) {
      assert.equal(model, 'x_report_attempt');
      calls.creates.push(v);
      const l = lines.find((x) => x.id === v.x_guest_line_id);
      l.x_tra_state = v.x_result === 'error_previo' ? 'pendiente' : v.x_result;
      if (v.x_external_id && l.x_is_main) l.x_tra_external_id = v.x_external_id;
      return calls.creates.length;
    },
  };
}

export function harness(data, script = []) {
  const odoo = fakeOdoo(data);
  const sim = createTraSimulator(script);
  const payloads = [];
  let made = 0;
  const makeTra = () => { made += 1; return { post: (kind, p) => { payloads.push({ kind, p }); return sim.post(kind, p); } }; };
  return { odoo, sim, payloads, makeTra, made: () => made };
}

const writes = (o) => o.calls.creates.length + o.calls.claims.length;
const run = (h, send, env, catalog = CAT) => runEmitter({ send, env, catalog, odoo: h.odoo, makeTra: h.makeTra, now: NOW });
const READY = () => ({ lines: [g(1, 1, true), g(2, 1, false), g(3, 2, true), g(4, 2, false)], amounts: [paid(1), paid(2)] });

test('parseOrderId: solo enteros positivos dentro del rango de ids de Odoo', () => {
  assert.deepEqual(parseOrderId('22253'), { ok: true, id: 22253 });
  assert.deepEqual(parseOrderId(' 22253 '), { ok: true, id: 22253 });
  assert.deepEqual(parseOrderId(String(ODOO_MAX_ID)), { ok: true, id: ODOO_MAX_ID });
  for (const v of ['', '   ', undefined, null]) assert.equal(parseOrderId(v).code, 'PEDIDO_VACIO', String(v));
  for (const v of ['abc', '0', '007', '-1', '1e3', '22 253', '22253,22255', '22253.0', '0x10', '+5']) assert.equal(parseOrderId(v).code, 'PEDIDO_INVALIDO', v);
  for (const v of [String(ODOO_MAX_ID + 1), '9007199254740993', '99999999999999999999']) assert.equal(parseOrderId(v).code, 'PEDIDO_FUERA_DE_RANGO', v);
});

test('manual (comprobacion y envio real) sin pedido valido: error, cero llamadas a MinCIT y cero accesos a Odoo', async () => {
  for (const send of [false, true]) {
    for (const [order, code] of [['', 'PEDIDO_VACIO'], [undefined, 'PEDIDO_VACIO'], ['abc', 'PEDIDO_INVALIDO'], ['22253,22255', 'PEDIDO_INVALIDO'], ['-1', 'PEDIDO_INVALIDO'], ['9007199254740993', 'PEDIDO_FUERA_DE_RANGO'], [String(ODOO_MAX_ID + 1), 'PEDIDO_FUERA_DE_RANGO']]) {
      const h = harness(READY());
      const r = await run(h, send, { ...OPEN, TRA_TRIGGER: 'workflow_dispatch', TRA_ONLY_ORDER: order });
      assert.equal(r.exitCode, 1, `${send} ${order}`);
      assert.equal(r.out.code, code);
      assert.equal(h.made(), 0);
      assert.equal(h.odoo.calls.reads.length, 0);
      assert.equal(writes(h.odoo), 0);
    }
  }
});

test('manual con pedido sin TRA pendiente: error en comprobacion y envio, con el detalle de bloqueos y sin escrituras', async () => {
  const cases = [
    [{ lines: [g(1, 1, true)], orders: { 7: { state: 'draft' } } }, ['PEDIDO_NO_CONFIRMADO', 'SIN_FICHAS', 'IMPORTE_AUSENTE']],
    [{ lines: [g(1, 7, true, { x_tra_state: 'aceptado', x_tra_external_id: '55' })], amounts: [paid(7)] }, []],
    [{ lines: [g(1, 7, true, { x_arrived_at: false, x_tra_state: false })], amounts: [paid(7)] }, []],
  ];
  for (const send of [false, true]) {
    for (const [data, blocks] of cases) {
      const h = harness(data);
      const r = await run(h, send, { ...OPEN, TRA_ONLY_ORDER: '7' });
      assert.equal(r.exitCode, 1);
      assert.equal(r.out.code, 'PEDIDO_SIN_TRA_PENDIENTE');
      for (const b of blocks) assert.ok(r.out.check.blocks.includes(b), b);
      assert.equal(h.made(), 0);
      assert.equal(writes(h.odoo), 0);
      assert.ok(h.odoo.calls.reads.filter((x) => x.model === 'x_guests_line').every((x) => x.domain.some(([f, , v]) => f === 'x_sale_order_id' && v === 7)));
    }
  }
});

test('comprobacion completa sin envio: todos los campos y bloqueos, sin valores en la salida', async () => {
  const h = harness({ lines: [g(1, 1, true, { x_travel_reason: 'Salud' }), g(2, 1, false, { x_data_state: 'recibido', x_arrived_at: false, x_departed_at: false, x_tra_state: false })], amounts: [paid(1, { x_state: false })], est: { ...EST, x_tra_establishment_name: '' } });
  const r = await run(h, false, { TRA_ONLY_ORDER: '1' }, { ...CAT, verified: false, reasonsProposed: { Salud: 'Salud y atencion medica' } });
  assert.equal(r.exitCode, 1);
  assert.equal(r.out.code, 'DATOS_NO_LISTOS');
  const c = r.out.check;
  assert.deepEqual(c.blocks.sort(), ['ESTANCIA_SIN_SALIDA_REAL', 'IMPORTE_SIN_CONFIRMAR', 'NOMBRE_TRA_SIN_REGISTRAR']);
  assert.equal(c.cost.code, 'IMPORTE_SIN_CONFIRMAR');
  const [m, comp] = c.lines;
  assert.deepEqual(Object.keys(m.fields), ['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'motivo', 'numero_acompanantes', 'check_in', 'check_out', 'tipo_acomodacion', 'costo', 'nombre_establecimiento', 'rnt_establecimiento']);
  assert.equal(m.fields.motivo, 'falta');
  assert.ok(m.codes.includes('MOTIVO_EQUIVALENCIA_NO_VERIFICADA'), 'la propuesta no se usa para enviar');
  assert.equal(m.fields.costo, 'IMPORTE_SIN_CONFIRMAR');
  assert.equal(m.fields.nombre_establecimiento, 'falta');
  assert.ok(m.codes.includes('CAMPO_nombre_establecimiento'));
  assert.equal(m.fields.tipo_acomodacion, 'ok');
  assert.ok(comp.codes.includes('FICHA_NO_VALIDADA') && comp.codes.includes('SIN_LLEGADA_REAL') && comp.codes.includes('CAMPO_check_in'));
  assert.ok(comp.codes.includes('SIN_SALIDA_REAL') && comp.codes.includes('CAMPO_check_out'));
  assert.equal(m.fields.check_out, 'ok', 'el principal ya salio; la estancia no, porque falta el acompanante');
  assert.ok(c.gates.includes('CATALOGO_NO_VERIFICADO'));
  assert.equal(c.ready_data, false);
  const s = JSON.stringify(r.out);
  for (const v of ['Nombre1', 'Apellido', '911', 'CIUDAD', 'Salud', '65000', 'REF-1', 'Nombre RNT', 'Nombre interno']) assert.ok(!s.includes(v), `la salida publica no lleva ${v}`);
  assert.equal(h.odoo.lines[0].x_travel_reason, 'Salud', 'el texto declarado no se toca');
  assert.equal(writes(h.odoo), 0);
  assert.equal(h.made(), 0);
});

test('comprobacion con datos completos: lista para enviar salvo puertas; nunca usa x_name ni la tarifa', async () => {
  const h = harness(READY());
  const r = await run(h, false, { TRA_ONLY_ORDER: '1' });
  assert.equal(r.exitCode, 0);
  assert.equal(r.out.check.ready_data, true);
  assert.equal(r.out.check.ready_to_send, false);
  assert.deepEqual(r.out.check.gates.sort(), ['SIN_TOKEN', 'TRA_ENABLED_APAGADO']);
  assert.equal(r.out.check.pending, 2);
  assert.ok(r.out.check.lines.every((l) => l.codes.length === 0));
  assert.equal(writes(h.odoo), 0);
  assert.equal(h.made(), 0);
});

test('envio real con importe confirmado distinto de la tarifa: se envia lo pagado; solo el pedido elegido', async () => {
  const data = READY();
  data.amounts = [paid(1, { x_amount: 58500 }), paid(2)];
  data.orders = { 1: { x_checkout: '2026-11-21' } }; // fecha prevista de la reserva distinta de la salida real
  const h = harness(data);
  const r = await run(h, true, { ...OPEN, TRA_ONLY_ORDER: '1', GITHUB_RUN_ID: '9' });
  assert.equal(r.exitCode, 0);
  assert.equal(r.out.results.length, 1);
  assert.equal(r.out.results[0].orderId, 1);
  assert.equal(r.out.results[0].main.result, 'aceptado');
  const one = h.payloads.find((x) => x.kind === 'one').p;
  assert.equal(one.costo, '58500', 'importe confirmado, no la tarifa 65000');
  assert.equal(one.nombre_establecimiento, 'Nombre RNT (TEST)');
  assert.equal(one.motivo, 'Vacaciones');
  assert.equal(one.check_out, '2026-11-19', 'salida real, no la fecha prevista');
  assert.deepEqual(Object.keys(one), ['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'motivo', 'numero_acompanantes', 'check_in', 'check_out', 'tipo_acomodacion', 'costo', 'nombre_establecimiento', 'rnt_establecimiento']);
  assert.deepEqual(Object.keys(h.payloads.find((x) => x.kind === 'two').p), ['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'check_in', 'check_out', 'padre']);
  assert.deepEqual(h.payloads.map((x) => x.kind), ['one', 'two']);
  assert.deepEqual(h.odoo.calls.claims.flat().sort(), [1, 2]);
  assert.equal(h.odoo.lines[2].x_tra_state, 'pendiente');
  assert.equal(h.odoo.lines[3].x_tra_state, 'pendiente');
  assert.ok(!JSON.stringify(r.out).includes('Nombre1'));
});

test('envio real sin importe confirmado o con pago sin respaldo: bloqueado sin llamadas ni escrituras', async () => {
  const variants = [
    [[], 'IMPORTE_AUSENTE'],
    [[paid(1, { x_state: false })], 'IMPORTE_SIN_CONFIRMAR'], // p. ej. el "Paid" de Smoobu anotado sin contrastar
    [[paid(1, { x_state: 'borrador' })], 'IMPORTE_SIN_CONFIRMAR'],
    [[paid(1, { x_evidence_ref: '', x_evidence_name: '' })], 'IMPORTE_SIN_EVIDENCIA'],
    [[paid(1, { x_state: 'anulado' })], 'IMPORTE_AUSENTE'],
    [[paid(1, { x_excludes_taxes: false })], 'IMPORTE_SIN_CONSTANCIA_SIN_IMPUESTOS'],
    [[paid(1, { x_covers_all_guests: false })], 'IMPORTE_SIN_CONSTANCIA_ALCANCE'],
    [[paid(1, { x_cutoff_date: '2026-11-18' })], 'IMPORTE_CORTE_ANTES_DE_SALIDA'], // anticipo cobrado antes del check-out
  ];
  for (const [amounts, code] of variants) {
    const h = harness({ lines: [g(1, 1, true)], amounts });
    const r = await run(h, true, { ...OPEN, TRA_ONLY_ORDER: '1' });
    assert.equal(r.exitCode, 1, code);
    assert.equal(r.out.code, 'DATOS_NO_LISTOS');
    assert.ok(r.out.check.blocks.includes(code), code);
    assert.equal(h.made(), 0);
    assert.equal(writes(h.odoo), 0);
  }
});

test('envio real con puertas cerradas y datos completos: error visible, cero llamadas y cero escrituras', async () => {
  for (const [env, catalog] of [[{ TRA_ENABLED: 'no', TRA_TOKEN: 't' }, CAT], [{ TRA_ENABLED: 'yes-real' }, CAT], [OPEN, { ...CAT, verified: false }]]) {
    const h = harness(READY());
    const r = await run(h, true, { ...env, TRA_ONLY_ORDER: '1' }, catalog);
    assert.equal(r.exitCode, 1);
    assert.equal(r.out.code, 'PUERTAS_CERRADAS');
    assert.equal(h.made(), 0);
    assert.equal(writes(h.odoo), 0);
  }
});

test('programado: autorizacion independiente (TRA_AUTO_SEND), sin pedido, y no envia estancias con datos incompletos', async () => {
  for (const auto of [undefined, '', 'no', 'si', 'YES']) {
    const h = harness(READY());
    const r = await run(h, true, { ...OPEN, TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: auto });
    assert.equal(r.out.code, 'ENVIO_PROGRAMADO_NO_AUTORIZADO');
    assert.equal(h.odoo.calls.reads.length, 0);
  }
  const h1 = harness(READY());
  const r1 = await run(h1, false, { ...OPEN, TRA_TRIGGER: 'schedule' });
  assert.deepEqual(r1.out, { ok: true, mode: 'dry-run', trigger: 'schedule', orders_with_pending_tra: [1, 2] });
  const r2 = await run(harness(READY()), false, { TRA_TRIGGER: 'schedule', TRA_ONLY_ORDER: '1' });
  assert.equal(r2.out.code, 'PEDIDO_NO_ADMITIDO_EN_PROGRAMADO');
  const data = READY(); data.amounts = [paid(2)];
  const h3 = harness(data);
  const r3 = await run(h3, true, { ...OPEN, TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: 'yes' });
  assert.equal(r3.out.results.find((x) => x.orderId === 1).stop, 'DATOS_NO_LISTOS');
  assert.equal(r3.out.results.find((x) => x.orderId === 2).main.result, 'aceptado');
  assert.ok(h3.odoo.calls.claims.flat().every((id) => id === 3 || id === 4), 'nada del pedido sin importe');
  const h4 = harness(READY());
  const r4 = await run(h4, true, { ...OPEN, TRA_TRIGGER: 'workflow_dispatch', TRA_AUTO_SEND: 'yes' });
  assert.equal(r4.out.code, 'PEDIDO_VACIO', 'TRA_AUTO_SEND no amplia el alcance manual');
});

test('antes del check-out: cero envios en manual y programado (falte la salida del principal o de un acompanante)', async () => {
  const variants = [
    [g(1, 1, true, { x_departed_at: false }), g(2, 1, false, { x_departed_at: false })],
    [g(1, 1, true), g(2, 1, false, { x_departed_at: false })],
    [g(1, 1, true, { x_departed_at: false }), g(2, 1, false)],
  ];
  for (const lines of variants) {
    for (const send of [false, true]) {
      const h = harness({ lines: lines.map((l) => ({ ...l })), amounts: [paid(1)] });
      const r = await run(h, send, { ...OPEN, TRA_ONLY_ORDER: '1' });
      assert.equal(r.exitCode, 1);
      assert.equal(r.out.code, 'DATOS_NO_LISTOS');
      assert.ok(r.out.check.blocks.includes('ESTANCIA_SIN_SALIDA_REAL'));
      assert.ok(r.out.check.blocks.includes('IMPORTE_ESPERA_SALIDA'), 'sin salida el importe no es definitivo');
      assert.ok(r.out.check.lines.some((l) => l.codes.includes('SIN_SALIDA_REAL')));
      assert.equal(h.made(), 0);
      assert.equal(writes(h.odoo), 0);
    }
    const hs = harness({ lines: lines.map((l) => ({ ...l })), amounts: [paid(1)] });
    const rs = await run(hs, true, { ...OPEN, TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: 'yes' });
    assert.ok(rs.out.results.every((x) => x.stop === 'DATOS_NO_LISTOS'));
    assert.equal(hs.made(), 0);
    assert.equal(writes(hs.odoo), 0);
  }
  // el listado programado solo incluye fichas con salida real
  const hl = harness({ lines: [g(1, 1, true, { x_departed_at: false }), g(3, 2, true)], amounts: [paid(1), paid(2)] });
  const rl = await run(hl, false, { TRA_TRIGGER: 'schedule' });
  assert.deepEqual(rl.out.orders_with_pending_tra, [2]);
  assert.ok(hl.odoo.calls.reads.find((x) => x.model === 'x_guests_line').domain.some(([f, op, v]) => f === 'x_departed_at' && op === '!=' && v === false));
});

test('programado: se detiene en la primera estancia con una peticion fallida; las demas no se tocan', async () => {
  for (const step of ['400', 'timeout', '500']) {
    const h = harness(READY(), [step]);
    const r = await run(h, true, { ...OPEN, TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: 'yes' });
    assert.equal(r.out.results.length, 1, step);
    assert.deepEqual(r.out.halted, { orderId: 1, code: 'DETENIDO_TRAS_FALLO' });
    assert.equal(h.payloads.length, 1, 'una sola peticion');
    assert.deepEqual(h.odoo.calls.claims.flat(), [1]);
    assert.equal(h.odoo.lines[2].x_tra_state, 'pendiente');
  }
  const ok = harness(READY());
  const r = await run(ok, true, { ...OPEN, TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: 'yes' });
  assert.equal(r.out.halted, undefined);
  assert.equal(ok.payloads.length, 4);
});

test('reenvio tras rechazo revisado: se admite uno; al segundo fallo real la comprobacion bloquea para soporte', async () => {
  const h = harness({ lines: [g(1, 1, true)], amounts: [paid(1)] }, ['400', '400']);
  const env = { ...OPEN, TRA_ONLY_ORDER: '1' };
  await run(h, true, env);
  assert.equal(h.odoo.lines[0].x_tra_state, 'rechazado');
  const blocked = await run(h, true, env);
  assert.equal(blocked.out.code, 'PEDIDO_SIN_TRA_PENDIENTE', 'rechazado sin revisar: no hay nada pendiente');
  h.odoo.lines[0].x_tra_state = 'pendiente'; // Recepcion: "no recibido" tras revisar el portal
  await run(h, true, env);
  assert.equal(h.payloads.length, 2);
  h.odoo.lines[0].x_tra_state = 'pendiente';
  const r = await run(h, true, env);
  assert.equal(r.out.code, 'DATOS_NO_LISTOS');
  assert.ok(r.out.check.lines[0].codes.includes('INTENTOS_FALLIDOS_REPETIDOS'));
  assert.equal(h.payloads.length, 2, 'sin tercera peticion');
});

test('script real (scripts/tra-emit.mjs): rechazos sin ninguna peticion de red', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tra-run-'));
  const netLog = join(dir, 'net.log');
  const preload = join(dir, 'no-net.mjs');
  writeFileSync(preload, `import { appendFileSync } from 'node:fs';\nglobalThis.fetch = async (url) => { appendFileSync(${JSON.stringify(netLog)}, String(url) + '\\n'); throw new Error('red prohibida en la prueba'); };\n`);
  const script = fileURLToPath(new URL('../scripts/tra-emit.mjs', import.meta.url));
  const base = { PATH: process.env.PATH, ODOO_BASE_URL: 'https://odoo.invalid', ODOO_DATABASE: 'x', ODOO_API_KEY: 'k', TRA_ENABLED: 'yes-real', TRA_TOKEN: 't' };
  const cases = [
    [['--send'], { TRA_TRIGGER: 'workflow_dispatch', TRA_ONLY_ORDER: '' }, 'PEDIDO_VACIO'],
    [[], { TRA_TRIGGER: 'workflow_dispatch', TRA_ONLY_ORDER: '' }, 'PEDIDO_VACIO'],
    [['--send'], { TRA_TRIGGER: 'workflow_dispatch', TRA_ONLY_ORDER: '22253;22255' }, 'PEDIDO_INVALIDO'],
    [['--send'], { TRA_TRIGGER: 'workflow_dispatch', TRA_ONLY_ORDER: '9007199254740993' }, 'PEDIDO_FUERA_DE_RANGO'],
    [['--send'], {}, 'PEDIDO_VACIO'], // ejecucion local sin disparador: se trata como manual
    [['--send'], { TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: 'no' }, 'ENVIO_PROGRAMADO_NO_AUTORIZADO'],
  ];
  for (const [args, env, code] of cases) {
    const p = spawnSync(process.execPath, ['--import', preload, script, ...args], { env: { ...base, ...env }, encoding: 'utf8' });
    assert.equal(p.status, 1, `${code}: ${p.stdout} ${p.stderr}`);
    assert.equal(JSON.parse(p.stdout.trim().split('\n').pop()).code, code);
  }
  assert.equal(existsSync(netLog) ? readFileSync(netLog, 'utf8') : '', '', 'ninguna peticion de red (ni Odoo ni MinCIT)');
});
