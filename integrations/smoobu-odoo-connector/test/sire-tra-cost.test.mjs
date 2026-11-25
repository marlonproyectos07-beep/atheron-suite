import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TRA_CATALOG_UNVERIFIED, buildPayload, confirmedCost, reasonStatus } from '../src/sire-tra/tra-emitter.mjs';
import { ACLS, AUTOMATIONS, FIELDS, MODELS, SERVER_ACTIONS } from '../src/sire-tra/manifest.mjs';

// ATH-HOTELS-SIRE-TRA-001 · importe pagado confirmado, nombre TRA y motivo. Datos sinteticos.
const EST = { x_name: 'Nombre interno', x_tra_establishment_name: 'Nombre RNT', x_rnt_number: '999999', x_tra_accommodation_type: 'Casa', x_tra_cost_basis: 'total_estancia' };
const ORDER = { x_checkout: '2026-11-19', amount_total: 65000 };
const TODAY = '2026-11-20';
const DEP = '2026-11-19'; // salida real de la estancia (Bogota)
const A = (extra = {}) => ({ id: 1, x_state: 'confirmado', x_amount: 65000, x_currency_id: [8, 'COP'], x_cutoff_date: '2026-11-19', x_evidence_kind: 'comprobante_pago', x_evidence_ref: 'REF', x_evidence_name: 'c.pdf', x_excludes_taxes: true, x_covers_all_guests: true, x_confirmed_by: [2, 'u'], x_confirmed_at: '2026-11-19 18:00:00', write_date: '2026-11-19 18:00:00', ...extra });
const cc = (amounts, est = EST, today = TODAY, departure = DEP) => confirmedCost({ amounts, est, order: ORDER, today, departure });
const line = { x_is_main: true, doc_code: 'national_citizen_id', x_identity_number: '1', x_given_names: 'N', x_surname_1: 'A', x_residence_city_id: [1, 'C'], x_origin_city_id: [2, 'O'], x_tra_room: '203', x_arrived_at: '2026-11-18 20:00:00', x_departed_at: '2026-11-19 16:00:00', x_travel_reason: 'Vacaciones' };
const CAT = { ...TRA_CATALOG_UNVERIFIED, reasons: { Vacaciones: 'Vacaciones' } };

test('importe confirmado distinto de la tarifa: se usa lo pagado y se marca la diferencia', () => {
  const r = cc([A({ x_amount: 58500 })]);
  assert.equal(r.ok, true);
  assert.equal(r.value, '58500');
  assert.equal(r.differsFromRate, true);
  assert.equal(r.rate, 65000);
  assert.equal(cc([A()]).differsFromRate, false);
});

test('sin importe confirmado: falta el dato y el payload no lleva costo (nunca la tarifa)', () => {
  for (const [amounts, code, departure] of [[[], 'IMPORTE_AUSENTE'], [[A({ x_state: false })], 'IMPORTE_SIN_CONFIRMAR'], [[A({ x_state: 'borrador' })], 'IMPORTE_SIN_CONFIRMAR'], [[A()], 'IMPORTE_ESPERA_SALIDA', null]]) {
    const cost = cc(amounts, EST, TODAY, departure === undefined ? DEP : departure);
    assert.equal(cost.code, code);
    const { payload, missing, invalid } = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost });
    assert.equal(payload.costo, '');
    assert.ok(missing.includes('costo'));
    assert.ok(!invalid.includes('costo'));
  }
  const { payload } = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0 });
  assert.equal(payload.costo, '', 'sin fuente confirmada no hay costo aunque exista amount_total');
});

test('pago sin respaldo o con datos no admitidos: bloqueado como dato invalido', () => {
  const cases = [
    [A({ x_evidence_ref: '' }), 'IMPORTE_SIN_EVIDENCIA'],
    [A({ x_evidence_name: '' }), 'IMPORTE_SIN_EVIDENCIA'],
    [A({ x_evidence_kind: 'reporte_smoobu' }), 'IMPORTE_SIN_EVIDENCIA'],
    [A({ x_confirmed_by: false }), 'IMPORTE_SIN_CONFIRMACION_REGISTRADA'],
    [A({ write_date: '2026-11-19 19:00:00' }), 'IMPORTE_MODIFICADO_TRAS_CONFIRMAR'],
    [A({ x_currency_id: [2, 'USD'] }), 'IMPORTE_MONEDA_NO_COP'],
    [A({ x_currency_id: false }), 'IMPORTE_MONEDA_NO_COP'],
    [A({ x_cutoff_date: false }), 'IMPORTE_SIN_FECHA_CORTE'],
    [A({ x_cutoff_date: '2026-11-21' }), 'IMPORTE_FECHA_CORTE_FUTURA'],
    [A({ x_cutoff_date: '2026-11-18' }), 'IMPORTE_CORTE_ANTES_DE_SALIDA'], // anticipo o pago parcial: no es el definitivo
    [A({ x_excludes_taxes: false }), 'IMPORTE_SIN_CONSTANCIA_SIN_IMPUESTOS'],
    [A({ x_excludes_taxes: undefined }), 'IMPORTE_SIN_CONSTANCIA_SIN_IMPUESTOS'],
    [A({ x_covers_all_guests: false }), 'IMPORTE_SIN_CONSTANCIA_ALCANCE'],
    [A({ x_amount: 0 }), 'IMPORTE_INVALIDO'],
    [A({ x_amount: -5 }), 'IMPORTE_INVALIDO'],
  ];
  for (const [a, code] of cases) {
    const cost = cc([a]);
    assert.equal(cost.code, code, code);
    const { payload, missing, invalid } = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost });
    assert.equal(payload.costo, '');
    assert.ok(invalid.includes('costo') && !missing.includes('costo'), code);
  }
  assert.equal(cc([A(), A({ id: 2 })]).code, 'IMPORTE_AMBIGUO');
  assert.equal(cc([A()], { ...EST, x_tra_cost_basis: 'por_noche' }).code, 'COSTO_BASE_NO_ADMITIDA');
  assert.equal(confirmedCost({ amounts: [A()], est: EST, order: ORDER, today: undefined, departure: DEP }).code, 'IMPORTE_FECHA_CORTE_FUTURA', 'sin fecha de hoy no se acepta el corte');
  assert.equal(cc([A({ x_cutoff_date: '2026-11-20' })]).ok, true, 'corte posterior a la salida: admitido');
  // importe con decimales: no se redondea; excepcion especifica (Grupo 2, 4.12: solo numeros)
  const dec = cc([A({ x_amount: 65000.5 })]);
  assert.equal(dec.code, 'EXCEPCION_IMPORTE_CON_DECIMALES');
  const bp = buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost: dec });
  assert.deepEqual([bp.payload.costo, bp.invalid, bp.pending], ['', [], ['costo']]);
  assert.equal(cc([A({ x_amount: 65000 })]).value, '65000');
});

test('nombre enviado a TRA: el del registro oficial, nunca el nombre interno', () => {
  const cost = cc([A()]);
  assert.equal(buildPayload({ line, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost }).payload.nombre_establecimiento, 'Nombre RNT');
  const r = buildPayload({ line, main: true, order: ORDER, est: { ...EST, x_tra_establishment_name: '  ' }, catalog: CAT, companions: 0, cost });
  assert.equal(r.payload.nombre_establecimiento, '');
  assert.ok(r.missing.includes('nombre_establecimiento'));
});

test('motivo: solo la equivalencia verificada del texto declarado; la propuesta no se envia', () => {
  const cat = { ...CAT, reasons: {}, reasonsProposed: { 'Vacaciones, recreación u ocio': 'Vacaciones, recreo y ocio' } };
  const l = { ...line, x_travel_reason: 'Vacaciones, recreación u ocio' };
  assert.equal(reasonStatus(l, cat), 'MOTIVO_EQUIVALENCIA_NO_VERIFICADA');
  assert.equal(buildPayload({ line: l, main: true, order: ORDER, est: EST, catalog: cat, companions: 0, cost: cc([A()]) }).payload.motivo, '');
  assert.equal(reasonStatus({ ...line, x_travel_reason: '' }, cat), 'MOTIVO_NO_DECLARADO');
  assert.equal(reasonStatus({ ...line, x_travel_reason: 'Otro texto' }, cat), 'MOTIVO_SIN_EQUIVALENCIA');
  assert.equal(reasonStatus(line, CAT), 'OK');
  for (const k of ['constructor', 'toString', '__proto__']) {
    assert.equal(buildPayload({ line: { ...line, x_travel_reason: k }, main: true, order: ORDER, est: EST, catalog: CAT, companions: 0, cost: cc([A()]) }).payload.motivo, '', k);
  }
});

test('catalogo del repositorio: sin verificar, sin equivalencias de envio y con propuestas documentadas con fuente', () => {
  const cat = JSON.parse(readFileSync(new URL('../tra-catalog.json', import.meta.url), 'utf8'));
  assert.equal(cat.verified, false);
  assert.deepEqual(cat.reasons, {});
  const proposed = Object.keys(cat.reasonsProposed || {});
  assert.ok(proposed.length > 0);
  for (const k of proposed) assert.ok(cat._fuentesMotivo?.[k], `fuente de la propuesta ${k}`);
});

test('manifiesto: x_tra_amount con evidencia, moneda y corte; confirmar exige todo y no toca contabilidad', () => {
  assert.ok(MODELS.some((m) => m.model === 'x_tra_amount'));
  const f = new Set(FIELDS.filter((x) => x[0] === 'x_tra_amount').map((x) => x[1]));
  for (const k of ['x_sale_order_id', 'x_amount', 'x_currency_id', 'x_cutoff_date', 'x_evidence_kind', 'x_evidence_ref', 'x_evidence', 'x_evidence_name', 'x_excludes_taxes', 'x_covers_all_guests', 'x_state', 'x_confirmed_by', 'x_confirmed_at']) assert.ok(f.has(k), k);
  assert.ok(FIELDS.some((x) => x[0] === 'x_establishment' && x[1] === 'x_tra_establishment_name'));
  const user = ACLS.find((a) => a.model === 'x_tra_amount' && a.group === 'base.group_user');
  assert.deepEqual(user.perms, [1, 0, 1, 0], 'el usuario no edita ni borra; confirma por la accion');
  const code = SERVER_ACTIONS.find((s) => s.xmlid === 'sa_amount_confirm').code;
  for (const needle of ["x_currency_id.name != 'COP'", 'x_cutoff_date > today', 'r.x_evidence', "('x_state', '=', 'confirmado')", 'x_confirmed_by', 'x_confirmed_at', 'r.x_excludes_taxes', 'r.x_covers_all_guests', 'x_departed_at', 'r.x_cutoff_date < last_departure']) assert.ok(code.includes(needle), needle);
  for (const s of SERVER_ACTIONS.filter((x) => x.model === 'x_tra_amount')) assert.ok(!/account\.(move|payment)|sale\.order'\]\.(write|create)/.test(s.code), `${s.xmlid} no toca contabilidad ni pedidos`);
});

test('defectos demostrados en la copia (18/11/2026): D1 crear confirmado, D2 admin edita, D3 usuario no puede confirmar', async () => {
  // D2: nadie (tampoco el administrador) tiene escritura ni borrado sobre x_tra_amount
  for (const a of ACLS.filter((x) => x.model === 'x_tra_amount')) assert.deepEqual([a.perms[1], a.perms[3]], [0, 0], a.xmlid);
  // D3: las acciones del importe llevan grupo (si no, Odoo exige escritura sobre el modelo para ejecutarlas)
  for (const x of ['sa_amount_confirm', 'sa_amount_void', 'sa_amount_guard']) assert.deepEqual(SERVER_ACTIONS.find((s) => s.xmlid === x).groups, ['base.group_user'], x);
  // D1: al crear, cualquier estado o confirmacion dispara el rechazo
  const g = AUTOMATIONS.find((a) => a.xmlid === 'au_amount_guard');
  assert.equal(g.model, 'x_tra_amount'); assert.equal(g.trigger, 'on_create'); assert.equal(g.action, 'sa_amount_guard');
  for (const f of ['x_state', 'x_confirmed_by', 'x_confirmed_at']) assert.ok(g.domain.includes(`('${f}', '!=', False)`), f);
  assert.match(SERVER_ACTIONS.find((s) => s.xmlid === 'sa_amount_guard').code, /^raise UserError\(/);
});

// ------------------------------------------------------------------ el Python REAL de "Confirmar con evidencia"
const PY_CONFIRM = String.raw`import sys, json, datetime, types
class UserError(Exception): pass
class FixedDT(datetime.datetime):
    @classmethod
    def utcnow(cls): return datetime.datetime(2026, 11, 24, 17, 0, 0)
    @classmethod
    def now(cls): return datetime.datetime(2026, 11, 24, 17, 0, 0)
dt = types.SimpleNamespace(datetime=FixedDT, timedelta=datetime.timedelta, date=datetime.date)
class O:
    def __init__(self, **kw): self.__dict__.update(kw)
class Rec:
    def __init__(self, d): self.__dict__['d'] = d
    def __getattr__(self, k): return self.d.get(k, False)
    def __len__(self): return 1
    def __bool__(self): return True
    def sudo(self): return self
    def write(self, vals): self.d.update(vals)
class Model:
    def __init__(self, rows, others): self.rows, self.others = rows, others
    def sudo(self): return self
    def search(self, domain): return self.rows
    def search_count(self, domain): return self.others
out = []
for c in json.load(sys.stdin):
    a = dict(c['amount'])
    if a.get('x_cutoff_date'): a['x_cutoff_date'] = datetime.date.fromisoformat(a['x_cutoff_date'])
    a['x_currency_id'] = O(name=a.get('x_currency_id')) if a.get('x_currency_id') else False
    a['x_sale_order_id'] = O(id=1)
    r = Rec(a)
    lines = [O(x_departed_at=datetime.datetime.strptime(d, '%Y-%m-%d %H:%M:%S') if d else False) for d in c['departures']]
    env = {'x_guests_line': Model(lines, 0), 'x_tra_amount': Model([], c.get('others', 0))}
    class Env(dict):
        user = O(id=2, name='u')
    try:
        exec(c['code'], {'records': r, 'env': Env(env), 'UserError': UserError, 'datetime': dt})
        out.append({'error': None, 'state': r.d.get('x_state')})
    except UserError as e:
        out.append({'error': str(e), 'state': r.d.get('x_state') or None})
print(json.dumps(out))`;

test('"Confirmar con evidencia" (Python real): exige sin impuestos, alcance, salida real de todos y corte >= salida (Bogota)', (t) => {
  try { execFileSync('python3', ['--version']); } catch { t.skip('sin python3'); return; }
  const code = SERVER_ACTIONS.find((s) => s.xmlid === 'sa_amount_confirm').code;
  const ok = { x_state: false, x_amount: 65000, x_currency_id: 'COP', x_cutoff_date: '2026-11-20', x_evidence_kind: 'comprobante_pago', x_evidence_ref: 'REF', x_evidence: 'b64', x_evidence_name: 'c.pdf', x_excludes_taxes: true, x_covers_all_guests: true };
  const dep = ['2026-11-20 15:00:00', '2026-11-19 15:00:00']; // salida de la estancia: 20/11 en Bogota
  const cases = [
    [ok, dep],
    [{ ...ok, x_excludes_taxes: false }, dep],
    [{ ...ok, x_covers_all_guests: false }, dep],
    [ok, ['2026-11-20 15:00:00', null]], // un acompanante sigue alojado
    [ok, []], // sin fichas
    [{ ...ok, x_cutoff_date: '2026-11-19' }, dep], // corte anterior a la salida (anticipo)
    [ok, ['2026-11-21 03:00:00']], // 22:00 Bogota del 20: corte del 20 admitido
    [ok, ['2026-11-21 05:30:00']], // 00:30 Bogota del 21: corte del 20 es anterior
    [{ ...ok, x_cutoff_date: '2026-11-25' }, dep], // corte futuro
    [ok, dep, 1], // ya hay otro confirmado en la reserva
  ];
  const res = JSON.parse(execFileSync('python3', ['-I', '-c', PY_CONFIRM], { input: JSON.stringify(cases.map(([amount, departures, others]) => ({ code, amount, departures, others }))), encoding: 'utf8' }));
  assert.deepEqual(res[0], { error: null, state: 'confirmado' });
  assert.match(res[1].error, /no incluye impuestos/);
  assert.match(res[2].error, /principal y de todos sus acompañantes/);
  assert.match(res[3].error, /salida real de todos/);
  assert.match(res[4].error, /salida real de todos/);
  assert.match(res[5].error, /anterior a la salida real/);
  assert.deepEqual(res[6], { error: null, state: 'confirmado' });
  assert.match(res[7].error, /anterior a la salida real/);
  assert.match(res[8].error, /no puede ser futura/);
  assert.match(res[9].error, /ya tiene un importe confirmado/);
  for (const i of [1, 2, 3, 4, 5, 7, 8, 9]) assert.equal(res[i].state, null, `caso ${i}: no se confirma`);
});
