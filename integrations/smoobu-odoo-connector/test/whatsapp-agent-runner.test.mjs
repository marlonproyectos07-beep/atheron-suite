import test from 'node:test';
import assert from 'node:assert/strict';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooDraftWriter } from '../src/odoo-draft-writer.mjs';
import { runAgent, parseInbound, TAG, maskPhone } from '../src/whatsapp-agent-runner.mjs';

const ids = [3557506, 3557511, 3557516, 3557521, 3557526];
const cfg = { baseUrl: 'https://odoo.test', database: 'db', apiKey: 'k' };
const msg = (id, uid, text, o = {}) => ({ id, msg_uid: uid, body: `<p>${text}</p>`, create_date: '2026-11-07 15:00:00', message_type: 'inbound', mobile_number: '573202859866', mobile_number_formatted: '+573202859866', state: 'received', wa_account_id: [7, 'Atheron Hotels'], mail_message_id: [id + 100, 'x'], ...o });

/** Odoo falso: registra TODAS las llamadas para poder afirmar que no hay escrituras indebidas. */
function fakes({ rows, channelType = 'channel', smoobuResp, guestsCapacityError = false }) {
  const calls = { odoo: [], smoobu: [] }; const posted = [];
  const odooFetch = async (url, init) => {
    const [, model, method] = url.match(/\/json\/2\/([^/]+)\/([^/]+)$/); const body = JSON.parse(init.body);
    calls.odoo.push(`${model}.${method}`);
    let out = [];
    if (model === 'whatsapp.message' && method === 'search_read') out = rows;
    if (model === 'discuss.channel' && method === 'search_read') out = [{ id: 55, channel_type: channelType }];
    if (model === 'mail.message' && method === 'search_read') out = posted.map((h, i) => ({ id: i + 1, body: h }));
    if (model === 'discuss.channel' && method === 'message_post') { posted.push(body.body); out = { id: 999 }; }
    return { ok: true, status: 200, json: async () => out };
  };
  const smFetch = async (url, init) => {
    calls.smoobu.push(`${init.method} ${new URL(url).pathname}`);
    if (url.endsWith('/api/me')) return { ok: true, status: 200, json: async () => ({ id: 777 }) };
    const req = JSON.parse(init.body);
    assert.deepEqual([...req.apartments].sort(), [...ids].sort());           // exactamente las 5 habitaciones
    const resp = guestsCapacityError && req.guests > 1
      ? { availableApartments: [], prices: {}, errorMessages: Object.fromEntries(ids.map((i) => [i, { message: 'The number of guests exceeds the limit of the apartment' }])) }
      : smoobuResp;
    return { ok: true, status: 200, json: async () => resp };
  };
  return {
    calls, posted,
    odoo: new OdooJson2Client({ ...cfg, fetchImpl: odooFetch }),
    writer: new OdooDraftWriter({ ...cfg, fetchImpl: odooFetch }, 55),
    smoobu: new SmoobuClient({ baseUrl: 'https://smoobu.test', apiKey: 'a', apiSecret: 's', now: () => 1700000000000, fetchImpl: smFetch }),
  };
}
const today = '2026-11-07';
const okResp = { availableApartments: ids, prices: {}, errorMessages: {} };

test('parseInbound: solo entrantes de la cuenta 7; descarta Security/Masivos y salientes', () => {
  assert.ok(parseInbound(msg(1, 'wamid.A1', 'hola')));
  assert.equal(parseInbound(msg(1, 'wamid.A1', 'hola', { wa_account_id: [6, 'Atheron Masivos'] })), null);
  assert.equal(parseInbound(msg(1, 'wamid.A1', 'hola', { wa_account_id: [3, 'Atheron Security'] })), null);
  assert.equal(parseInbound(msg(1, 'wamid.A1', 'hola', { message_type: 'outbound' })), null);
  assert.equal(parseInbound(msg(1, '', 'hola')), null);
});

test('flujo completo: mensaje real -> consulta Smoobu 5 habitaciones -> borrador en canal interno', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.B1', 'Quiero reservar para 1 persona del 15 al 17 de noviembre')], smoobuResp: okResp });
  const r = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r.smoobuRequests, 1);
  assert.equal(r.posted, 1);
  assert.equal(r.drafts[0].kind, 'draft_without_price');          // sin precio verificado no se cotiza
  assert.match(r.drafts[0].draft, /15:00/);
  assert.match(f.posted[0], /BORRADOR DEL AGENTE — NO ENVIADO/);
  assert.match(f.posted[0], new RegExp(TAG + 'wamid.B1'));
  assert.doesNotMatch(f.posted[0], /573202859866/);               // telefono enmascarado en el borrador
  // escrituras: unicamente message_post en el canal interno
  const writes = f.calls.odoo.filter((c) => !c.endsWith('.search_read'));
  assert.deepEqual(writes, ['discuss.channel.message_post']);
  assert.equal(r.odooWritesOnWhatsapp, 0); assert.equal(r.sendEnabled, false); assert.equal(r.bookingEnabled, false);
  assert.deepEqual(f.calls.smoobu, ['GET /api/me', 'POST /booking/checkApartmentAvailability']);
});

test('deduplicacion persistente: una segunda ejecucion no repite borrador ni consulta', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.C1', 'para 1 persona del 15 al 17 de noviembre')], smoobuResp: okResp });
  await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  const r2 = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r2.posted, 0); assert.equal(r2.alreadyProcessed, 1); assert.equal(r2.smoobuRequests, 0);
  assert.equal(f.posted.length, 1);
});

test('contexto conversacional: fechas y personas en mensajes distintos', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.D1', 'Hola, somos 1 persona'), msg(2, 'wamid.D2', 'del 15 al 17 de noviembre')], smoobuResp: okResp });
  const r = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r.drafts.length, 1);
  assert.deepEqual(r.drafts[0].covers, ['wamid.D1', 'wamid.D2']);
  assert.equal(r.smoobuRequests, 1);
});

test('faltan datos: pide informacion y NO consulta Smoobu', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.E1', 'PRUEBA ATH-056. Mensaje de verificación. No responder todavía.')], smoobuResp: okResp });
  const r = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r.drafts[0].kind, 'needs_details'); assert.equal(r.smoobuRequests, 0); assert.deepEqual(f.calls.smoobu, []);
});

test('capacidad 1 de Smoobu: con 2 personas deriva a recepcion y no inventa', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.F1', 'somos 2 personas del 15 al 17 de noviembre')], smoobuResp: okResp, guestsCapacityError: true });
  const r = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r.drafts[0].kind, 'handoff'); assert.equal(r.drafts[0].reason, 'GUEST_CAPACITY_UNVERIFIED');
});

test('precio verificado en COP solo como borrador; precio nulo nunca como cero', async () => {
  const priced = { availableApartments: [3557506], prices: { 3557506: { price: 150000, currency: 'COP' } }, errorMessages: { 3557511: { message: 'x' } } };
  const f = fakes({ rows: [msg(1, 'wamid.G1', 'para 1 persona del 15 al 16 de noviembre')], smoobuResp: priced });
  const r = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r.drafts[0].kind, 'draft_with_price'); assert.match(r.drafts[0].draft, /150000 COP/);
});

test('rechaza un canal de borradores que sea de WhatsApp (enviaria al cliente)', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.H1', 'para 1 persona del 15 al 17 de noviembre')], smoobuResp: okResp, channelType: 'whatsapp' });
  await assert.rejects(() => runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today }), { code: 'DRAFT_CHANNEL_IS_NOT_INTERNAL' });
  assert.equal(f.posted.length, 0); assert.deepEqual(f.calls.smoobu, []);
});

test('sin escritor (dry-run) no escribe nada en Odoo', async () => {
  const f = fakes({ rows: [msg(1, 'wamid.I1', 'para 1 persona del 15 al 17 de noviembre')], smoobuResp: okResp });
  const r = await runAgent({ odoo: f.odoo, writer: null, smoobu: f.smoobu, today });
  assert.equal(r.posted, 0); assert.equal(r.drafts.length, 1);
  assert.ok(f.calls.odoo.every((c) => c.endsWith('.search_read')));
});

test('el cliente de solo lectura sigue rechazando escrituras y el escritor limita el canal', async () => {
  const f = fakes({ rows: [], smoobuResp: okResp });
  await assert.rejects(() => f.odoo.call('whatsapp.message', 'create', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  assert.throws(() => new OdooDraftWriter(cfg, 0), { code: 'DRAFT_CHANNEL_INVALID' });
  assert.equal(maskPhone('+573202859866'), '***9866');
});

test('wamid real (base64, termina en «=»): se acepta, se deduplica y no queda bloqueado en silencio', async () => {
  const uid = 'wamid.HBgMNTczMjAyODU5ODY2FQIAEhgUM0E2NjQ5RjA1MjlCMzIyQTg2MEUA=';   // forma real (66 car.) observada en Odoo
  const f = fakes({ rows: [msg(1, uid, 'PRUEBA ATH-056. Mensaje de verificación. No responder todavía.')], smoobuResp: okResp });
  const r = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r.drafts.length, 1); assert.deepEqual(r.blocked, []);
  assert.match(f.posted[0], /ATH-AGENT msg=wamid\.HBgM[A-Za-z0-9=]+/);
  const r2 = await runAgent({ odoo: f.odoo, writer: f.writer, smoobu: f.smoobu, today });
  assert.equal(r2.posted, 0); assert.equal(r2.alreadyProcessed, 1);
});

test('un id invalido se informa en report.blocked en lugar de ignorarse', async () => {
  const f = fakes({ rows: [msg(1, 'a b', 'hola')], smoobuResp: okResp });
  const r = await runAgent({ odoo: f.odoo, writer: null, smoobu: f.smoobu, today });
  assert.equal(r.drafts.length, 0); assert.equal(r.blocked[0].code, 'INVALID_MESSAGE_ID');
});
