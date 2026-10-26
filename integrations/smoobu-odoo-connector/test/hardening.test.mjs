import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcile, simulateApply, defaultNightWindow, normalizeSlot, uncoveredIntervals, slotKey } from '../src/reconcile.mjs';
import { RELEASE_UNLOCKED, RELEASE_MECHANISM_ANALYSIS } from '../src/odoo-facts.mjs';

const real = JSON.parse(readFileSync(new URL('../fixtures/real-calibration-2026-10-26.json', import.meta.url)));
const A = { 201: 3557506, 202: 3557511, 203: 3557516, 301: 3557521, 302: 3557526, CASA: 3557501 };
const ROLE = { 201: 29, 202: 19, 203: 30, 301: 37, 302: 18, CASA: 69 };
const ROOM_ROLES = [29, 19, 30, 37, 18];
const bk = (id, apt, a, d, extra = {}) => ({ id, apartment: { id: apt }, arrival: a, departure: d, ...extra });
const win = (n0, n1 = n0) => [defaultNightWindow(n0)[0], defaultNightWindow(n1)[1]];
const mk = (id, role, n0, n1, extra = {}) => { const [start, end] = win(n0, n1); return { id, roleId: role, start, end, key: null, active: true, ...extra }; };
const ops = (r, op) => r.proposals.filter((p) => p.op === op);

/** Simulador FIEL del codigo de las acciones 1853/1855 (solo para pruebas; no toca Odoo). */
function runRules(slots, fromId = 800000) {
  let next = fromId; const out = [...slots];
  const overlap = (role, s, e, ex) => out.some((x) => x.roleId === role && x.id !== ex && x.start < e && x.end > s);
  for (const s of [...out]) {
    if (s.blockRef || s.mirror === true || s.state === 'draft') continue;
    if (ROOM_ROLES.includes(s.roleId)) { // 1855: habitacion -> Casa
      if (out.some((x) => x.roleId === 69 && x.blockRef === String(s.id))) continue;
      if (overlap(69, s.start, s.end, s.id)) continue;
      out.push({ id: next++, roleId: 69, start: s.start, end: s.end, key: null, active: true, blockRef: String(s.id), mirror: true });
    } else if (s.roleId === 69) { // 1853: Casa -> habitaciones
      for (const rr of ROOM_ROLES) {
        if (out.some((x) => x.roleId === rr && x.blockRef === String(s.id))) continue;
        if (overlap(rr, s.start, s.end, s.id)) continue;
        out.push({ id: next++, roleId: rr, start: s.start, end: s.end, key: null, active: true, blockRef: String(s.id), mirror: true });
      }
    }
  }
  return out;
}
/** Invariante anti-sobreventa: cada turno de habitacion esta cubierto por Casa y cada turno real de Casa por cada habitacion. */
function violations(slots) {
  const v = [];
  const cov = (role, s, e) => uncoveredIntervals(s, e, slots.filter((x) => x.roleId === role && x.start < e && x.end > s));
  for (const s of slots) {
    if (ROOM_ROLES.includes(s.roleId) && cov(69, s.start, s.end).length) v.push(`casa_sin_bloqueo:${s.id}`);
    if (s.roleId === 69 && !s.blockRef) for (const rr of ROOM_ROLES) if (cov(rr, s.start, s.end).length) v.push(`hab${rr}_sin_bloqueo:${s.id}`);
  }
  return v;
}
const settle = (slots, result) => runRules(simulateApply(slots, result));

test('simulador de reglas: una habitacion libre genera su espejo y el invariante se cumple', () => {
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-12')], slots: [] });
  const after = runRules(simulateApply([], r));
  assert.equal(after.filter((s) => s.roleId === 69).length, 2); assert.deepEqual(violations(after), []);
});

test('NOCHE sin bloqueo correcto en Casa se RECHAZA: espejo parcial existente', () => {
  const [ws, we] = win('2026-11-10');
  const partial = { id: 90, roleId: 69, start: ws, end: ws + 10 * 3600000, key: null, active: true, blockRef: '77', mirror: true };
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11')], slots: [partial] });
  assert.equal(r.proposals.length, 0);
  assert.equal(r.conflicts[0].code, 'MIRROR_GAP_CASA');
  assert.deepEqual(r.conflicts[0].uncovered, [[new Date(ws + 10 * 3600000).toISOString(), new Date(we).toISOString()]]);
});

test('multi-noche por noche: solo se rechaza la noche con espejo parcial; las demas se aceptan', () => {
  const [ws] = win('2026-11-11');
  const partial = { id: 90, roleId: 69, start: ws, end: ws + 5 * 3600000, key: null, active: true, blockRef: '77', mirror: true };
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-13')], slots: [partial] });
  assert.deepEqual(ops(r, 'CREATE_SLOT').map((p) => p.night), ['2026-11-10', '2026-11-12']);
  assert.deepEqual(r.conflicts.map((c) => [c.code, c.night]), [['MIRROR_GAP_CASA', '2026-11-11']]);
});

test('ALTERNATIVA segura: coverGaps propone un turno de Casa solo para el tramo omitido, marcado y bloqueado', () => {
  const [ws, we] = win('2026-11-10');
  const partial = { id: 90, roleId: 69, start: ws, end: ws + 10 * 3600000, key: null, active: true, blockRef: '77', mirror: true };
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11')], slots: [partial], coverGaps: true });
  const [cover] = ops(r, 'COVER_CASA_GAP');
  assert.equal(ops(r, 'CREATE_SLOT').length, 1); assert.equal(r.conflicts.length, 0);
  assert.deepEqual([cover.roleId, cover.resourceId, cover.companyId, cover.state, cover.status, cover.autoApply, cover.writesEnabled],
    [69, 79, 5, 'published', 'BLOCKED_UNTIL_STAGING_PROOF', false, false]);
  assert.equal(cover.startUtc, new Date(ws + 10 * 3600000).toISOString()); assert.equal(cover.endUtc, new Date(we).toISOString());
  assert.ok(cover.blockRef && cover.blockRef === cover.externalKey); // x_bloqueo_ref no vacio: las reglas no lo procesan
  assert.ok(cover.requiresStagingProof.length >= 2 && cover.unverifiedFields.includes('slot_triggered_automations'));
  // con la cobertura y el resultado de las reglas reales no queda ninguna noche sin bloquear
  const after = runRules(simulateApply([partial], r));
  assert.deepEqual(violations(after), []);
});

test('cobertura idempotente: aplicar, correr reglas y repetir da cero propuestas; cancelar propone liberar principal y cobertura', () => {
  const [ws] = win('2026-11-10');
  const partial = { id: 90, roleId: 69, start: ws, end: ws + 10 * 3600000, key: null, active: true, blockRef: '77', mirror: true };
  const b = [bk(1, A[301], '2026-11-10', '2026-11-11')];
  const r1 = reconcile({ bookings: b, slots: [partial], coverGaps: true });
  const slots = runRules(simulateApply([partial], r1));
  for (let i = 0; i < 3; i += 1) assert.equal(reconcile({ bookings: b, slots, coverGaps: true }).proposals.length, 0);
  const cancel = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11', { type: 'cancellation' })], slots, coverGaps: true });
  const rel = ops(cancel, 'RELEASE_SLOT');
  assert.deepEqual(rel.map((p) => p.externalKey).sort(), ['SMOOBU-1:301:2026-11-10', 'SMOOBU-1:COVER1:2026-11-10']);
  assert.ok(rel.every((p) => p.ownSlot === true && p.status === 'BLOCKED_UNTIL_STAGING_PROOF' && p.autoApply === false));
});

test('Casa Completa: se aceptan noches libres y el invariante se cumple tras las reglas 167/169', () => {
  const r = reconcile({ bookings: [bk(5, A.CASA, '2026-11-10', '2026-11-12')], slots: [] });
  assert.equal(ops(r, 'CREATE_SLOT').length, 2);
  const after = runRules(simulateApply([], r));
  assert.equal(after.filter((s) => s.blockRef).length, 10); // 5 habitaciones x 2 noches
  assert.deepEqual(violations(after), []);
});

test('Casa Completa con solape diminuto (<60 min) en una habitacion: MIRROR_GAP_ROOM, no se crea', () => {
  const [ws] = win('2026-11-10');
  const tiny = { id: 60, roleId: 29, start: ws - 5 * 3600000, end: ws + 20 * 60000, key: null, active: true };
  const r = reconcile({ bookings: [bk(5, A.CASA, '2026-11-10', '2026-11-11')], slots: [tiny] });
  assert.equal(r.proposals.length, 0); assert.equal(r.conflicts[0].code, 'MIRROR_GAP_ROOM'); assert.equal(r.conflicts[0].rooms[0].unit, '201');
});

test('Casa Completa vs habitacion ocupada: conflicto cruzado, no se propone nada', () => {
  const r = reconcile({ bookings: [bk(5, A.CASA, '2026-11-10', '2026-11-11')], slots: [mk(61, 37, '2026-11-10')] });
  assert.equal(r.proposals.length, 0); assert.equal(r.conflicts[0].code, 'ODOO_CASA_CROSS_OCCUPIED');
});

test('escenario mixto repetido: 3 ejecuciones aplicando reglas, sin duplicados y sin sobreventa', () => {
  const b = [bk(1, A[301], '2026-11-10', '2026-11-13'), bk(2, A[201], '2026-11-11', '2026-11-12'), bk(3, A[302], '2026-11-12', '2026-11-14'), bk(4, A.CASA, '2026-11-20', '2026-11-22')];
  let slots = [];
  for (let i = 0; i < 4; i += 1) {
    const r = reconcile({ bookings: b, slots });
    if (i > 0) assert.equal(r.proposals.length, 0, `ejecucion ${i + 1} debe ser idempotente`);
    slots = settle(slots, r);
  }
  assert.deepEqual(violations(slots), []);
  const keys = slots.filter((s) => s.key).map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, 3 + 1 + 2 + 2);
});

test('modificaciones con datos reales: extender, acortar, mover y cambiar de unidad no tocan turnos ajenos', () => {
  const b0 = [bk(161419736, A[301], '2026-10-26', '2026-10-27')];
  let slots = settle(real.slots.map((s) => normalizeSlot(s)), reconcile({ bookings: b0, slots: real.slots }));
  const foreignIds = real.slots.map((s) => s.id);
  const ext = reconcile({ bookings: [bk(161419736, A[301], '2026-10-26', '2026-10-29')], slots });
  assert.deepEqual(ops(ext, 'CREATE_SLOT').map((p) => p.night), ['2026-10-27', '2026-10-28']);
  const move = reconcile({ bookings: [bk(161419736, A[301], '2026-10-30', '2026-10-31')], slots });
  assert.deepEqual(ops(move, 'CREATE_SLOT').map((p) => p.night), ['2026-10-30']);
  const rel = ops(move, 'RELEASE_SLOT');
  assert.equal(rel.length, 1); assert.ok(!foreignIds.includes(rel[0].slotId));
  const other = reconcile({ bookings: [bk(161419736, A[302], '2026-10-27', '2026-10-28')], slots });
  assert.ok(ops(other, 'RELEASE_SLOT').every((p) => p.ownSlot && !foreignIds.includes(p.slotId)));
});

test('LIBERACION: solo turnos propios; nunca ajenos ni espejos; nunca duplicados con clave', () => {
  const k = slotKey(1, '301', '2026-11-10');
  const own = mk(10, 37, '2026-11-10', '2026-11-10', { key: k });
  const foreign = mk(11, 29, '2026-11-10', '2026-11-10');
  const foreignMirror = mk(12, 69, '2026-11-10', '2026-11-10', { mirror: true, blockRef: '999' });
  const cancel = bk(1, A[301], '2026-11-10', '2026-11-11', { type: 'cancellation' });
  const r = reconcile({ bookings: [cancel], slots: [own, foreign, foreignMirror] });
  assert.deepEqual(r.proposals.map((p) => p.slotId), [10]);
  const dup = reconcile({ bookings: [cancel], slots: [own, { ...own, id: 13 }] });
  assert.equal(dup.proposals.length, 0); assert.equal(dup.warnings[0].code, 'DUPLICATE_KEYED_SLOTS');
});

test('LIBERACION: espejo dependiente se informa como compartido y NUNCA se propone liberarlo', () => {
  const k = slotKey(1, '301', '2026-11-10');
  const own = mk(10, 37, '2026-11-10', '2026-11-10', { key: k });
  const mirror = mk(20, 69, '2026-11-10', '2026-11-10', { mirror: true, blockRef: '10' });
  const sharedRoom = mk(21, 201, '2026-11-10', '2026-11-10'); sharedRoom.roleId = 29; // otra habitacion cubierta por el mismo espejo
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11', { type: 'cancellation' })], slots: [own, mirror, sharedRoom] });
  const [rel] = r.proposals;
  assert.equal(rel.slotId, 10); assert.deepEqual(rel.dependentMirrors.map((m) => [m.slotId, m.sharedWith]), [[20, [21]]]);
  assert.equal(rel.mirrorPolicy, 'NUNCA_LIBERAR_AUTOMATICAMENTE_REVISION_MANUAL');
  assert.ok(!r.proposals.some((p) => p.slotId === 20));
  assert.equal(r.warnings[0].code, 'MIRROR_REMAINS_AFTER_RELEASE'); assert.equal(r.warnings[0].mirrors[0].shared, true);
});

test('LIBERACION: con huesped presente o ya salido se rechaza', () => {
  const k = slotKey(1, '301', '2026-11-10');
  for (const st of ['checked_in', 'checked_out']) {
    const own = mk(10, 37, '2026-11-10', '2026-11-10', { key: k, checkinState: st });
    const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11', { type: 'cancellation' })], slots: [own] });
    assert.equal(r.proposals.length, 0); assert.equal(r.warnings[0].code, 'RELEASE_REFUSED_GUEST_PRESENT_OR_DEPARTED');
  }
  // lectura cruda de Odoo: x_checkin_state llega al motor
  const raw = normalizeSlot({ id: 5, role_id: [37, 'x'], start_datetime: '2026-11-10 20:00:00', end_datetime: '2026-11-11 16:00:00', name: k, x_checkin_state: 'checked_in', x_bloqueo_ref: false });
  assert.equal(raw.checkinState, 'checked_in'); assert.equal(raw.blockRef, null);
});

test('state=draft y x_checkin_state=cancelled NO liberan disponibilidad (codigo del Booking Engine); borrar es la via nativa y esta prohibida', () => {
  assert.equal(RELEASE_UNLOCKED, false);
  const A = RELEASE_MECHANISM_ANALYSIS;
  assert.equal(A['state=draft'].verdict, 'REFUTADO_COMO_LIBERACION_DE_INVENTARIO');
  assert.equal(A['x_checkin_state=cancelled'].verdict, 'REFUTADO_COMO_LIBERACION_DE_INVENTARIO');
  assert.equal(A['unlink (borrar)'].verdict, 'VIA_NATIVA_PERO_PROHIBIDA_AUTOMATICAMENTE');
  for (const a of Object.values(A)) assert.ok(a.inFavor.length >= 1 && a.against.length >= 2);
  assert.ok(A['state=draft'].against.some((t) => /1493\/1495/.test(t)));
  const slots = [mk(10, 37, '2026-11-10', '2026-11-10', { key: slotKey(1, '301', '2026-11-10') })];
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11', { type: 'cancellation' })], slots });
  assert.deepEqual([r.proposals[0].status, r.proposals[0].mechanism, r.proposals[0].candidates], ['BLOCKED_UNTIL_STAGING_PROOF', 'TO_BE_DECIDED', ['state=draft', 'x_checkin_state=cancelled', 'unlink (borrar)']]);
});

test('seguridad global: ninguna propuesta puede aplicarse y writesEnabled siempre false', () => {
  const [ws] = win('2026-11-10');
  const partial = { id: 90, roleId: 69, start: ws, end: ws + 10 * 3600000, key: null, active: true, blockRef: '77', mirror: true };
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-12'), bk(2, A[201], '2026-11-20', '2026-11-21'), bk(3, A[302], '2026-11-10', '2026-11-11', { type: 'cancellation' })], slots: [partial], coverGaps: true });
  assert.ok(r.proposals.length > 0);
  assert.ok(r.proposals.every((p) => p.writesEnabled === false));
  assert.ok(r.proposals.filter((p) => p.op !== 'CREATE_SLOT').every((p) => p.status.startsWith('BLOCKED') || p.autoApply === false));
});

test('esquema de produccion verificado: campos presentes/ausentes y valores de x_channel', async () => {
  const { PRODUCTION_SCHEMA, PRODUCTION_SLOT_AUTOMATIONS } = await import('../src/odoo-facts.mjs');
  assert.deepEqual([PRODUCTION_SCHEMA.x_bloqueo_ref.type, PRODUCTION_SCHEMA.x_bloqueo_ref.readonly], ['char', false]);
  assert.ok(!PRODUCTION_SCHEMA.x_channel.values.includes('smoobu'));
  assert.deepEqual(PRODUCTION_SCHEMA.absentInProduction, ['x_hotel_block_kind', 'x_bloqueo_src_id']);
  assert.ok([167, 169, 170, 171, 55, 157, 164, 12].every((id) => PRODUCTION_SLOT_AUTOMATIONS[id]));
  // las propuestas no inventan canal ni tipo de bloque
  const r = reconcile({ bookings: [bk(1, A[301], '2026-11-10', '2026-11-11')], slots: [] });
  assert.ok(!('x_channel' in r.proposals[0]) && !('x_hotel_block_kind' in r.proposals[0]));
});
