#!/usr/bin/env node
// ATH-PMS-WA-063: demo local. Sin red, sin secretos, sin envio. Respuestas de Smoobu SINTETICAS con la forma real de WA-061.
import { handleInbound, composeDraft, HOTELS_PHONE_NUMBER_ID } from '../src/whatsapp-agent-shadow.mjs';
const today = '2026-11-07';
const ids = [3557506, 3557511, 3557516, 3557521, 3557526];
const ev = (messageId, text) => ({ direction: 'inbound', accountId: 7, phoneNumberId: HOTELS_PHONE_NUMBER_ID, messageId, from: '+573202859866', text });
const real = handleInbound({ event: ev('wamid.REAL056', 'PRUEBA ATH-056. Mensaje de verificación de recepción WhatsApp Atheron Hotels. No responder todavía.'), today });
const a = handleInbound({ event: ev('wamid.D001', 'Hola, buenas tardes. Quiero reservar para 1 persona'), today });
const b = handleInbound({ event: ev('wamid.D002', 'del 15 al 17 de noviembre'), today, previous: a.state });
const okResp = { availableApartments: ids, prices: {}, errorMessages: {} };
const capErr = Object.fromEntries(ids.map((id) => [id, { message: 'The number of guests exceeds the limit of the apartment' }]));
const two = handleInbound({ event: ev('wamid.D003', 'somos 2 personas del 15 al 17 de noviembre'), today });
console.log(JSON.stringify({
  scenario: 'SHADOW_OFFLINE', outboundMessages: 0, bookingWrites: 0, odooWrites: 0,
  realMessageATH056: { kind: real.kind, draft: real.draft },
  turn1: { kind: a.kind, missing: a.missing, draft: a.draft },
  turn2: { kind: b.kind, lookup: b.lookup },
  draft1Guest: composeDraft({ state: b.state, response: okResp }).draft,
  draft2Guests: composeDraft({ state: two.state, response: { availableApartments: [], prices: {}, errorMessages: capErr } }).draft,
}, null, 2));
