import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInbound, composeDraft, normalizeSpanishDates, validateInboundEvent, HOTELS_PHONE_NUMBER_ID } from '../src/whatsapp-agent-shadow.mjs';

const today = '2026-11-07';
const ev = (text, o = {}) => ({ direction: 'inbound', accountId: 7, phoneNumberId: HOTELS_PHONE_NUMBER_ID, messageId: 'wamid.T' + Math.random().toString(36).slice(2, 8), from: '+573202859866', text, ...o });
const ids = [3557506, 3557511, 3557516, 3557521, 3557526];

test('excluye otras cuentas, otros numeros y mensajes salientes', () => {
  assert.equal(handleInbound({ event: ev('hola', { accountId: 6 }), today }).code, 'NOT_HOTELS_ACCOUNT');
  assert.equal(handleInbound({ event: ev('hola', { accountId: 3 }), today }).code, 'NOT_HOTELS_ACCOUNT');
  assert.equal(handleInbound({ event: ev('hola', { phoneNumberId: '999' }), today }).code, 'NOT_HOTELS_PHONE');
  assert.equal(handleInbound({ event: ev('hola', { direction: 'outbound' }), today }).code, 'NOT_INBOUND');
  assert.equal(validateInboundEvent(ev('x', { from: 'abc' })).code, 'INVALID_SENDER');
});

test('fechas en espanol se convierten a ISO con proxima ocurrencia futura', () => {
  assert.match(normalizeSpanishDates('Del 15 al 17 de noviembre', today), /2026-11-15 2026-11-17/);
  assert.match(normalizeSpanishDates('quiero el 2 de enero', today), /2027-01-02/);
  assert.match(normalizeSpanishDates('31 de febrero', today), /fecha-invalida/);
});

test('el mensaje real de prueba (sin fechas) pide datos y no envia', () => {
  const r = handleInbound({ event: ev('PRUEBA ATH-056. Mensaje de verificación de recepción WhatsApp Atheron Hotels. No responder todavía.'), today });
  assert.equal(r.kind, 'needs_details');
  assert.equal(r.sendEnabled, false);
  assert.match(r.draft, /llegada/);
});

test('mantiene contexto entre mensajes y deduplica por messageId', () => {
  const a = handleInbound({ event: ev('Hola, somos 2 personas', { messageId: 'wamid.A001' }), today });
  const b = handleInbound({ event: ev('del 15 al 17 de noviembre', { messageId: 'wamid.A002' }), today, previous: a.state });
  assert.equal(b.kind, 'lookup_required');
  assert.deepEqual(b.lookup.apartmentIds, ids);
  assert.equal(b.lookup.guests, 2);
  const dup = handleInbound({ event: ev('del 15 al 17 de noviembre', { messageId: 'wamid.A002' }), today, previous: b.state });
  assert.equal(dup.kind, 'duplicate');
});

test('solicitudes ambiguas o fuera de alcance se derivan a recepcion', () => {
  assert.equal(handleInbound({ event: ev('quiero la casa completa del 2026-11-15 al 2026-11-17 para 4 personas'), today }).kind, 'handoff');
  assert.equal(handleInbound({ event: ev('el 31 de febrero para 1 persona 2 noches'), today }).kind, 'needs_details'); // fecha imposible: vuelve a pedir llegada
  assert.equal(handleInbound({ event: ev('del 2026-11-15 al 2026-11-17 para 2 personas, somos tres personas'), today }).kind, 'handoff');
});

test('capacidad 1 huesped de Smoobu: con 2 personas deriva a humano sin inventar', () => {
  const err = {}; for (const id of ids) err[id] = { message: 'The number of guests exceeds the limit of the apartment' };
  const d = composeDraft({ state: { arrival: '2026-11-15', departure: '2026-11-17', guests: 2 }, response: { availableApartments: [], prices: {}, errorMessages: err } });
  assert.equal(d.kind, 'handoff');
  assert.equal(d.reason, 'GUEST_CAPACITY_UNVERIFIED');
  assert.equal(d.sendEnabled, false);
});

test('disponible sin precio: no cotiza y nunca usa 0', () => {
  const d = composeDraft({ state: { arrival: '2026-11-15', departure: '2026-11-16', guests: 1 }, response: { availableApartments: ids, prices: {}, errorMessages: {} } });
  assert.equal(d.kind, 'draft_without_price');
  assert.match(d.draft, /recepción/);
  assert.doesNotMatch(d.draft, /\b0\b.*COP|COP/);
  assert.match(d.draft, /15:00/); assert.match(d.draft, /11:00/); assert.match(d.draft, /no es una reserva confirmada/i);
});

test('precio verificado en COP aparece solo como borrador sujeto a aprobacion', () => {
  const d = composeDraft({ state: { arrival: '2026-11-15', departure: '2026-11-16', guests: 1 }, response: { availableApartments: [3557506], prices: { 3557506: { price: 120000, currency: 'COP' } }, errorMessages: { 3557511: { message: 'UNAVAILABLE' } } } });
  assert.equal(d.kind, 'draft_with_price');
  assert.match(d.draft, /Habitación 201: 120000 COP/);
  assert.equal(d.sendEnabled, false); assert.equal(d.needsHuman, true);
});

test('sin disponibilidad verificada ofrece alternativas via asesor', () => {
  const err = {}; for (const id of ids) err[id] = { message: 'Not available' };
  const d = composeDraft({ state: { arrival: '2026-11-15', departure: '2026-11-16', guests: 1 }, response: { availableApartments: [], prices: {}, errorMessages: err } });
  assert.equal(d.kind, 'no_availability');
});

test('todas las salidas mantienen envio, reserva, Odoo y pago deshabilitados', () => {
  const outs = [handleInbound({ event: ev('hola'), today }), composeDraft({ state: { arrival: '2026-11-15', departure: '2026-11-16', guests: 1 }, response: { availableApartments: ids, prices: {}, errorMessages: {} } })];
  for (const o of outs) assert.deepEqual([o.sendEnabled, o.bookingEnabled, o.odooWriteEnabled, o.paymentEnabled], [false, false, false, false]);
});
