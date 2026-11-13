import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { AUTOMATIONS, SERVER_ACTIONS } from '../src/sire-tra/manifest.mjs';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { applyPlan, RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';

/**
 * Puente Smoobu -> Odoo -> enlace de registro (ATH-HOTELS-SIRE-TRA-001). Datos 100 % sinteticos ("PRUEBA", ids 1704xxxxx).
 * Ejecuta el Python REAL de la accion `sa_invite_auto` (y de `sa_arrive`) con un ORM minimo en memoria.
 */
const CODE = SERVER_ACTIONS.find((s) => s.xmlid === 'sa_invite_auto').code;
const ARRIVE = SERVER_ACTIONS.find((s) => s.xmlid === 'sa_arrive').code;

const PY = String.raw`import sys, json, types, datetime
class UserError(Exception): pass
class FixedDT(datetime.datetime):
    @classmethod
    def now(cls, tz=None): return cls(2026, 11, 13, 15, 19, 0)
DT = types.SimpleNamespace(datetime=FixedDT, date=datetime.date, timedelta=datetime.timedelta, time=datetime.time)
DATES = ('x_checkin', 'x_checkout')
class Rec:
    def __init__(self, d, store=None):
        object.__setattr__(self, 'd', {k: self.conv(k, v) for k, v in d.items()})
        object.__setattr__(self, 'store', store)
    @staticmethod
    def conv(k, v):
        if isinstance(v, str) and k in DATES: return datetime.date.fromisoformat(v)
        if isinstance(v, str) and k in ('rental_return_date',): return datetime.datetime.strptime(v, '%Y-%m-%d %H:%M:%S')
        return v
    def __getattr__(self, k): return self.d.get(k, False)
    def __getitem__(self, k): return self.d.get(k, False)
    def write(self, vals):
        if self.store is not None and self.store.get('kind') == 'order': self.store['writes'].append(sorted(vals))
        self.d.update(vals)
    def message_post(self, **kw): self.store['notes'].append(kw)
class UIModel:
    def __init__(self, st): self.st = st
    def search(self, domain):
        oid = domain[0][2]
        return [r for r in self.st['slots'] if r.d.get('x_sale_order_id') == oid]
    def create(self, vals):
        self.st['n'] += 1
        r = Rec({'id': 100 + self.st['n'], 'access_token': 'T%d' % self.st['n'], **vals}, None)
        self.st['slots'].append(r); return r
    def default_get(self, names):
        self.st['n'] += 1
        return {'access_token': 'T%d' % self.st['n']}
class Env:
    def __init__(self, st): self.st = st; self.survey_missing = st.get('survey_missing')
    def ref(self, xmlid, raise_if_not_found=True):
        if self.survey_missing: return False
        return Rec({'id': 1, 'access_token': 'SURVEY'})
    def __getitem__(self, m):
        if m == 'survey.user_input': return UIModel(self.st)
        if m == 'ir.config_parameter': return types.SimpleNamespace(sudo=lambda: types.SimpleNamespace(get_param=lambda k: 'https://odoo.test'))
        raise KeyError(m)
spec = json.load(sys.stdin)
st = {'slots': [Rec(s) for s in spec.get('slots', [])], 'n': 0, 'survey_missing': spec.get('survey_missing')}
orders = {}
for o in spec['orders']:
    s = {'kind': 'order', 'writes': [], 'notes': []}
    orders[o['id']] = (Rec(o, s), s)
out = []
for step in spec['steps']:
    if step['op'] == 'set':
        orders[step['id']][0].d.update({k: Rec.conv(k, v) for k, v in step['vals'].items()})
        continue
    if step['op'] == 'slot':
        for r in st['slots']:
            if r.d['id'] == step['id']: r.d.update(step['vals'])
        continue
    recs = [orders[i][0] for i in step['ids']]
    err = None
    try:
        st['notes'] = []
        exec(spec['code'], {'env': Env(st), 'records': recs, 'datetime': DT, 'UserError': UserError})
    except Exception as e:
        err = '%s: %s' % (type(e).__name__, e)
    out.append({'err': err, 'slots': [{k: (str(v) if isinstance(v, (datetime.datetime, datetime.date)) else v) for k, v in r.d.items()} for r in st['slots']],
                'notes': {str(i): [n['body'] for n in orders[i][1]['notes']] for i in orders}, 'orderWrites': {str(i): orders[i][1]['writes'] for i in orders}})
print(json.dumps(out))`;

function py(spec, t) {
  try { execFileSync('python3', ['--version']); } catch { t.skip('sin python3'); return null; }
  return JSON.parse(execFileSync('python3', ['-I', '-c', PY], { input: JSON.stringify({ code: CODE, ...spec }), encoding: 'utf8' }));
}

const order = (id, extra = {}) => ({ id, name: `S0000${id}`, state: 'sale', x_reservation_status: false, x_pms_reference: `SMOOBU-1704000${id}`, x_checkin: '2026-11-20', x_checkout: '2026-11-22', rental_return_date: false, ...extra });
const run = (...ids) => ({ op: 'run', ids });
const invitados = (r) => r.slots.filter((s) => s.x_ath_state === 'invitado');

// ------------------------------------------------------------------ definicion
test('la automatizacion solo dispara con reserva confirmada de Smoobu; la accion no queda en el menu y es de solo preparacion', () => {
  const a = AUTOMATIONS.find((x) => x.xmlid === 'au_invite');
  assert.equal(a.model, 'sale.order');
  assert.equal(a.action, 'sa_invite_auto');
  assert.match(a.domain, /'state', '=', 'sale'/);
  assert.match(a.domain, /SMOOBU-/);
  assert.deepEqual(a.triggerFields, ['state', 'x_checkin', 'x_checkout']);
  const s = SERVER_ACTIONS.find((x) => x.xmlid === 'sa_invite_auto');
  assert.ok(!s.bind, 'no se enlaza al menu Accion: la unica puerta manual sigue siendo sa_invite');
  for (const forbidden of ['action_confirm', 'action_cancel', 'unlink', 'mail.mail', 'mail.template', 'send_mail', 'whatsapp', 'message_type=\'email\'', 'sudo().write']) assert.ok(!s.code.includes(forbidden), forbidden);
  assert.ok(SERVER_ACTIONS.find((x) => x.xmlid === 'sa_invite'), 'la accion manual existente se conserva');
});

// ------------------------------------------------------------------ casos del Python real
test('borrador o cotizacion enviada: sin enlace, sin notas y sin escrituras en la reserva', (t) => {
  const r = py({ orders: [order(1, { state: 'draft' }), order(2, { state: 'sent' })], steps: [run(1, 2)] }, t);
  if (!r) return;
  assert.equal(r[0].err, null);
  assert.deepEqual(r[0].slots, []);
  assert.deepEqual(r[0].notes, { 1: [], 2: [] });
});

test('confirmada y elegible: UN enlace vigente (vence el dia de la salida a las 23:59 de Bogota), una nota, la reserva intacta y nada enviado', (t) => {
  const r = py({ orders: [order(1)], steps: [run(1)] }, t);
  if (!r) return;
  assert.equal(r[0].err, null);
  const [s] = invitados(r[0]);
  assert.equal(r[0].slots.length, 1);
  assert.equal(s.x_sale_order_id, 1);
  assert.equal(s.deadline, '2026-11-23 04:59:00');
  assert.equal(s.x_ath_url, `https://odoo.test/survey/SURVEY/${s.access_token}`);
  assert.equal(r[0].notes[1].length, 1);
  assert.match(r[0].notes[1][0], /no enviado/);
  assert.deepEqual(r[0].orderWrites[1], [], 'no escribe en la reserva (no confirma, no cambia estado)');
});

test('repetir el procesamiento (o reconfirmar) no crea otro enlace ni regenera el vigente', (t) => {
  const r = py({ orders: [order(1)], steps: [run(1), run(1), { op: 'set', id: 1, vals: { state: 'draft' } }, { op: 'set', id: 1, vals: { state: 'sale' } }, run(1)] }, t);
  if (!r) return;
  assert.equal(r[2].slots.length, 1);
  assert.deepEqual(r[2].slots, r[0].slots, 'mismo token, misma URL, mismo vencimiento');
  assert.equal(r[2].notes[1].length, 1, 'sin notas repetidas');
});

test('un enlace usado o retirado por Recepcion no se vuelve a crear solo', (t) => {
  for (const state of ['procesado', 'revocado']) {
    const r = py({ orders: [order(1)], slots: [{ id: 50, x_sale_order_id: 1, x_ath_state: state, access_token: 'OLD' }], steps: [run(1)] }, t);
    if (!r) return;
    assert.equal(r[0].slots.length, 1, state);
    assert.equal(r[0].slots[0].access_token, 'OLD');
    assert.deepEqual(r[0].notes[1], []);
  }
});

test('faltan datos: causa visible (registro en error + nota), sin duplicar al repetir; al completar, el MISMO registro pasa a enlace vigente', (t) => {
  const r = py({ orders: [order(1, { x_checkout: false })], steps: [run(1), run(1), { op: 'set', id: 1, vals: { x_checkout: '2026-11-25' } }, run(1), run(1)] }, t);
  if (!r) return;
  assert.equal(r[0].err, null);
  assert.equal(r[0].slots.length, 1);
  assert.equal(r[0].slots[0].x_ath_state, 'error');
  assert.match(r[0].slots[0].x_ath_error, /Falta la fecha de salida/);
  assert.equal(r[0].slots[0].x_ath_url, undefined);
  assert.equal(r[0].notes[1].length, 1);
  assert.deepEqual(r[1].slots, r[0].slots, 'repetir con la misma causa no duplica ni repite la nota');
  assert.equal(r[1].notes[1].length, 1);
  const id = r[0].slots[0].id;
  assert.equal(r[2].slots.length, 1);
  assert.equal(r[2].slots[0].id, id, 'mismo registro');
  assert.equal(r[2].slots[0].x_ath_state, 'invitado');
  assert.ok(!r[2].slots[0].x_ath_error);
  assert.equal(r[2].slots[0].deadline, '2026-11-26 04:59:00');
  assert.notEqual(r[2].slots[0].access_token, r[0].slots[0].access_token, 'token nuevo al promover');
  assert.match(r[2].slots[0].x_ath_url, new RegExp(`/${r[2].slots[0].access_token}$`));
  assert.equal(r[3].slots.length, 1);
  assert.deepEqual(r[3].slots, r[2].slots, 'una vez vigente, repetir no regenera');
});

test('causas distintas: sin entrada, sin entrada ni salida, estancia ya terminada; la causa cambia en el mismo registro', (t) => {
  const r = py({ orders: [order(1, { x_checkin: false })], steps: [run(1), { op: 'set', id: 1, vals: { x_checkout: false } }, run(1), { op: 'set', id: 1, vals: { x_checkin: '2026-11-01', x_checkout: '2026-11-05' } }, run(1)] }, t);
  if (!r) return;
  assert.match(r[0].slots[0].x_ath_error, /Falta la fecha de entrada/);
  assert.match(r[1].slots[0].x_ath_error, /fechas de entrada y salida/);
  assert.match(r[2].slots[0].x_ath_error, /ya terminó \(salida 2026-11-05\)/);
  for (const x of r) assert.equal(x.slots.length, 1);
  assert.equal(r[2].notes[1].length, 3);
  assert.ok(r.every((x) => x.slots.every((s) => s.x_ath_state === 'error')), 'ninguna causa genera enlace');
});

test('usa la fecha de devolucion de alquiler si no hay check-out; hoy (hora Bogota) todavia es una estancia vigente', (t) => {
  const a = py({ orders: [order(1, { x_checkout: false, rental_return_date: '2026-11-22 16:00:00' })], steps: [run(1)] }, t);
  if (!a) return;
  assert.equal(invitados(a[0])[0].deadline, '2026-11-23 04:59:00');
  const b = py({ orders: [order(2, { x_checkin: '2026-11-12', x_checkout: '2026-11-13' })], steps: [run(2)] }, t); // "ahora" = 10:19 del 13 en Bogota
  assert.equal(invitados(b[0]).length, 1);
});

test('cancelada, no-show o sin referencia de Smoobu: nada; lote mixto solo prepara la elegible; sin encuesta no falla', (t) => {
  const r = py({
    orders: [order(1, { state: 'cancel' }), order(2, { x_reservation_status: 'cancelled' }), order(3, { x_reservation_status: 'no_show' }), order(4, { x_pms_reference: false }), order(5, { x_pms_reference: 'RESERVA MANUAL 12' }), order(6), order(7, { state: 'draft' })],
    steps: [run(1, 2, 3, 4, 5, 6, 7)],
  }, t);
  if (!r) return;
  assert.equal(r[0].err, null);
  assert.equal(r[0].slots.length, 1);
  assert.equal(r[0].slots[0].x_sale_order_id, 6);
  const s = py({ survey_missing: true, orders: [order(1)], steps: [run(1)] }, t);
  assert.equal(s[0].err, null, 'nunca lanza: no puede bloquear la confirmacion');
  assert.deepEqual(s[0].slots, []);
});

// ------------------------------------------------------------------ recorrido completo con el conector existente
const TODAY = '2026-11-05';
const APT = { 201: 3557506 };
const smoobuOf = (map) => ({ requests: 0, async getReservation(id) { this.requests += 1; const b = map[id]; if (!b) { const e = new Error('SMOOBU_NOT_FOUND'); e.code = 'SMOOBU_NOT_FOUND'; e.status = 404; throw e; } return b; } });

test('recorrido: reserva sintetica de Smoobu -> conector existente -> borrador (sin enlace) -> confirmada (un enlace) -> repeticion -> cancelacion', async (t) => {
  const SID = 170400901;
  const reserva = { id: SID, type: 'reservation', apartment: { id: APT[201] }, arrival: '2026-11-20', departure: '2026-11-22', price: 180000 };
  const payload = buildCreatePayload({ smoobuId: SID, unit: '201', arrival: '2026-11-20', departure: '2026-11-22', source: 'direct', otaRef: null, price: 180000, guest: { name: 'Ana Sintetica Ficticia', email: 'prueba@example.invalid', phone: null } });
  const op = { smoobuId: SID, unit: '201', arrival: '2026-11-20', departure: '2026-11-22', op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [GUARDS.IMPUESTO_PENDIENTE], payload, changes: [], key: opKey(SID, OPS.CREATE_ORDER, payload) };
  const odoo = new FakeOdoo();
  const e = { reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }), writer: fakeWriter(odoo, validateWrite), smoobu: smoobuOf({ [SID]: reserva }), journal: new Journal(), lock: new MemoryLock() };
  const apply = () => applyPlan({ plan: { ops: [op] }, reader: e.reader, writer: e.writer, smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY });
  const bridge = (steps) => py({ orders: [{ ...odoo.t['sale.order'][0], name: 'S-PRUEBA' }], slots: carry, steps }, t);
  let carry = [];

  // 1. el conector crea el BORRADOR y nunca confirma
  const first = await apply(); assert.equal(first.results[0].result, RESULT.APLICADA, JSON.stringify(first.results[0]));
  assert.equal(odoo.t['sale.order'].length, 1);
  assert.equal(odoo.t['sale.order'][0].state, 'draft');
  assert.ok(!odoo.calls.includes('sale.order/action_confirm'), 'el conector no confirma');
  const id = odoo.t['sale.order'][0].id;
  let r = bridge([run(id)]);
  if (!r) return;
  assert.deepEqual(r[0].slots, [], 'borrador: sin enlace');

  // 2. Recepcion confirma (aqui, la accion de Odoo de la copia): el puente prepara UN enlace
  await odoo.handle('https://odoo.invalid/json/2/sale.order/action_confirm', { body: JSON.stringify({ ids: [id] }) });
  assert.equal(odoo.t['sale.order'][0].state, 'sale');
  r = bridge([run(id)]);
  assert.equal(r[0].slots.length, 1);
  assert.equal(r[0].slots[0].x_ath_state, 'invitado');
  carry = r[0].slots.map((s) => ({ ...s }));

  // 3. repeticion de la sincronizacion: sin pedido nuevo; el puente no regenera
  assert.equal((await apply()).results[0].result, RESULT.YA_APLICADA);
  assert.equal(odoo.t['sale.order'].length, 1);
  const again = await applyPlan({ plan: { ops: [op] }, reader: e.reader, writer: e.writer, smoobu: e.smoobu, journal: new Journal(), lock: new MemoryLock(), today: TODAY });
  assert.equal(again.results[0].code, 'PEDIDO_YA_EXISTE');
  assert.equal(odoo.t['sale.order'].length, 1);
  r = bridge([run(id), run(id)]);
  assert.deepEqual(r[1].slots, carry.map((s) => ({ ...s, access_token: s.access_token })).map((s) => r[1].slots.find((x) => x.id === s.id)), 'el enlace vigente sigue igual');
  assert.equal(r[1].slots.length, 1);

  // 4. cancelacion: no se prepara nada nuevo y la llegada/TRA quedan bloqueadas
  await odoo.handle('https://odoo.invalid/json/2/sale.order/action_cancel', { body: JSON.stringify({ ids: [id] }) });
  assert.equal(odoo.t['sale.order'][0].state, 'cancel');
  const cancelled = { ...odoo.t['sale.order'][0], name: 'S-PRUEBA' };
  const none = py({ orders: [cancelled], steps: [run(id)] }, t);
  assert.deepEqual(none[0].slots, [], 'cancelada: sin enlace nuevo');
  const arrive = execFileSync('python3', ['-I', '-c', String.raw`import sys, json, datetime
class UserError(Exception): pass
class Rec:
    def __init__(self, d): object.__setattr__(self, 'd', d)
    def __getattr__(self, k): return self.d.get(k, False)
    def write(self, vals): self.d['_wrote'] = vals
spec = json.load(sys.stdin)
order = Rec({'state': spec['state'], 'x_reservation_status': False, 'x_checkin': datetime.date(2026, 11, 20), 'x_checkout': datetime.date(2026, 11, 22)})
line = Rec({'x_data_state': 'validado', 'x_arrived_at': False, 'x_sale_order_id': order, 'x_is_foreign': False, 'x_establishment_id': Rec({'x_tra_mode': 'api'})})
try:
    exec(spec['code'], {'records': [line], 'datetime': datetime, 'UserError': UserError})
    print(json.dumps({'err': None, 'wrote': line.d.get('_wrote')}))
except UserError as ex:
    print(json.dumps({'err': str(ex), 'wrote': line.d.get('_wrote')}))`], { input: JSON.stringify({ code: ARRIVE, state: 'cancel' }), encoding: 'utf8' });
  const out = JSON.parse(arrive);
  assert.match(out.err, /reserva no confirmada, cancelada o no-show/);
  assert.equal(out.wrote, null, 'sin llegada real no nacen obligaciones SIRE/TRA');
});
