import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRA_CATALOG_UNVERIFIED, createTraSimulator } from '../src/sire-tra/tra-emitter.mjs';
import { ODOO_MAX_ID, parseOrderId, runEmitter } from '../src/sire-tra/tra-run.mjs';

// ATH-HOTELS-SIRE-TRA-001 · recorrido del emisor (scripts/tra-emit.mjs -> runEmitter). Datos sinteticos.
const EST = { id: 1, x_name: 'Establecimiento de prueba', x_rnt_number: '999999', x_tra_mode: 'api', x_tra_config_verified: true, x_tra_accommodation_type: 'Casa', x_tra_cost_basis: 'total_estancia' };
const CAT = { verified: true, docTypes: TRA_CATALOG_UNVERIFIED.docTypes, mainDocTypes: TRA_CATALOG_UNVERIFIED.mainDocTypes, reasons: { Vacaciones: 'Vacaciones' } };
const OPEN = { TRA_ENABLED: 'yes-real', TRA_TOKEN: 'token-sintetico' };

const g = (id, order, main, extra = {}) => ({ id, x_sale_order_id: [order, `PEDIDO-${order}`], x_establishment_id: [1, 'E'], x_is_main: main, x_doc_type_id: [5, 'CC'], x_identity_number: `9${order}${id}`, x_given_names: `Nombre${order}`, x_surname_1: 'Apellido', x_surname_2: false, x_residence_city_id: [1, 'CIUDAD'], x_residence_text: false, x_origin_city_id: [2, 'ORIGEN'], x_origin_text: false, x_travel_reason: 'Vacaciones', x_tra_room: String(200 + order), x_arrived_at: '2026-11-18 20:00:00', x_tra_state: 'pendiente', x_tra_external_id: false, x_data_state: 'validado', ...extra });

/** Odoo falso que respeta los dominios y cuenta lecturas y escrituras. */
function fakeOdoo(lines) {
  const calls = { reads: [], creates: [], claims: [] };
  const match = (rec, [f, op, v]) => {
    const val = Array.isArray(rec[f]) ? rec[f][0] : rec[f];
    if (op === '=') return val === v;
    if (op === '!=') return v === false ? !!val : val !== v;
    if (op === 'in') return v.includes(val);
    throw new Error(`op ${op}`);
  };
  return {
    lines, calls,
    async searchRead(model, domain) {
      calls.reads.push({ model, domain });
      if (model === 'x_guests_line') return lines.filter((l) => domain.every((d) => match(l, d))).map((l) => ({ ...l }));
      if (model === 'x_establishment') return [EST];
      if (model === 'l10n_latam.identification.type') return [{ id: 5, l10n_co_document_code: 'national_citizen_id' }];
      if (model === 'sale.order') { const id = domain[0][2]; return [{ id, x_checkout: '2026-11-19', amount_total: 65000 }]; }
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
      l.x_tra_state = v.x_result === 'aceptado' ? 'aceptado' : v.x_result;
      if (v.x_external_id && l.x_is_main) l.x_tra_external_id = v.x_external_id;
      return calls.creates.length;
    },
  };
}

function harness(lines) {
  const odoo = fakeOdoo(lines);
  const sim = createTraSimulator();
  let made = 0;
  const makeTra = () => { made += 1; return sim; };
  return { odoo, sim, makeTra, made: () => made };
}

const writes = (o) => o.calls.creates.length + o.calls.claims.length;

test('parseOrderId: solo enteros positivos dentro del rango de ids de Odoo', () => {
  assert.deepEqual(parseOrderId('22253'), { ok: true, id: 22253 });
  assert.deepEqual(parseOrderId(' 22253 '), { ok: true, id: 22253 });
  assert.deepEqual(parseOrderId(String(ODOO_MAX_ID)), { ok: true, id: ODOO_MAX_ID });
  for (const v of ['', '   ', undefined, null]) assert.equal(parseOrderId(v).code, 'PEDIDO_VACIO', String(v));
  for (const v of ['abc', '0', '007', '-1', '1e3', '22 253', '22253,22255', '22253.0', '0x10', '+5']) assert.equal(parseOrderId(v).code, 'PEDIDO_INVALIDO', v);
  for (const v of [String(ODOO_MAX_ID + 1), '9007199254740993', '99999999999999999999']) assert.equal(parseOrderId(v).code, 'PEDIDO_FUERA_DE_RANGO', v);
});

test('manual (simulacion y envio real) sin pedido valido: error, cero llamadas a MinCIT y cero accesos a Odoo', async () => {
  for (const send of [false, true]) {
    for (const [order, code] of [['', 'PEDIDO_VACIO'], [undefined, 'PEDIDO_VACIO'], ['abc', 'PEDIDO_INVALIDO'], ['22253,22255', 'PEDIDO_INVALIDO'], ['-1', 'PEDIDO_INVALIDO'], ['9007199254740993', 'PEDIDO_FUERA_DE_RANGO'], [String(ODOO_MAX_ID + 1), 'PEDIDO_FUERA_DE_RANGO']]) {
      const h = harness([g(1, 1, true), g(2, 2, true)]);
      const r = await runEmitter({ send, env: { ...OPEN, TRA_TRIGGER: 'workflow_dispatch', TRA_ONLY_ORDER: order }, catalog: CAT, odoo: h.odoo, makeTra: h.makeTra });
      assert.equal(r.exitCode, 1, `${send} ${order}`);
      assert.equal(r.out.ok, false);
      assert.equal(r.out.code, code);
      assert.equal(h.sim.calls.length, 0);
      assert.equal(h.made(), 0);
      assert.equal(h.odoo.calls.reads.length, 0);
      assert.equal(writes(h.odoo), 0);
      assert.ok(h.odoo.lines.every((l) => l.x_tra_state === 'pendiente'));
    }
  }
});

test('manual con pedido sin TRA pendiente: error en simulacion y en envio, sin escrituras ni llamadas a MinCIT', async () => {
  const cases = [
    [g(1, 1, true)], // el pedido 7 no existe
    [g(1, 7, true, { x_tra_state: 'aceptado', x_tra_external_id: '55' })], // ya reportado
    [g(1, 7, true, { x_arrived_at: false })], // sin llegada real
  ];
  for (const send of [false, true]) {
    for (const lines of cases) {
      const h = harness(lines);
      const r = await runEmitter({ send, env: { ...OPEN, TRA_ONLY_ORDER: '7' }, catalog: CAT, odoo: h.odoo, makeTra: h.makeTra });
      assert.equal(r.exitCode, 1);
      assert.equal(r.out.code, 'PEDIDO_SIN_TRA_PENDIENTE');
      assert.equal(h.sim.calls.length, 0);
      assert.equal(writes(h.odoo), 0);
      assert.deepEqual(h.odoo.calls.reads[0].domain[0], ['x_sale_order_id', '=', 7], 'la lectura se limita al pedido');
    }
  }
});

test('manual: simulacion con pedido valido solo cuenta ese pedido, sin reclamar ni contactar a MinCIT', async () => {
  const h = harness([g(1, 1, true), g(2, 1, false), g(3, 2, true)]);
  const r = await runEmitter({ send: false, env: { ...OPEN, TRA_ONLY_ORDER: '1' }, catalog: CAT, odoo: h.odoo, makeTra: h.makeTra });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.out, { ok: true, mode: 'dry-run', trigger: 'manual', order: 1, pending_lines: 2 });
  assert.equal(h.sim.calls.length, 0);
  assert.equal(writes(h.odoo), 0);
});

test('manual con envio real: seleccionar un pedido no procesa huespedes de otra estancia', async () => {
  const h = harness([g(1, 1, true), g(2, 1, false), g(3, 2, true), g(4, 2, false)]);
  const r = await runEmitter({ send: true, env: { ...OPEN, TRA_ONLY_ORDER: '1', GITHUB_RUN_ID: '9' }, catalog: CAT, odoo: h.odoo, makeTra: h.makeTra, now: () => 0 });
  assert.equal(r.exitCode, 0);
  assert.equal(r.out.results.length, 1);
  assert.equal(r.out.results[0].orderId, 1);
  assert.equal(r.out.results[0].main.result, 'aceptado');
  assert.deepEqual(h.sim.calls.map((c) => c.kind), ['one', 'two']);
  assert.deepEqual(h.odoo.calls.claims.flat().sort(), [1, 2]);
  assert.deepEqual(h.odoo.calls.creates.map((c) => c.x_guest_line_id).sort(), [1, 2]);
  assert.equal(h.odoo.lines[2].x_tra_state, 'pendiente');
  assert.equal(h.odoo.lines[3].x_tra_state, 'pendiente');
  const orderReads = h.odoo.calls.reads.filter((x) => x.model === 'x_guests_line');
  assert.ok(orderReads.every((x) => x.domain.some(([f, op, v]) => f === 'x_sale_order_id' && op === '=' && v === 1)), 'toda lectura de huespedes se limita al pedido');
  assert.ok(!JSON.stringify(r.out).includes('Nombre'), 'la salida no lleva datos personales');
});

test('manual con envio real y puertas cerradas: error visible, cero llamadas a MinCIT y cero escrituras', async () => {
  for (const [env, catalog] of [[{ TRA_ENABLED: 'no', TRA_TOKEN: 't' }, CAT], [{ TRA_ENABLED: 'yes-real' }, CAT], [OPEN, { ...CAT, verified: false }]]) {
    const h = harness([g(1, 1, true)]);
    const r = await runEmitter({ send: true, env: { ...env, TRA_ONLY_ORDER: '1' }, catalog, odoo: h.odoo, makeTra: h.makeTra });
    assert.equal(r.exitCode, 1);
    assert.equal(r.out.code, 'PUERTAS_CERRADAS');
    assert.equal(h.sim.calls.length, 0);
    assert.equal(h.made(), 0);
    assert.equal(writes(h.odoo), 0);
  }
});

test('programado: autorizacion independiente (TRA_AUTO_SEND) y sin pedido', async () => {
  for (const auto of [undefined, '', 'no', 'si', 'YES']) {
    const h = harness([g(1, 1, true)]);
    const r = await runEmitter({ send: true, env: { ...OPEN, TRA_TRIGGER: 'schedule', TRA_AUTO_SEND: auto }, catalog: CAT, odoo: h.odoo, makeTra: h.makeTra });
    assert.equal(r.exitCode, 1);
    assert.equal(r.out.code, 'ENVIO_PROGRAMADO_NO_AUTORIZADO');
    assert.equal(h.sim.calls.length, 0);
    assert.equal(h.odoo.calls.reads.length, 0);
  }
  const h1 = harness([g(1, 1, true)]);
  const r1 = await runEmitter({ send: false, env: { ...OPEN, TRA_TRIGGER: 'schedule' }, catalog: CAT, odoo: h1.odoo, makeTra: h1.makeTra });
  assert.deepEqual(r1.out, { ok: true, mode: 'dry-run', trigger: 'schedule', orders_with_pending_tra: [1] });
  assert.equal(writes(h1.odoo), 0);
  const h2 = harness([g(1, 1, true)]);
  const r2 = await runEmitter({ send: false, env: { TRA_TRIGGER: 'schedule', TRA_ONLY_ORDER: '1' }, catalog: CAT, odoo: h2.odoo, makeTra: h2.makeTra });
  assert.equal(r2.out.code, 'PEDIDO_NO_ADMITIDO_EN_PROGRAMADO');
  assert.equal(h2.odoo.calls.reads.length, 0);
  // Ejecucion manual con TRA_AUTO_SEND=yes no amplia el alcance: sigue exigiendo pedido.
  const h3 = harness([g(1, 1, true), g(2, 2, true)]);
  const r3 = await runEmitter({ send: true, env: { ...OPEN, TRA_TRIGGER: 'workflow_dispatch', TRA_AUTO_SEND: 'yes' }, catalog: CAT, odoo: h3.odoo, makeTra: h3.makeTra });
  assert.equal(r3.out.code, 'PEDIDO_VACIO');
  assert.equal(h3.sim.calls.length, 0);
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
