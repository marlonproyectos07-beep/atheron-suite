import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { FIELDS, SERVER_ACTIONS, VIEWS } from '../src/sire-tra/manifest.mjs';

/**
 * Registro tardio de llegada/salida (GOAL ATH-HOTELS-SIRE-TRA-001, 2026-11-18): se ejecuta el Python REAL de
 * sa_arrive, sa_depart y sa_fix_move con un ORM minimo. "Ahora" del servidor se fija en 2026-11-18 15:00 UTC (10:00 Bogota).
 */
const code = (x) => SERVER_ACTIONS.find((s) => s.xmlid === x).code;
const PY = String.raw`import sys, json, datetime as _dt
class UserError(Exception): pass
NOW = _dt.datetime(2026, 11, 18, 15, 0)
class FakeDT(_dt.datetime):
    @classmethod
    def now(cls): return NOW
class DTMod: pass
datetime = DTMod(); datetime.datetime = FakeDT; datetime.timedelta = _dt.timedelta; datetime.date = _dt.date
def P(s): return _dt.datetime.strptime(s, '%Y-%m-%d %H:%M') if s else False
class Rec:
    def __init__(self, d): object.__setattr__(self, 'd', d)
    def __getattr__(self, k): return self.d.get(k, False)
    def write(self, vals): self.d.update(vals); self.d.setdefault('_writes', []).append(sorted(vals))
    def message_post(self, **kw): NOTES.append(kw['body'])
NOTES = []
spec = json.loads(sys.stdin.buffer.read().decode('utf-8'))
order = Rec({'name': 'S1', 'state': spec.get('state', 'sale'), 'x_reservation_status': False, 'x_checkin': _dt.date(2026, 11, 17), 'x_checkout': _dt.date(2026, 11, 18)})
L = spec['line']
line = Rec({'id': 7, 'x_data_state': L.get('state', 'validado'), 'x_sale_order_id': order, 'x_is_foreign': L.get('foreign', False), 'x_establishment_id': Rec({'x_tra_mode': 'manual'}),
    'x_arrived_at': P(L.get('arrived')), 'x_departed_at': P(L.get('departed')), 'x_arrival_input': P(L.get('a_in')), 'x_departure_input': P(L.get('d_in')),
    'x_movement_reason': L.get('reason', False), 'x_movement_log': L.get('log', False), 'x_tra_state': L.get('tra', False), 'x_sire_in_state': L.get('sire_in', False), 'x_sire_out_state': L.get('sire_out', False)})
env = Rec({'user': Rec({'id': 2, 'name': 'Recepcion Uno'})})
F = lambda v: v.strftime('%Y-%m-%d %H:%M') if hasattr(v, 'strftime') else v
try:
    exec(spec['code'], {'records': [line], 'datetime': datetime, 'UserError': UserError, 'env': env})
    err = None
except UserError as ex:
    err = str(ex)
out = {k: F(v) for k, v in line.d.items() if k.startswith('x_') and k not in ('x_sale_order_id', 'x_establishment_id')}
sys.stdout.buffer.write(json.dumps({'err': err, 'line': out, 'writes': line.d.get('_writes', []), 'notes': NOTES}).encode('utf-8'))`;

function run(t, xmlid, line, extra = {}) {
  try { execFileSync('python3', ['--version']); } catch { t.skip('sin python3'); return null; }
  return JSON.parse(execFileSync('python3', ['-I', '-c', PY], { input: JSON.stringify({ code: code(xmlid), line, ...extra }), encoding: 'utf8' }));
}

test('llegada: sin hora real escrita no registra nada (nunca usa la hora actual por defecto)', (t) => {
  const r = run(t, 'sa_arrive', {});
  if (!r) return;
  assert.match(r.err, /escriba la hora REAL de llegada/);
  assert.deepEqual(r.writes, []);
});

test('llegada a tiempo: guarda la hora real escrita, aparte hora y usuario de captura, bitacora y nota', (t) => {
  const r = run(t, 'sa_arrive', { a_in: '2026-11-18 14:30' });
  if (!r) return;
  assert.equal(r.err, null);
  assert.equal(r.line.x_arrived_at, '2026-11-18 14:30', 'hora REAL, no la de captura');
  assert.equal(r.line.x_arrival_captured_at, '2026-11-18 15:00');
  assert.equal(r.line.x_arrival_captured_by, 2);
  assert.equal(r.line.x_arrival_input, false, 'el campo de entrada se limpia');
  assert.equal(r.line.x_tra_state, 'pendiente');
  assert.match(r.line.x_movement_log, /llegada real 2026-11-18 09:30 \(hora Bogotá\), capturada 2026-11-18 10:00 por Recepcion Uno$/);
  assert.equal(r.notes.length, 1);
});

test('llegada tardia (huesped llego ayer): exige motivo; con motivo guarda la hora real de ayer y deja constancia', (t) => {
  const sin = run(t, 'sa_arrive', { a_in: '2026-11-17 20:00' });
  if (!sin) return;
  assert.match(sin.err, /registro tardío .*escriba el motivo/);
  assert.deepEqual(sin.writes, []);
  const con = run(t, 'sa_arrive', { a_in: '2026-11-17 20:00', reason: 'Huesped llego de noche; recepcion cerrada' });
  assert.equal(con.err, null);
  assert.equal(con.line.x_arrived_at, '2026-11-17 20:00');
  assert.equal(con.line.x_arrival_captured_at, '2026-11-18 15:00');
  assert.equal(con.line.x_movement_reason, false);
  assert.match(con.line.x_movement_log, /llegada real 2026-11-17 15:00 .* registro tardío: Huesped llego de noche; recepcion cerrada/);
  assert.match(con.notes[0], /registro tardío/);
});

test('llegada: rechaza hora futura, fuera de las fechas de la reserva, ya registrada o reserva cancelada', (t) => {
  const fut = run(t, 'sa_arrive', { a_in: '2026-11-18 16:00' });
  if (!fut) return;
  assert.match(fut.err, /es futura/);
  assert.match(run(t, 'sa_arrive', { a_in: '2026-11-10 12:00', reason: 'x' }).err, /fuera de las fechas/);
  const again = run(t, 'sa_arrive', { a_in: '2026-11-18 14:30', arrived: '2026-11-17 20:00' });
  assert.match(again.err, /llegada ya registrada \(para cambiarla use/);
  assert.equal(again.line.x_arrived_at, '2026-11-17 20:00', 'la llegada existente no se altera');
  assert.match(run(t, 'sa_arrive', { a_in: '2026-11-18 14:30' }, { state: 'cancel' }).err, /cancelada/);
});

test('salida: exige hora real, no anterior a la llegada ni futura; tardia con motivo; guarda captura aparte', (t) => {
  const base = { arrived: '2026-11-17 20:00', foreign: true };
  const no = run(t, 'sa_depart', base);
  if (!no) return;
  assert.match(no.err, /escriba la hora REAL de salida/);
  assert.match(run(t, 'sa_depart', { ...base, d_in: '2026-11-17 19:00' }).err, /anterior a la llegada/);
  assert.match(run(t, 'sa_depart', { ...base, d_in: '2026-11-18 12:00' }).err, /registro tardío/);
  const ok = run(t, 'sa_depart', { ...base, d_in: '2026-11-18 14:50' });
  assert.equal(ok.err, null);
  assert.equal(ok.line.x_departed_at, '2026-11-18 14:50');
  assert.equal(ok.line.x_departure_captured_by, 2);
  assert.equal(ok.line.x_sire_out_state, 'pendiente');
});

test('correccion: exige motivo, conserva el valor anterior en bitacora y nota, y no toca estados de reporte', (t) => {
  const base = { arrived: '2026-11-18 14:30', tra: 'pendiente', sire_in: 'no_aplica', log: 'previo' };
  const sin = run(t, 'sa_fix_move', { ...base, a_in: '2026-11-17 20:00' });
  if (!sin) return;
  assert.match(sin.err, /motivo de la corrección/);
  const ok = run(t, 'sa_fix_move', { ...base, a_in: '2026-11-17 20:00', reason: 'Se registro con la hora de captura' });
  assert.equal(ok.err, null);
  assert.equal(ok.line.x_arrived_at, '2026-11-17 20:00');
  assert.equal(ok.line.x_tra_state, 'pendiente', 'estado de reporte intacto');
  assert.match(ok.line.x_movement_log, /^previo\n.*CORRECCIÓN llegada 2026-11-18 09:30 -> 2026-11-17 15:00 por Recepcion Uno - motivo: Se registro con la hora de captura$/);
  assert.ok(ok.writes.every((w) => !w.includes('x_tra_state') && !w.includes('x_sire_in_state')));
});

test('correccion: se niega si el movimiento ya esta en reporte (enviado/aceptado) o si no existe', (t) => {
  const sent = run(t, 'sa_fix_move', { arrived: '2026-11-18 14:30', tra: 'aceptado', a_in: '2026-11-17 20:00', reason: 'x' });
  if (!sent) return;
  assert.match(sent.err, /ya está en reporte/);
  assert.equal(sent.line.x_arrived_at, '2026-11-18 14:30');
  assert.match(run(t, 'sa_fix_move', { a_in: '2026-11-17 20:00', reason: 'x' }).err, /no hay llegada que corregir/);
});

test('manifiesto: campos de captura de solo lectura, formulario con hora real y boton de correccion', () => {
  const f = (n) => FIELDS.find((x) => x[0] === 'x_guests_line' && x[1] === n);
  for (const n of ['x_arrival_captured_at', 'x_arrival_captured_by', 'x_departure_captured_at', 'x_departure_captured_by', 'x_movement_log']) assert.equal(f(n)[4].readonly, true, n);
  for (const n of ['x_arrival_input', 'x_departure_input', 'x_movement_reason']) assert.ok(f(n), n);
  const arch = VIEWS.find((v) => v.xmlid === 'view_guest_form').arch;
  assert.match(arch, /x_arrival_input/);
  assert.match(arch, /\{\{ref:sa_fix_move\}\}/);
  assert.ok(!/'x_tra_state':/.test(code('sa_fix_move')), 'la correccion no escribe estados TRA');
});
