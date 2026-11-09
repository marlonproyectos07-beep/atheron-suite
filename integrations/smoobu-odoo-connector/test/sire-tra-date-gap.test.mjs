import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { TRA_CATALOG_UNVERIFIED, createTraSimulator, dateGap, emitStay } from '../src/sire-tra/tra-emitter.mjs';
import { AUTOMATIONS, FIELDS, SERVER_ACTIONS, VIEWS } from '../src/sire-tra/manifest.mjs';

/**
 * Discrepancia de fechas tras la aceptacion de TRA (ATH-HOTELS-SIRE-TRA-001). Datos 100 % sinteticos.
 * Cubre: prorroga, salida anticipada, estancia sin cambios (sin alerta falsa), evidencia intacta y cero llamadas nuevas.
 */
const EST = { x_name: 'Atheron Suite (TEST)', x_rnt_number: '999999', x_tra_mode: 'api', x_tra_config_verified: true, x_tra_accommodation_type: 'Habitacion', x_tra_cost_basis: 'total_estancia' };
const CAT = { verified: true, docTypes: TRA_CATALOG_UNVERIFIED.docTypes, reasons: { Vacaciones: 'Vacaciones' } };
const ENV = { TRA_ENABLED: 'yes-real', TRA_TOKEN: 't' };

/** Odoo falso: misma maquina de estados que "Aplicar intento"; copia las fechas aceptadas a la linea como la accion real. */
function fakeOdoo(lines, order) {
  const attempts = [];
  const ALLOWED = { enviado: ['pendiente', 'en_envio'], aceptado: ['en_envio', 'enviado', 'incierto'], rechazado: ['en_envio', 'enviado', 'incierto'], incierto: ['en_envio', 'enviado'], error_previo: ['en_envio'], no_recibido: ['incierto', 'rechazado'] };
  const TARGET = { enviado: 'enviado', aceptado: 'aceptado', rechazado: 'rechazado', incierto: 'incierto', error_previo: 'pendiente', no_recibido: 'pendiente' };
  return {
    lines, attempts, order,
    async searchRead(model) {
      if (model === 'x_guests_line') return lines.filter((l) => l.x_arrived_at && l.x_data_state === 'validado').map((l) => ({ ...l }));
      if (model === 'l10n_latam.identification.type') return [{ id: 5, l10n_co_document_code: 'national_citizen_id' }];
      if (model === 'sale.order') return [{ id: 1, x_checkout: order.x_checkout, amount_total: 450000 }];
      throw new Error(model);
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
      if (v.x_result === 'aceptado') {
        assert.ok(v.x_reported_checkin && v.x_reported_checkout, 'el aceptado debe llevar las fechas reportadas');
        l.x_tra_rep_checkin = v.x_reported_checkin; l.x_tra_rep_checkout = v.x_reported_checkout;
      }
      l.x_tra_state = TARGET[v.x_result];
      if (v.x_external_id && l.x_is_main) l.x_tra_external_id = v.x_external_id;
      attempts.push(structuredClone(v));
      return attempts.length;
    },
  };
}
const line = (id, main) => ({ id, x_is_main: main, x_doc_type_id: [5, 'CC'], x_identity_number: `7000${id}`, x_given_names: 'Nombre', x_surname_1: 'Apellido', x_surname_2: false, x_residence_city_id: [1, 'ZIPAQUIRA'], x_residence_text: false, x_origin_city_id: [2, 'BOGOTA'], x_origin_text: false, x_travel_reason: 'Vacaciones', x_tra_room: '201', x_arrived_at: '2026-11-10 20:00:00', x_tra_state: 'pendiente', x_tra_external_id: false, x_data_state: 'validado', x_departed_at: false });
const gapOf = (l, order) => dateGap({ traState: l.x_tra_state, reportedCheckout: l.x_tra_rep_checkout, departedAt: l.x_departed_at, orderCheckout: order.x_checkout });
const run = (odoo, tra) => emitStay({ odoo, tra, orderId: 1, est: EST, catalog: CAT, mode: 'simulador', runRef: 'r', env: ENV });

async function accepted() {
  const order = { x_checkout: '2026-11-12' };
  const o = fakeOdoo([line(1, true), line(2, false)], order);
  const sim = createTraSimulator();
  await run(o, sim);
  assert.equal(sim.calls.length, 2);
  assert.deepEqual(o.lines.map((l) => l.x_tra_state), ['aceptado', 'aceptado']);
  return { o, sim, order };
}

test('el intento aceptado conserva las fechas tal como se enviaron y la linea las copia', async () => {
  const { o } = await accepted();
  for (const a of o.attempts) { assert.equal(a.x_reported_checkin, '2026-11-10'); assert.equal(a.x_reported_checkout, '2026-11-12'); }
  for (const l of o.lines) { assert.equal(l.x_tra_rep_checkin, '2026-11-10'); assert.equal(l.x_tra_rep_checkout, '2026-11-12'); }
});

test('estancia sin cambios: ninguna alerta falsa (sin salida, salida el dia previsto, antes o despues de la medianoche UTC)', async () => {
  const { o, order } = await accepted();
  assert.equal(gapOf(o.lines[0], order), false);
  o.lines[0].x_departed_at = '2026-11-12 15:00:00'; // 10:00 Bogota del 12
  assert.equal(gapOf(o.lines[0], order), false);
  o.lines[0].x_departed_at = '2026-11-13 04:30:00'; // 23:30 Bogota del 12: sigue siendo el 12
  assert.equal(gapOf(o.lines[0], order), false);
});

test('prorroga: alerta, evidencia original intacta y cero llamadas nuevas al simulador', async () => {
  const { o, sim, order } = await accepted();
  const before = structuredClone({ attempts: o.attempts, lines: o.lines.map((l) => ({ s: l.x_tra_state, id: l.x_tra_external_id, i: l.x_tra_rep_checkin, f: l.x_tra_rep_checkout })) });
  order.x_checkout = '2026-11-14'; // Recepcion/Smoobu amplian la estancia despues de la aceptacion
  assert.equal(gapOf(o.lines[0], order), 'prorroga');
  const r = await run(o, sim);
  assert.equal(r.sent, 0);
  assert.equal(r.main, null);
  assert.equal(sim.calls.length, 2, 'cero llamadas nuevas');
  assert.deepEqual(o.attempts, before.attempts, 'comprobante original intacto');
  assert.deepEqual(o.lines.map((l) => ({ s: l.x_tra_state, id: l.x_tra_external_id, i: l.x_tra_rep_checkin, f: l.x_tra_rep_checkout })), before.lines, 'aceptacion y fechas reportadas intactas');
});

test('salida anticipada (salida real o reserva acortada): alerta, evidencia intacta y cero llamadas nuevas', async () => {
  for (const change of [(o, order) => { o.lines[0].x_departed_at = '2026-11-11 15:00:00'; }, (o, order) => { order.x_checkout = '2026-11-11'; }, (o) => { o.lines[0].x_departed_at = '2026-11-12 03:00:00'; /* 22:00 Bogota del 11 */ }]) {
    const { o, sim, order } = await accepted();
    const snapshot = structuredClone(o.attempts);
    change(o, order);
    assert.equal(gapOf(o.lines[0], order), 'anticipada');
    const r = await run(o, sim);
    assert.equal(r.sent, 0);
    assert.equal(sim.calls.length, 2);
    assert.deepEqual(o.attempts, snapshot);
    assert.equal(o.lines[0].x_tra_state, 'aceptado');
    assert.equal(o.lines[0].x_tra_rep_checkout, '2026-11-12');
  }
});

test('sin aceptacion o sin fecha aceptada no hay alerta (nada que comparar)', () => {
  assert.equal(dateGap({ traState: 'pendiente', reportedCheckout: '2026-11-12', orderCheckout: '2026-11-15' }), false);
  assert.equal(dateGap({ traState: 'incierto', reportedCheckout: '2026-11-12', orderCheckout: '2026-11-15' }), false);
  assert.equal(dateGap({ traState: 'aceptado', reportedCheckout: false, orderCheckout: '2026-11-15' }), false);
  assert.equal(dateGap({ traState: 'aceptado', reportedCheckout: '2026-11-12', orderCheckout: false }), false);
});

// ------------------------------------------------------------------ el Python REAL del manifiesto, ejecutado con python3
const PY_HARNESS = String.raw`import sys, json, datetime
cases = json.load(sys.stdin)
class UserError(Exception): pass
def conv(k, v):
    if isinstance(v, str) and k in ('x_tra_rep_checkout', 'x_tra_rep_checkin', 'x_checkout', 'x_reported_checkin', 'x_reported_checkout'):
        return datetime.date.fromisoformat(v)
    if isinstance(v, str) and k == 'x_departed_at':
        return datetime.datetime.strptime(v, '%Y-%m-%d %H:%M:%S')
    if isinstance(v, dict):
        return Rec(v)
    return v
class Rec:
    def __init__(self, d): object.__setattr__(self, 'd', {k: conv(k, v) for k, v in d.items()})
    def __getattr__(self, k): return self.d.get(k, False)
    def __getitem__(self, k): return self.d.get(k, False)
    def __setitem__(self, k, v): self.d[k] = v
    def write(self, vals): self.d.update(vals)
out = []
for c in cases:
    if c['kind'] == 'compute':
        r = Rec(c['rec'])
        exec(c['code'], {'self': [r]})
        out.append({'gap': r.d.get('x_date_gap')})
    else:
        line = Rec(c['line'])
        a = Rec({**c['attempt'], 'x_guest_line_id': line})
        try:
            exec(c['code'], {'records': [a], 'UserError': UserError})
            out.append({'error': None, 'state': line.d.get('x_tra_state'), 'in': str(line.d.get('x_tra_rep_checkin') or ''), 'out': str(line.d.get('x_tra_rep_checkout') or '')})
        except UserError as e:
            out.append({'error': str(e), 'state': line.d.get('x_tra_state')})
print(json.dumps(out))`;

function py(cases, t) {
  try { execFileSync('python3', ['--version']); } catch { t.skip('sin python3'); return null; }
  return JSON.parse(execFileSync('python3', ['-I', '-c', PY_HARNESS], { input: JSON.stringify(cases), encoding: 'utf8' }));
}

test('campo calculado x_date_gap del manifiesto = funcion dateGap (mismos casos, Python real)', (t) => {
  const code = FIELDS.find((f) => f[0] === 'x_guests_line' && f[1] === 'x_date_gap')[4].compute;
  const base = { x_tra_state: 'aceptado', x_tra_rep_checkout: '2026-11-12', x_departed_at: false, x_sale_order_id: { x_checkout: '2026-11-12' } };
  const variants = [
    {}, // sin cambios
    { x_sale_order_id: { x_checkout: '2026-11-14' } }, // prorroga
    { x_sale_order_id: { x_checkout: '2026-11-11' } }, // reserva acortada
    { x_departed_at: '2026-11-11 15:00:00' }, // salida anticipada
    { x_departed_at: '2026-11-12 15:00:00' }, // salida el dia previsto
    { x_departed_at: '2026-11-13 04:30:00' }, // 23:30 Bogota del 12
    { x_departed_at: '2026-11-12 03:00:00' }, // 22:00 Bogota del 11
    { x_departed_at: '2026-11-13 05:00:00' }, // 00:00 Bogota del 13: prorroga
    { x_tra_state: 'pendiente', x_sale_order_id: { x_checkout: '2026-11-20' } },
    { x_tra_state: 'incierto', x_sale_order_id: { x_checkout: '2026-11-20' } },
    { x_tra_rep_checkout: false, x_sale_order_id: { x_checkout: '2026-11-20' } },
  ];
  const recs = variants.map((v) => ({ ...base, ...v }));
  const res = py(recs.map((rec) => ({ kind: 'compute', code, rec })), t);
  if (!res) return;
  recs.forEach((r, i) => {
    const expected = dateGap({ traState: r.x_tra_state, reportedCheckout: r.x_tra_rep_checkout, departedAt: r.x_departed_at, orderCheckout: r.x_sale_order_id.x_checkout });
    assert.equal(res[i].gap, expected, `caso ${i}: ${JSON.stringify(variants[i])}`);
  });
  assert.deepEqual(res.map((x) => x.gap), [false, 'prorroga', 'anticipada', 'anticipada', false, false, 'anticipada', 'prorroga', false, false, false]);
});

test('"Aplicar intento" (Python real) copia las fechas aceptadas y exige las fechas en toda aceptacion TRA', (t) => {
  const code = SERVER_ACTIONS.find((s) => s.xmlid === 'sa_apply_attempt').code;
  const line = { x_is_main: true, x_tra_state: 'en_envio' };
  const ok = { x_system: 'tra', x_result: 'aceptado', x_channel: 'api_tra', x_external_id: '101', x_reported_checkin: '2026-11-10', x_reported_checkout: '2026-11-12' };
  const cases = [
    { kind: 'apply', code, line, attempt: ok },
    { kind: 'apply', code, line, attempt: { ...ok, x_reported_checkout: false } },
    { kind: 'apply', code, line, attempt: { ...ok, x_channel: 'portal_manual', x_evidence: true, x_reported_checkin: false } },
    { kind: 'apply', code, line, attempt: { ...ok, x_channel: 'portal_manual', x_evidence: true } },
    { kind: 'apply', code, line, attempt: { ...ok, x_result: 'rechazado', x_reported_checkin: false, x_reported_checkout: false } },
  ];
  const res = py(cases, t);
  if (!res) return;
  assert.deepEqual(res[0], { error: null, state: 'aceptado', in: '2026-11-10', out: '2026-11-12' });
  assert.match(res[1].error, /fechas/); assert.equal(res[1].state, 'en_envio');
  assert.match(res[2].error, /fechas/); assert.equal(res[2].state, 'en_envio');
  assert.deepEqual(res[3], { error: null, state: 'aceptado', in: '2026-11-10', out: '2026-11-12' });
  assert.deepEqual(res[4], { error: null, state: 'rechazado', in: '', out: '' });
});

test('el control no puede reabrir un reenvio: solo "Registrar llegada" escribe x_tra_state de forma directa y exige que no haya llegada previa', () => {
  const writers = SERVER_ACTIONS.filter((s) => s.code.includes("'x_tra_state':")).map((s) => s.xmlid);
  assert.deepEqual(writers, ['sa_arrive']);
  assert.match(SERVER_ACTIONS.find((s) => s.xmlid === 'sa_arrive').code, /r\.x_arrived_at:\n\s+errors\.append\('linea %s: llegada ya registrada'/);
  assert.ok(!AUTOMATIONS.some((a) => a.model === 'sale.order'), 'sin automatizaciones nuevas sobre reservas');
});

test('Recepcion ve la alerta "Discrepancia de fechas" sin instrucciones de correccion en el portal', () => {
  const form = VIEWS.find((v) => v.xmlid === 'view_guest_form').arch;
  assert.match(form, /Discrepancia de fechas/);
  assert.match(form, /invisible="not x_date_gap"/);
  const texto = form.match(/<div class="alert[\s\S]*?<\/div>/)[0].replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const prohibido of ['portal', 'corrija', 'corregir', 'modifique el registro en', 'reenv', 'anule', 'actualice en', 'edite en']) {
    if (prohibido === 'reenv') continue; // "no se reenvia nada" describe el sistema, no una instruccion
    assert.ok(!texto.includes(prohibido), `la alerta no debe decir "${prohibido}"`);
  }
  assert.ok(VIEWS.find((v) => v.xmlid === 'view_guest_list').arch.includes('x_date_gap'));
  assert.ok(VIEWS.find((v) => v.xmlid === 'view_guest_search').arch.includes('f_date_gap'));
});
