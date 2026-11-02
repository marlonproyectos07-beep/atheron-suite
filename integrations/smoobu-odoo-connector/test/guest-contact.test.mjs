import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { applyPlan, RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';
import {
  normalizePhoneE164, buildGuestMessage, buildWhatsappLink, fallbackContact, planGuestContact, assistNoteFragment,
  safeCheckinLink, contactStates, physicalFromOdoo, PHONE_REASONS,
} from '../src/guest-contact.mjs';

// ATH-ODOO-WA-004 — Todo SINTETICO (ids 17xxxxxxx, nombres y telefonos inventados). Ninguna llamada de red, ningun envio.

test('telefono: normaliza a E.164 solo cuando no hay ambiguedad', () => {
  assert.deepEqual(normalizePhoneE164('+57 300 123 4567'), { ok: true, e164: '+573001234567', digits: '573001234567' });
  assert.equal(normalizePhoneE164('300-123-4567').e164, '+573001234567'); // movil colombiano sin indicativo
  assert.equal(normalizePhoneE164('573001234567').e164, '+573001234567');
  assert.equal(normalizePhoneE164('0031 6 12345678').e164, '+31612345678'); // 00 = internacional
  assert.equal(normalizePhoneE164('+44 7700 900123').e164, '+447700900123');
});

test('telefono: sin numero valido NO hay accion (vacio, letras, sin pais, longitud, fijo colombiano, repetido)', () => {
  const cases = [[null, PHONE_REASONS.SIN_TELEFONO], ['', PHONE_REASONS.SIN_TELEFONO], ['   ', PHONE_REASONS.SIN_TELEFONO], ['abc123', PHONE_REASONS.NO_NUMERICO],
    ['6012345678', PHONE_REASONS.SIN_CODIGO_PAIS], ['7700900123', PHONE_REASONS.SIN_CODIGO_PAIS], ['+1234', PHONE_REASONS.LONGITUD_INVALIDA],
    ['+57 601 234 5678', PHONE_REASONS.COLOMBIA_NO_MOVIL], ['+573000000000', PHONE_REASONS.NUMERO_FALSO], ['+0123456789', PHONE_REASONS.LONGITUD_INVALIDA]];
  for (const [raw, reason] of cases) assert.deepEqual(normalizePhoneE164(raw), { ok: false, reason }, String(raw));
});

test('mensaje: usa solo datos presentes y no inventa nada', () => {
  const full = buildGuestMessage({ guestName: 'ANA sintetica Ficticia', arrival: '2026-11-22', departure: '2026-11-23', checkinLink: 'https://login.smoobu.com/es/online-check-in/check-in/TOKEN_SINTETICO' });
  assert.equal(full, 'Hola Ana, le escribimos de Atheron Hotels. Recibimos su reserva del 22/11/2026 al 23/11/2026. Para agilizar su llegada puede completar el check-in en línea aquí: https://login.smoobu.com/es/online-check-in/check-in/TOKEN_SINTETICO Quedamos atentos a cualquier duda.');
  const bare = buildGuestMessage({ guestName: '', arrival: null, departure: undefined, checkinLink: null });
  assert.equal(bare, 'Hola, le escribimos de Atheron Hotels. Recibimos su reserva. Quedamos atentos a cualquier duda.');
  assert.ok(!/check-in|http/.test(bare), 'sin enlace no se menciona el check-in');
});

test('enlace de check-in: solo https de Smoobu; otros hosts, http y credenciales se descartan', () => {
  assert.ok(safeCheckinLink('https://login.smoobu.com/en/online-check-in/check-in/X'));
  for (const bad of ['http://login.smoobu.com/x', 'https://evil.example/x', 'https://login.smoobu.com.evil.example/x', 'https://u:p@login.smoobu.com/x', 'javascript:alert(1)', '', null, 'no es url']) assert.equal(safeCheckinLink(bad), null, String(bad));
  assert.ok(!buildGuestMessage({ checkinLink: 'https://evil.example/x' }).includes('evil'));
});

test('boton WhatsApp: wa.me con texto codificado; solo abre el chat (no envia)', () => {
  const url = buildWhatsappLink('+573001234567', 'Hola Ana & "amigos" ñ');
  assert.equal(url, `https://wa.me/573001234567?text=${encodeURIComponent('Hola Ana & "amigos" ñ')}`);
  assert.equal(new URL(url).host, 'wa.me');
  assert.equal(buildWhatsappLink('', 'x'), null); assert.equal(buildWhatsappLink('abc', 'x'), null);
  const src = readFileSync(new URL('../src/guest-contact.mjs', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|http\.request|https\.request|XMLHttpRequest|api\.whatsapp|graph\.facebook|execute\(/.test(src), 'sin red ni escrituras');
});

test('plan: con telefono valido hay enlace; sin telefono no hay accion de WhatsApp y si alternativa por Smoobu', () => {
  const ok = planGuestContact({ smoobuId: 170500001, guest: { name: 'Ana Sintetica Ficticia', phone: '+57 300 123 4567' }, arrival: '2026-11-22', departure: '2026-11-23' });
  assert.equal(ok.whatsapp.available, true); assert.match(ok.whatsapp.url, /^https:\/\/wa\.me\/573001234567\?text=/); assert.ok(ok.message.startsWith('Hola Ana'));
  const none = planGuestContact({ smoobuId: 170500001, guest: { name: 'Ana Sintetica Ficticia', phone: '' }, arrival: '2026-11-22', departure: '2026-11-23' });
  assert.deepEqual([none.whatsapp.available, none.whatsapp.url, none.message], [false, null, null]);
  assert.equal(none.whatsapp.reason, PHONE_REASONS.SIN_TELEFONO);
  assert.deepEqual(none.fallback, fallbackContact({ smoobuId: 170500001 }));
  assert.equal(none.fallback.url, 'https://login.smoobu.com/en/booking/detail/170500001');
  assert.equal(fallbackContact({ smoobuId: 'x; rm' }), null);
  assert.equal(assistNoteFragment(none), ' | WhatsApp no disponible (SIN_TELEFONO) | alternativa: https://login.smoobu.com/en/booking/detail/170500001');
});

test('estados: digital, fisico y pago son independientes y nunca se suponen', () => {
  assert.deepEqual(contactStates(), { digital: 'NO_VERIFICADO', physical: 'NO_VERIFICADO', payment: 'NO_VERIFICADO' });
  const a = contactStates({ digital: 'COMPLETADO' });
  assert.deepEqual([a.physical, a.payment], ['NO_VERIFICADO', 'NO_VERIFICADO']); // digital completado no implica llegada ni pago
  const b = contactStates({ physical: 'EN_CASA', payment: 'PENDIENTE' });
  assert.deepEqual([b.digital, b.physical, b.payment], ['NO_VERIFICADO', 'EN_CASA', 'PENDIENTE']); // en casa no implica check-in digital ni pago
  const c = contactStates({ payment: 'PAGADO' });
  assert.deepEqual([c.digital, c.physical], ['NO_VERIFICADO', 'NO_VERIFICADO']);
  assert.throws(() => contactStates({ digital: 'EN_CASA' }), /ESTADO_DIGITAL_INVALIDO/);
  assert.throws(() => contactStates({ payment: 'COMPLETADO' }), /ESTADO_PAGO_INVALIDO/);
  assert.deepEqual(['pending', 'checked_in', 'checked_out', 'cancelled', false, undefined, 'raro'].map(physicalFromOdoo), ['PENDIENTE', 'EN_CASA', 'SALIDA', 'CANCELADO', 'NO_VERIFICADO', 'NO_VERIFICADO', 'NO_VERIFICADO']);
});

/* ---------- integracion con el ejecutor existente (Odoo falso en memoria) ---------- */
const TODAY = '2026-11-05';
const APT = { 302: 3557526 };
const smoobuOf = (map) => ({ async getReservation(id) { return map[id]; } });
const createOp = (id, { phone, name = 'Ana Sintetica Ficticia' } = {}) => {
  const payload = buildCreatePayload({ smoobuId: id, unit: '302', arrival: '2026-11-22', departure: '2026-11-23', source: 'direct', otaRef: null, price: 90100, guest: { name, email: 'sintetico@example.invalid', phone } });
  return { smoobuId: id, unit: '302', arrival: '2026-11-22', departure: '2026-11-23', op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [GUARDS.IMPUESTO_PENDIENTE], payload, changes: [], key: opKey(id, OPS.CREATE_ORDER, payload) };
};
function env(id, extra = {}) {
  const odoo = new FakeOdoo({});
  const b = { id, type: 'reservation', apartment: { id: APT[302] }, arrival: '2026-11-22', departure: '2026-11-23', price: 90100, ...extra };
  return { odoo, reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }), writer: fakeWriter(odoo, validateWrite), smoobu: smoobuOf({ [id]: b }), journal: new Journal(), lock: new MemoryLock() };
}
const run = (e, ops) => applyPlan({ plan: { ops }, reader: e.reader, writer: e.writer, smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY });

test('ejecutor: la nota interna del pedido nuevo trae el enlace wa.me y el guard la acepta; no se envia nada', async () => {
  const e = env(170500001, { phone: '+57 300 123 4567', 'guest-name': 'Ana Sintetica Ficticia' });
  const r = await run(e, [createOp(170500001, { phone: '+57 300 123 4567' })]);
  assert.equal(r.results[0].result, RESULT.APLICADA, JSON.stringify(r));
  assert.equal(e.odoo.t.notes.length, 1);
  assert.match(e.odoo.t.notes[0].body, /^ATH-SYNC \| clave [0-9a-f]{16} \| SMOOBU-170500001 \| CREATE_ORDER \| WhatsApp \(abre el chat, envio manual\): https:\/\/wa\.me\/573001234567\?text=/);
  assert.ok(e.odoo.calls.length > 0 && e.odoo.calls.every((c) => !/whatsapp|sms|mail\.mail|_send|send_/i.test(c)), `ninguna llamada de envio: ${e.odoo.calls.join(',')}`);
  assert.ok(e.odoo.calls.some((c) => c === 'sale.order/message_post'), 'solo la nota interna');
});

test('ejecutor: sin telefono la nota dice que no hay WhatsApp y da la alternativa; no aparece wa.me', async () => {
  const e = env(170500002, { 'guest-name': 'Ana Sintetica Ficticia' });
  const r = await run(e, [createOp(170500002, { phone: null })]);
  assert.equal(r.results[0].result, RESULT.APLICADA, JSON.stringify(r));
  const body = e.odoo.t.notes[0].body;
  assert.match(body, /WhatsApp no disponible \(SIN_TELEFONO\) \| alternativa: https:\/\/login\.smoobu\.com\/en\/booking\/detail\/170500002/);
  assert.ok(!body.includes('wa.me'));
});

test('duplicados: repetir la sincronizacion no crea otra nota, otro pedido ni otro enlace (con o sin diario)', async () => {
  const e = env(170500003, { 'guest-name': 'Ana Sintetica Ficticia' });
  const op = createOp(170500003, { phone: '+57 300 123 4567' });
  await run(e, [op]);
  const r2 = await run(e, [op]);
  assert.equal(r2.results[0].result, RESULT.YA_APLICADA);
  const r3 = await run({ ...e, journal: new Journal() }, [op]);
  assert.equal(r3.results[0].result, RESULT.PRECONDICION_FALLIDA);
  assert.equal(e.odoo.t['sale.order'].length, 1); assert.equal(e.odoo.t.notes.length, 1);
  assert.equal(e.odoo.t.notes.filter((n) => n.body.includes('wa.me')).length, 1);
});

test('privacidad: el resultado del ejecutor no expone el telefono ni el enlace; la sonda y los reportes publicos no lo reciben', async () => {
  const e = env(170500004, { 'guest-name': 'Ana Sintetica Ficticia' });
  const r = await run(e, [createOp(170500004, { phone: '+57 300 123 4567' })]);
  const out = JSON.stringify({ results: r.results, journal: e.journal.entries });
  for (const banned of ['573001234567', '300 123 4567', 'wa.me', 'sintetico@example.invalid']) assert.ok(!out.includes(banned), banned);
  const src = readFileSync(new URL('../src/guest-contact.mjs', import.meta.url), 'utf8');
  assert.ok(!/console\.|process\.env|appendFileSync/.test(src), 'el modulo no imprime ni lee entorno');
});

test('el enlace wa.me solo se agrega a la nota del pedido NUEVO; el guard sigue exigiendo nota interna ATH-SYNC', () => {
  const base = { ids: [1], message_type: 'comment', subtype_xmlid: 'mail.mt_note' };
  assert.ok(validateWrite('sale.order', 'message_post', { ...base, body: `ATH-SYNC | clave x | SMOOBU-1 | CREATE_ORDER${assistNoteFragment({ whatsapp: { available: true, url: 'https://wa.me/573001234567?text=Hola' } })}` }));
  assert.throws(() => validateWrite('sale.order', 'message_post', { ...base, body: 'Hola https://wa.me/573001234567' }), /SYNC_WRITE_NOTE_FORMAT/);
  assert.throws(() => validateWrite('sale.order', 'message_post', { ...base, subtype_xmlid: 'mail.mt_comment', body: 'ATH-SYNC | x' }), /SYNC_WRITE_ONLY_INTERNAL_NOTES/);
});
