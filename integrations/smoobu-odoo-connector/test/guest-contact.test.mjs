import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { Journal, MemoryLock, PHASES } from '../src/sync-journal.mjs';
import { applyPlan, RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';
import {
  normalizePhoneE164, buildGuestMessage, buildWhatsappLink, fallbackContact, planGuestContact, assistNoteHtml,
  safeCheckinLink, checkinLinkFromBooking, strictEncode, CHECKIN_LINK_FIELD, contactStates, physicalFromOdoo, PHONE_REASONS,
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

test('enlace de check-in: solo https de Smoobu con la forma del check-in online; otros hosts, http, credenciales y rutas ajenas se descartan', () => {
  assert.ok(safeCheckinLink('https://login.smoobu.com/en/online-check-in/check-in/TOKEN_SINTETICO'));
  for (const bad of ['http://login.smoobu.com/en/online-check-in/check-in/TOKEN_SINTETICO', 'https://evil.example/en/online-check-in/check-in/TOKEN_SINTETICO', 'https://login.smoobu.com.evil.example/en/online-check-in/check-in/TOKEN_SINTETICO',
    'https://u:p@login.smoobu.com/en/online-check-in/check-in/TOKEN_SINTETICO', 'https://login.smoobu.com/en/guest-app/TOKEN_SINTETICO', 'https://login.smoobu.com/en/online-check-in/check-in/TOKEN_SINTETICO?x=1',
    'javascript:alert(1)', '', null, 'no es url']) assert.equal(safeCheckinLink(bad), null, String(bad));
  assert.ok(!buildGuestMessage({ checkinLink: 'https://evil.example/x' }).includes('evil'));
  // fuente conectada: solo `guest-app-url` de la respuesta de Smoobu, y solo si tiene esa forma
  assert.equal(CHECKIN_LINK_FIELD, 'guest-app-url');
  assert.equal(checkinLinkFromBooking({ 'guest-app-url': 'https://login.smoobu.com/es/online-check-in/check-in/TOKEN_SINTETICO' }), 'https://login.smoobu.com/es/online-check-in/check-in/TOKEN_SINTETICO');
  for (const b of [{ 'guest-app-url': '' }, { 'guest-app-url': null }, {}, undefined, { 'guest-app-url': 'https://login.smoobu.com/en/guest-app/ABC123456' }, { otroCampo: 'https://login.smoobu.com/en/online-check-in/check-in/TOKEN_SINTETICO' }]) assert.equal(checkinLinkFromBooking(b), null);
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
  assert.equal(assistNoteHtml('ATH-SYNC | x', none), 'ATH-SYNC | x | WhatsApp no disponible (SIN_TELEFONO) | alternativa: <a href="https://login.smoobu.com/en/booking/detail/170500001" target="_blank" rel="noopener noreferrer">Abrir reserva en Smoobu</a>');
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
const CHECKIN = 'https://login.smoobu.com/es/online-check-in/check-in/TOKEN_SINTETICO';
const bodyAnchors = (html) => [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], label: m[2] }));
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
  assert.match(e.odoo.t.notes[0].body, /^ATH-SYNC \| clave [0-9a-f]{16} \| SMOOBU-170500001 \| CREATE_ORDER \| WhatsApp \(abre el chat, envio manual\): <a href="https:\/\/wa\.me\/573001234567\?text=/);
  assert.ok(e.odoo.calls.length > 0 && e.odoo.calls.every((c) => !/whatsapp|sms|mail\.mail|_send|send_/i.test(c)), `ninguna llamada de envio: ${e.odoo.calls.join(',')}`);
  assert.ok(e.odoo.calls.some((c) => c === 'sale.order/message_post'), 'solo la nota interna');
});

test('ejecutor: sin telefono la nota dice que no hay WhatsApp y da la alternativa; no aparece wa.me', async () => {
  const e = env(170500002, { 'guest-name': 'Ana Sintetica Ficticia' });
  const r = await run(e, [createOp(170500002, { phone: null })]);
  assert.equal(r.results[0].result, RESULT.APLICADA, JSON.stringify(r));
  const body = e.odoo.t.notes[0].body;
  assert.match(body, /WhatsApp no disponible \(SIN_TELEFONO\) \| alternativa: <a href="https:\/\/login\.smoobu\.com\/en\/booking\/detail\/170500002"/);
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

const decodedText = (href) => decodeURIComponent(new URL(href).searchParams.get('text'));

test('check-in conectado: con enlace valido en la respuesta de Smoobu el mensaje lo incluye; sin enlace, vacio o ajeno, no', async () => {
  const withLink = env(170500005, { 'guest-name': 'Ana Sintetica Ficticia', 'guest-app-url': CHECKIN });
  await run(withLink, [createOp(170500005, { phone: '+57 300 123 4567' })]);
  const [a] = bodyAnchors(withLink.odoo.t.notes[0].body);
  assert.ok(decodedText(a.href).includes(`completar el check-in en línea aquí: ${CHECKIN}`));
  for (const [id, extra] of [[170500006, {}], [170500007, { 'guest-app-url': '' }], [170500008, { 'guest-app-url': 'https://evil.example/en/online-check-in/check-in/TOKEN_SINTETICO' }], [170500009, { 'guest-app-url': 'https://login.smoobu.com/en/guest-app/TOKEN_SINTETICO' }]]) {
    const e = env(id, { 'guest-name': 'Ana Sintetica Ficticia', ...extra });
    await run(e, [createOp(id, { phone: '+57 300 123 4567' })]);
    const msg = decodedText(bodyAnchors(e.odoo.t.notes[0].body)[0].href);
    assert.ok(!/check-in|http/.test(msg), `${id}: ${msg}`);
    assert.ok(!e.odoo.t.notes[0].body.includes('TOKEN_SINTETICO'));
  }
});

test('nota clicable: el cuerpo es HTML con UNA ancla https a wa.me, publicado con body_is_html (Odoo 19 escapa el texto plano)', async () => {
  const e = env(170500010, { 'guest-name': 'Ana Sintetica Ficticia' });
  const r = await run(e, [createOp(170500010, { phone: '+57 300 123 4567' })]);
  assert.equal(r.results[0].result, RESULT.APLICADA, JSON.stringify(r));
  const body = e.odoo.t.notes[0].body;
  const anchors = bodyAnchors(body);
  assert.equal(anchors.length, 1);
  assert.match(anchors[0].href, /^https:\/\/wa\.me\/573001234567\?text=[A-Za-z0-9%._~-]+$/);
  assert.match(body, /<a href="[^"]+" target="_blank" rel="noopener noreferrer">Abrir chat de WhatsApp<\/a>$/);
  assert.ok(!/<(?!a |\/a>)/.test(body), 'ninguna otra etiqueta');
  assert.ok(!/ [^<>]*https?:\/\/[^<>]*(?=<)/.test(body.replace(/<a [^>]*>.*?<\/a>/g, '')), 'ninguna URL fuera del ancla (texto plano no seria clicable)');
  // el mensaje tiene "&", acentos y comillas: el href no se rompe
  assert.equal(new URL(anchors[0].href).searchParams.get('text').startsWith('Hola Ana, le escribimos'), true);
});

test('guard: body_is_html solo para anclas https a wa.me o Smoobu; scripts, otros hosts, atributos extra y body_is_html distinto de true se rechazan', () => {
  const base = { ids: [1], message_type: 'comment', subtype_xmlid: 'mail.mt_note', body_is_html: true };
  const A = (href, label = 'Abrir') => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  const good = `ATH-SYNC | clave x | SMOOBU-1 | CREATE_ORDER | WhatsApp: ${A('https://wa.me/573001234567?text=Hola%20Ana')}`;
  assert.ok(validateWrite('sale.order', 'message_post', { ...base, body: good }));
  assert.ok(validateWrite('sale.order', 'message_post', { ...base, body: `ATH-SYNC | x | ${A('https://login.smoobu.com/en/booking/detail/170500001')}` }));
  assert.ok(validateWrite('sale.order', 'message_post', { ids: [1], message_type: 'comment', subtype_xmlid: 'mail.mt_note', body: 'ATH-SYNC | texto plano sin HTML' }), 'las notas de texto siguen igual');
  const bad = [
    `ATH-SYNC | x | ${A('https://evil.example/x')}`, `ATH-SYNC | x | ${A('http://wa.me/573001234567?text=a')}`, `ATH-SYNC | x | ${A('javascript:alert(1)')}`,
    'ATH-SYNC | x | <script>alert(1)</script>', 'ATH-SYNC | x | <img src="https://evil.example/p.png">', `ATH-SYNC | x | ${A('https://wa.me/573001234567?text=a')}${A('https://wa.me/573001234568?text=b')}`,
    `ATH-SYNC | x | <a href="https://wa.me/573001234567?text=a" onclick="x()">Abrir</a>`, 'ATH-SYNC | x | a < b', 'ATH-SYNC | x | &nbsp;',
  ];
  for (const body of bad) assert.throws(() => validateWrite('sale.order', 'message_post', { ...base, body }), /SYNC_WRITE_NOTE_HTML_INVALID/, body);
  assert.throws(() => validateWrite('sale.order', 'message_post', { ...base, body_is_html: 'true', body: good }), /SYNC_WRITE_NOTE_HTML_INVALID/);
  assert.throws(() => validateWrite('sale.order', 'message_post', { ...base, body: `Hola ${A('https://wa.me/573001234567?text=a')}` }), /SYNC_WRITE_NOTE_FORMAT/);
  assert.throws(() => validateWrite('sale.order', 'message_post', { ...base, subtype_xmlid: 'mail.mt_comment', body: good }), /SYNC_WRITE_ONLY_INTERNAL_NOTES/);
});

test("apostrofo y signos !'()*: la codificacion es estricta, el href solo trae [A-Za-z0-9%._~-] y sobrevive al guard", () => {
  assert.ok(encodeURIComponent("O'Connor (VIP)! *").includes("'"), 'encodeURIComponent por si solo deja pasar el apostrofo (origen del defecto)');
  assert.equal(strictEncode("O'Connor (VIP)! *"), 'O%27Connor%20%28VIP%29%21%20%2A');
  const msg = buildGuestMessage({ guestName: "O'Connor Sintetico", arrival: '2026-11-22', departure: '2026-11-23' });
  const url = buildWhatsappLink('+573001234567', `${msg} !'()*`);
  assert.match(url, /^https:\/\/wa\.me\/573001234567\?text=[A-Za-z0-9%._~-]+$/);
  assert.equal(decodeURIComponent(new URL(url).searchParams.get('text')), `${msg} !'()*`); // ida y vuelta sin perder el texto
  const body = assistNoteHtml('ATH-SYNC | clave k | SMOOBU-1 | CREATE_ORDER', { whatsapp: { available: true, url } });
  assert.ok(validateWrite('sale.order', 'message_post', { ids: [1], body, body_is_html: true, message_type: 'comment', subtype_xmlid: 'mail.mt_note' }));
});

test("integrado: huesped O'Connor atraviesa applyPlan y validateWrite; la nota queda publicada con el apostrofo codificado", async () => {
  const e = env(170500011, { 'guest-name': "O'Connor Sintetico" });
  const r = await run(e, [createOp(170500011, { phone: '+57 300 123 4567', name: "O'Connor Sintetico" })]);
  assert.equal(r.results[0].result, RESULT.APLICADA, JSON.stringify(r));
  assert.equal(e.odoo.t['res.partner'].length, 1); assert.equal(e.odoo.t['sale.order'].length, 1); assert.equal(e.odoo.t.notes.length, 1);
  const [a] = bodyAnchors(e.odoo.t.notes[0].body);
  assert.match(a.href, /^https:\/\/wa\.me\/573001234567\?text=[A-Za-z0-9%._~-]+$/);
  assert.ok(a.href.includes('%27'), 'apostrofo codificado como %27');
  assert.ok(decodedText(a.href).startsWith("Hola O'connor, le escribimos"));
  assert.ok(validateWrite('sale.order', 'message_post', { ids: [1], body: e.odoo.t.notes[0].body, body_is_html: true, message_type: 'comment', subtype_xmlid: 'mail.mt_note' }));
});

test('error de validacion de la nota: se detecta ANTES de escribir; no queda contacto, pedido, nota ni diario a medias', async () => {
  const e = env(170500012, { 'guest-name': 'Ana Sintetica Ficticia' });
  e.writer.validateWrite = () => { throw new Error('SYNC_WRITE_NOTE_HTML_INVALID'); }; // el guard rechazaria el cuerpo de la nota
  const r = await run(e, [createOp(170500012, { phone: '+57 300 123 4567' })]);
  assert.deepEqual([r.results[0].result, r.results[0].code], [RESULT.PRECONDICION_FALLIDA, 'NOTA_INTERNA_NO_VALIDA']);
  assert.deepEqual([e.writer.writes, e.odoo.t['res.partner'].length, e.odoo.t['sale.order'].length, e.odoo.t.notes.length], [0, 0, 0, 0]);
  assert.equal(e.journal.incomplete().length, 0, 'sin entrada INTENT pendiente');
  assert.ok(e.odoo.calls.every((c) => /search_read|search_count|fields_get/.test(c)), `solo lecturas: ${e.odoo.calls.join(',')}`);
});

test('si falla la publicacion de la nota (ya creados contacto y pedido) no hay duplicados: queda INTENT y la recuperacion la cierra', async () => {
  const e = env(170500013, { 'guest-name': 'Ana Sintetica Ficticia' });
  const op = createOp(170500013, { phone: '+57 300 123 4567' });
  e.odoo.fault({ model: 'sale.order', method: 'message_post', when: 'before', status: 400 });
  const r1 = await run(e, [op]);
  assert.equal(r1.halted, 'FALLO_PARCIAL');
  assert.deepEqual([e.odoo.t['res.partner'].length, e.odoo.t['sale.order'].length], [1, 1]);
  assert.equal(e.journal.incomplete().length, 1);
  const r2 = await run(e, [op]);
  assert.equal(r2.recovered[0].phase, PHASES.RECOVERED_DONE);
  assert.deepEqual([e.odoo.t['res.partner'].length, e.odoo.t['sale.order'].length], [1, 1], 'sin duplicados');
});
