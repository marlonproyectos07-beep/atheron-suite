import test from 'node:test';
import assert from 'node:assert/strict';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooWhatsAppSendOnce, SEND_AUTH_PHRASE, SEND_ONCE_DEFAULTS, composeCommercialMessage, fechaLarga, sha256 } from '../src/whatsapp-agent-sender.mjs';

const ids = [3557506, 3557511, 3557516, 3557521, 3557526];
const cfg = { baseUrl: 'https://odoo.test', database: 'db', apiKey: 'k' };
const UID = SEND_ONCE_DEFAULTS.inboundMsgUid;
const NOW = new Date('2026-11-08T17:40:00Z');
const TEXT_IN = 'Hola, quiero reservar una habitación para 1 persona, entrando el 15 de noviembre de 2026 y saliendo el 17 de noviembre de 2026. ¿Qué habitaciones tienen disponibles y cuánto cuesta?';
const inbound = (o = {}) => ({ id: 3359, msg_uid: UID, body: `<p>${TEXT_IN}</p>`, create_date: '2026-11-08 17:27:44', message_type: 'inbound', mobile_number: '+573202859866', mobile_number_formatted: '573202859866', state: 'received', wa_account_id: [7, 'Atheron Hotels'], mail_message_id: [166137, 'x'], ...o });
const okResp = { availableApartments: [3557526], prices: {}, errorMessages: Object.fromEntries(ids.filter((i) => i !== 3557526).map((i) => [i, { message: 'not available' }])) };

function rig({ rows = [inbound()], channel = {}, markers = [], smoobuResp = okResp } = {}) {
  const calls = []; const posts = [];
  const odooFetch = async (url, init) => {
    const [, model, method] = url.match(/\/json\/2\/([^/]+)\/([^/]+)$/); const body = JSON.parse(init.body); calls.push(`${model}.${method}`);
    let out = [];
    if (model === 'discuss.channel' && method === 'search_read') out = [{ id: 256, channel_type: 'whatsapp', wa_account_id: [7, 'x'], whatsapp_number: '573202859866', whatsapp_channel_valid_until: '2026-11-09 17:27:44', ...channel }];
    if (model === 'whatsapp.message' && method === 'search_read') out = rows;
    if (model === 'mail.message' && method === 'search_read') out = markers;
    if (method === 'message_post') { posts.push({ ids: body.ids, message_type: body.message_type, body: body.body }); out = { id: 1 }; }
    return { ok: true, status: 200, json: async () => out };
  };
  const smoobuCalls = [];
  const smFetch = async (url, init) => {
    smoobuCalls.push(`${init.method} ${new URL(url).pathname}`);
    if (url.endsWith('/api/me')) return { ok: true, status: 200, json: async () => ({ id: 777 }) };
    const req = JSON.parse(init.body); assert.deepEqual([...req.apartments].sort(), [...ids].sort());
    return { ok: true, status: 200, json: async () => smoobuResp };
  };
  const smoobu = new SmoobuClient({ baseUrl: 'https://smoobu.test', apiKey: 'a', apiSecret: 's', now: () => 1700000000000, fetchImpl: smFetch });
  const mk = (gate = {}) => new OdooWhatsAppSendOnce({ ...cfg, fetchImpl: odooFetch }, gate);
  return { calls, posts, smoobuCalls, smoobu, mk };
}
const today = '2026-11-08';

test('texto comercial: fechas largas correctas, sin precio, con advertencia de valor por confirmar', () => {
  assert.equal(fechaLarga('2026-11-15'), 'domingo 15 de noviembre de 2026');
  assert.equal(fechaLarga('2026-11-17'), 'martes 17 de noviembre de 2026');
  const t = composeCommercialMessage({ state: { arrival: '2026-11-15', departure: '2026-11-17', guests: 1 }, rooms: [{ room: '302' }] });
  assert.match(t, /1 persona/); assert.match(t, /habitación 302/); assert.match(t, /2 noches/);
  assert.match(t, /valor de la estadía lo debe confirmar/); assert.match(t, /no constituye una reserva confirmada/);
  assert.doesNotMatch(t, /\$|COP/);
});

test('simulacion: todas las verificaciones en verde, una consulta a Smoobu, texto exacto y NINGUNA escritura', async () => {
  const r = rig(); const plan = await r.mk().planSend({ smoobu: r.smoobu, today, now: NOW });
  assert.equal(plan.ok, true, JSON.stringify(plan.checks.filter((c) => !c.ok)));
  assert.equal(plan.sent, false); assert.equal(plan.smoobuRequests, 1);
  assert.deepEqual(plan.facts.rooms, ['302']); assert.equal(plan.recipient, '***9866');
  assert.equal(plan.textSha256, sha256(plan.text)); assert.equal(plan.wouldCall.message_type, 'whatsapp_message');
  assert.equal(r.posts.length, 0); assert.ok(r.calls.every((c) => c.endsWith('.search_read')));
  assert.deepEqual(r.smoobuCalls.filter((c) => !c.includes('/api/me')).length, 1);
});

test('sendOnce se niega sin frase, sin hash aprobado, o con hash distinto: cero escrituras', async () => {
  const r = rig();
  await assert.rejects(r.mk().sendOnce({ smoobu: r.smoobu, today, now: NOW }), { code: 'SEND_ONCE_NOT_AUTHORIZED' });
  await assert.rejects(r.mk({ authorization: 'si' }).sendOnce({ smoobu: r.smoobu, today, now: NOW }), { code: 'SEND_ONCE_NOT_AUTHORIZED' });
  await assert.rejects(r.mk({ authorization: SEND_AUTH_PHRASE }).sendOnce({ smoobu: r.smoobu, today, now: NOW }), { code: 'SEND_ONCE_TEXT_NOT_APPROVED' });
  await assert.rejects(r.mk({ authorization: SEND_AUTH_PHRASE, approvedTextSha256: 'a'.repeat(64) }).sendOnce({ smoobu: r.smoobu, today, now: NOW }), { code: 'SEND_ONCE_TEXT_CHANGED_SINCE_APPROVAL' });
  assert.equal(r.posts.length, 0);
});

test('controles que bloquean el envio: ventana, saliente previo, marcador, destinatario, cuenta, mensaje distinto', async () => {
  const bad = async (over, name) => { const r = rig(over); const p = await r.mk().planSend({ smoobu: r.smoobu, today, now: NOW }); assert.equal(p.ok, false, name); assert.ok(p.checks.some((c) => !c.ok), name); return r; };
  await bad({ channel: { whatsapp_channel_valid_until: '2026-11-08 17:50:00' } }, 'ventana por vencer');
  await bad({ rows: [inbound({ create_date: '2026-11-07 10:00:00' })] }, 'entrante viejo');
  await bad({ rows: [inbound(), { ...inbound({ id: 3360, message_type: 'outbound', msg_uid: 'wamid.X=' }) }] }, 'ya hay saliente');
  await bad({ markers: [{ id: 5 }] }, 'marcador previo');
  await bad({ channel: { whatsapp_number: '573001112233' } }, 'otro destinatario');
  await bad({ channel: { wa_account_id: [9, 'otra'] } }, 'otra cuenta');
  await bad({ channel: { channel_type: 'channel' } }, 'no es canal WhatsApp');
  await bad({ rows: [inbound({ msg_uid: 'wamid.OTRO=' })] }, 'no es el mensaje aprobado');
  const r = await bad({ smoobuResp: { availableApartments: [], prices: {}, errorMessages: {} } }, 'sin disponibilidad');
  assert.equal(r.posts.length, 0);
});

test('envio autorizado (simulado): reserva marcador en 257 y luego un unico envio al canal 256; no hay reintento', async () => {
  const r0 = rig(); const plan = await r0.mk().planSend({ smoobu: r0.smoobu, today, now: NOW });
  const r = rig();
  const out = await r.mk({ authorization: SEND_AUTH_PHRASE, approvedTextSha256: plan.textSha256 }).sendOnce({ smoobu: r.smoobu, today, now: NOW });
  assert.equal(out.sent, true); assert.equal(r.posts.length, 2);
  assert.deepEqual(r.posts.map((p) => p.ids[0]), [257, 256]); assert.equal(r.posts[0].message_type, 'comment'); assert.equal(r.posts[1].message_type, 'whatsapp_message');
  assert.match(r.posts[0].body, /ATH-SEND once=wamid/);
  assert.equal(r.posts.filter((p) => p.ids[0] === 256).length, 1);
});

test('script de envio real: sin armado y frase exactos no hace nada (cero solicitudes)', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = (env) => spawnSync(process.execPath, [new URL('../scripts/whatsapp-agent-send-once.mjs', import.meta.url).pathname], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  for (const env of [{}, { WHATSAPP_AGENT_ARM: 'ATH-PMS-WA-068-SEND-ONCE' }, { WHATSAPP_AGENT_ARM: 'ATH-PMS-WA-068-SEND-ONCE', WHATSAPP_SEND_AUTH: 'si' }]) {
    const r = run(env); assert.equal(r.status, 2); assert.match(r.stdout, /NOT_AUTHORIZED/); assert.match(r.stdout, /"sent":false/);
  }
});
