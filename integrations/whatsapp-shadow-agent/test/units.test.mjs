import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEntities, detectIntents, parseNumber, normalize } from '../src/nlu.mjs';
import { classify } from '../src/classifier.mjs';
import { computeDeposit, cancellationDecision } from '../src/policies.mjs';
import { groupTier, planDistribution } from '../src/groups.mjs';
import { createContext, mergeEntities } from '../src/context.mjs';
import { handleCallEvent } from '../src/calls.mjs';
import { audioToText, NullTranscription } from '../src/audio.mjs';
import { catalogFromOdooMasterData } from '../src/gateway-port.mjs';
import { anonymizeId, scrub, buildRecord } from '../src/evidence.mjs';
import { NOW, makeAgent } from './support.mjs';

const T = '2026-10-03';
const ent = (t) => extractEntities(t, { today: T });

test('numeros en palabras y cifras', () => {
  assert.equal(parseNumber('cuatro'), 4);
  assert.equal(parseNumber('treinta y cinco'), 35);
  assert.equal(parseNumber('ciento cincuenta'), 150);
  assert.equal(parseNumber('150'), 150);
});

test('entidades: personas, fechas, noches, ninos', () => {
  assert.equal(ent('Somos cuatro para mañana').total_personas, 4);
  assert.equal(ent('Somos cuatro para mañana').fecha_in, '2026-10-04');
  assert.equal(ent('pasado mañana').fecha_in, '2026-10-05');
  assert.equal(ent('dentro de 5 días').fecha_in, '2026-10-08');
  assert.deepEqual([ent('del 20 al 22 de octubre').fecha_in, ent('del 20 al 22 de octubre').fecha_out], ['2026-10-20', '2026-10-22']);
  assert.equal(ent('del 28 de diciembre al 2 de enero').fecha_out, '2027-01-02');
  assert.equal(ent('el 1 de septiembre').fecha_in, '2027-09-01'); // ya paso este ano
  assert.equal(ent('tres noches').noches, 3);
  const k = ent('somos 2 adultos y 2 niños de 5 y 8 años');
  assert.equal(k.adultos, 2); assert.equal(k.ninos, 2); assert.deepEqual(k.edades_ninos, [5, 8]); assert.equal(k.total_personas, 4);
  assert.equal(ent('Necesito alojamiento para 150 personas').total_personas, 150);
  assert.equal(ent('Ya no somos dos, somos tres').total_personas, 3);
  assert.equal(ent('para 2 noches').total_personas, undefined);
  assert.equal(ent('el viernes').fecha_in, '2026-10-09');
});

test('intenciones', () => {
  assert.ok(detectIntents('¿Me haces descuento?').includes('DISCOUNT'));
  assert.ok(detectIntents('¿Cuánto debo abonar?').includes('DEPOSIT'));
  assert.ok(detectIntents('Booking me sale más barato').includes('OTA_PRICE_COMPARISON'));
  assert.ok(detectIntents('Me pueden igualar el precio de Airbnb').includes('OTA_PRICE_COMPARISON'));
  assert.ok(detectIntents('ya pagué').includes('PAYMENT_CLAIM'));
  assert.ok(detectIntents('Quiero cancelar').includes('CANCEL'));
  assert.deepEqual(detectIntents('Hola'), ['GREETING']);
});

test('clasificacion', () => {
  const c = (t, o) => classify(t, o).classification;
  assert.equal(c('¿Tienes disponibilidad para un cliente mío?'), 'ALLY_B2B');
  assert.equal(c('alarma activada en la sede'), 'ATHERON_SECURITY');
  assert.equal(c('¿Hay cámaras en las habitaciones del hotel?'), 'UNKNOWN'); // huesped preguntando: no es aviso de seguridad
  assert.equal(c('hola', { prior: 'GUEST_LEAD' }), 'GUEST_LEAD');
  assert.equal(c('Hola', { registry: { role: 'STAFF' } }), 'STAFF');
  assert.equal(c('hola', { registry: { hasReservation: true } }), 'GUEST_RESERVED');
  assert.equal(c('hola'), 'UNKNOWN');
});

test('anticipo 50%: enteros y suma exacta', () => {
  assert.deepEqual(computeDeposit(400000), { pct: 50, anticipo: 200000, saldo: 200000 });
  const d = computeDeposit(239401);
  assert.equal(d.anticipo + d.saldo, 239401);
  assert.equal(computeDeposit(null), null);
  assert.equal(computeDeposit(0), null);
});

test('cancelacion: 48 h, OTA, sin fecha', () => {
  assert.equal(cancellationDecision({ checkIn: '2026-10-08', now: NOW }).kind, 'WITHIN_POLICY');
  assert.equal(cancellationDecision({ checkIn: '2026-10-04', now: NOW }).kind, 'EXCEPTION');
  assert.equal(cancellationDecision({ checkIn: '2026-10-05', now: NOW }).kind, 'EXCEPTION'); // 38 h contando check-in 00:00: conservador
  assert.equal(cancellationDecision({ checkIn: '2026-10-06', now: NOW }).kind, 'WITHIN_POLICY');
  assert.equal(cancellationDecision({ checkIn: '2026-10-20', now: NOW, channel: 'booking' }).kind, 'OTA');
  assert.equal(cancellationDecision({ now: NOW }).kind, 'NEED_DATE');
});

test('tiers de grupo', () => {
  assert.deepEqual([10, 11, 29, 30, 99, 100, 150].map(groupTier), [null, 'GROUP_SALES_FLOW', 'GROUP_SALES_FLOW', 'LARGE_GROUP_FLOW', 'LARGE_GROUP_FLOW', 'STRATEGIC_GROUP_LEAD', 'STRATEGIC_GROUP_LEAD']);
});

test('reparto de grupos: nunca excede capacidad; combina propiedades; informa faltante', () => {
  const o = (pid, n, cap, price = 100) => Array.from({ length: n }, (_, i) => ({ property_id: pid, property_name: `P${pid}`, unit_id: pid * 100 + i, unit_label: `u${i}`, capacity: cap, available: true, base_total: price }));
  const options = [...o(1, 3, 4), ...o(2, 2, 5)]; // 12 + 10 = 22
  const single = planDistribution(options, 9);
  assert.equal(single.covered, true); assert.equal(single.mode, 'SINGLE_PROPERTY'); assert.equal(single.assignments[0].property_id, 2);
  const multi = planDistribution(options, 20);
  assert.equal(multi.mode, 'MULTI_PROPERTY'); assert.equal(multi.covered, true);
  assert.equal(multi.assignments.reduce((s, a) => s + a.guests_assigned, 0), 20);
  for (const a of multi.assignments) assert.ok(a.guests_assigned <= a.capacity_used);
  const short = planDistribution(options, 30);
  assert.equal(short.covered, false); assert.equal(short.shortfall, 8);
  assert.equal(planDistribution([{ ...options[0], available: false }], 2).assignments.length, 0);
  const noPrice = planDistribution(o(1, 2, 4, null).map((x) => ({ ...x, base_total: null })), 5);
  assert.equal(noPrice.assignments[0].base_total, null);
});

test('memoria: reemplaza, registra cambios, recalcula noches y invalida cotizacion', () => {
  let c = createContext();
  ({ context: c } = mergeEntities(c, { fecha_in: '2026-10-20', fecha_out: '2026-10-22', total_personas: 2 }));
  assert.equal(c.noches, 2);
  c.precio_cotizado = 1000; c.anticipo = 500;
  const m = mergeEntities(c, { total_personas: 3 });
  assert.deepEqual(m.changes, [{ field: 'total_personas', from: 2, to: 3 }]);
  assert.equal(m.invalidates, true); assert.equal(m.context.precio_cotizado, null);
  const n = mergeEntities(c, { noches: 4 });
  assert.equal(n.context.fecha_out, '2026-10-24');
  assert.equal(mergeEntities(c, { bano_preferencia: 'privado' }).invalidates, false);
});

test('llamadas: solo se modela el evento; nunca se llama', () => {
  const near = handleCallEvent({ type: 'MISSED_CALL' }, { context: { fecha_in: '2026-10-04' }, classification: 'GUEST_RESERVED', now: NOW });
  assert.equal(near.priority, 'P1'); assert.equal(near.callback_required, true); assert.equal(near.call_placed, false); assert.equal(near.send, false); assert.ok(near.proposed_followup_message);
  assert.equal(handleCallEvent({ type: 'CALL_REQUEST' }, { classification: 'GUEST_LEAD', context: { precio_cotizado: 5 }, now: NOW }).priority, 'P2');
  assert.equal(handleCallEvent({ type: 'CALL_REQUEST' }, { classification: 'ALLY_B2B', now: NOW }).proposed_followup_message, null);
  assert.throws(() => handleCallEvent({ type: 'X' }), /CALL_EVENT_UNKNOWN/);
});

test('llamada via agente usa el contexto de la conversacion', async () => {
  const { agent } = makeAgent();
  await agent.handle('c1', ['Somos 2 del 20 al 22 de octubre']);
  const e = await agent.handleCall('c1', { type: 'MISSED_CALL' });
  assert.equal(e.priority, 'P2');
});

test('audio: sin transcripcion no se inventa texto; con transcripcion se trata como texto', async () => {
  assert.equal((await audioToText({ media_id: 'm' }, new NullTranscription())).ok, false);
  const port = { transcribe: async () => ({ ok: true, text: 'somos dos para mañana', confidence: 0.9 }) };
  assert.equal((await audioToText({}, port)).text, 'somos dos para mañana');
  assert.equal((await audioToText({}, { transcribe: async () => ({ ok: true, text: 'x', confidence: 0.2 }) })).ok, false);
  const { agent } = makeAgent();
  const r = await agent.handle('a1', [{ type: 'audio', media_id: 'm1', ts: Date.now() }]);
  assert.equal(r.status, 'AUDIO_PENDING_TRANSCRIPTION'); assert.match(r.text, /escribes/);
});

test('catalogo desde el formato del respaldo de Odoo: capacidad comercial, sin compuestas', () => {
  const cat = catalogFromOdooMasterData({
    properties: [{ id: 1, x_name: 'P1', x_active: true }, { id: 2, x_name: 'P2', x_active: false }],
    units: [
      { id: 1, x_name: 'a', x_property_id: [1, 'P1'], x_cap_comercial: 2, x_cap_extra: 5, x_child_ids: [], x_active: true },
      { id: 6, x_name: 'TODA', x_property_id: [1, 'P1'], x_cap_comercial: 22, x_child_ids: [1], x_active: true },
      { id: 7, x_name: 'z', x_property_id: [2, 'P2'], x_cap_comercial: 4, x_child_ids: [], x_active: true },
    ],
  });
  assert.equal(cat.properties.length, 1);
  assert.deepEqual(cat.properties[0].units.map((u) => [u.unit_label, u.capacity, u.composite]), [['a', 2, false], ['TODA', 22, true]]);
});

test('evidencia: id anonimo, PII enmascarada, campos requeridos', async () => {
  assert.notEqual(anonymizeId('573001234567'), '573001234567');
  assert.equal(anonymizeId('x'), anonymizeId('x'));
  assert.equal(scrub('escribeme a juan@mail.com o al +57 300 123 4567'), 'escribeme a [EMAIL] o al [TEL]');
  const { agent, evidence } = makeAgent();
  await agent.handle('573001234567', ['Hola, soy Carlos, mi cel 3001234567 y mail a@b.co. Somos dos para mañana']);
  const rec = evidence.records[0];
  for (const k of ['conversation_id', 'classification', 'intent', 'entities', 'context_before', 'context_after', 'odoo_called', 'odoo_result_sanitized', 'response_proposed', 'escalation', 'escalation_reason', 'latency', 'test_id', 'pass_fail']) assert.ok(k in rec, `falta ${k}`);
  const dump = JSON.stringify(rec);
  assert.doesNotMatch(dump, /573001234567|3001234567|a@b\.co|Carlos/);
  assert.match(rec.conversation_id, /^conv_[0-9a-f]{12}$/);
  assert.equal(rec.odoo_called, true);
  assert.equal(typeof rec.latency, 'number');
});

test('mensajes duplicados (reintento de Meta) no generan segunda respuesta', async () => {
  const { agent, gateway } = makeAgent();
  assert.equal(agent.ingest('d1', { id: 'wamid.1', text: 'Somos dos para mañana', ts: 1 }).buffered, true);
  assert.equal(agent.ingest('d1', { id: 'wamid.1', text: 'Somos dos para mañana', ts: 1 }).duplicate, true);
  await agent.flush('d1');
  assert.equal(await agent.flush('d1'), null);
  assert.equal(gateway.calls.filter((c) => c.op === 'searchOptions').length, 1);
});

test('el agente no cita nunca una cifra de dinero que no venga del Gateway', async () => {
  const { agent } = makeAgent();
  const msgs = ['Hola, somos 2 del 20 al 22 de octubre', '¿Cuánto debo abonar?', 'Somos 3', '¿Cuánto cuesta?'];
  for (const m of msgs) {
    const r = await agent.handle('p1', [m]);
    const known = new Set([r.context.precio_cotizado, r.context.anticipo, r.context.saldo].filter(Boolean));
    for (const n of (r.text ?? '').matchAll(/\$([\d.]+)/g)) {
      const v = Number(n[1].replace(/\./g, ''));
      assert.ok(known.has(v) || r.text.includes('alternativa'), `cifra $${v} no trazable en: ${r.text}`);
    }
  }
});
