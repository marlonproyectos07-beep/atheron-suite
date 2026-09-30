#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-010 (preparacion), Gate 010-F — E2E conversacional REAL:
 * mensaje -> conversation-engine.mjs -> ai-tool-adapters.mjs -> Gateway ->
 * Odoo STAGING real (accion 1967, LIVE). Reemplaza los "tools" fake del
 * simulador por un wrapper delgado sobre el Gateway ya probado en
 * live-hotel-008a-runner.mjs -- misma identidad de patron, sin inventar
 * un cliente nuevo.
 *
 * SOLO usa operaciones ya aprobadas (availability/quote/hold/status).
 * Requiere las 5 variables ODOO_* (scripts/secure-store/load-odoo-secrets.ps1).
 *
 * Uso:
 *   PRUEBA_REINA_CHECK_IN=2027-02-10 PRUEBA_REINA_CHECK_OUT=2027-02-11 \
 *   node scripts/e2e-conversational-live.mjs
 */
import { randomUUID } from 'node:crypto';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { createConversation, advanceConversation } from '../src/conversation-engine.mjs';

const UNIT_ID_MAP = { 201: 1, 202: 2, 203: 3, 301: 4, 302: 5, CASA_COMPLETA: 6 };
const PROPERTY_ID = 1;

let config;
try {
  config = loadGuardedConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ overall: 'BLOCKED_CREDENTIALS', reason: error.message }, null, 2));
  process.exit(2);
}

const CHECK_IN = process.env.PRUEBA_REINA_CHECK_IN;
const CHECK_OUT = process.env.PRUEBA_REINA_CHECK_OUT;
if (!CHECK_IN || !CHECK_OUT) {
  console.error(JSON.stringify({ overall: 'MISSING_DATES' }, null, 2));
  process.exit(2);
}

const built = buildGatewayFromEnv({ ...process.env, DRY_RUN: 'false' });
const rawKey = randomUUID();
built.identityStore.register({ agentId: 'hotel010-e2e-live-local', actor: 'claude-code', rawKey });

async function call(operation, body) {
  const r = await built.gateway.handle({ operation, agentId: 'hotel010-e2e-live-local', rawKey, body });
  if (!r.envelope.ok) throw new Error(`GATEWAY_${r.envelope.error?.code ?? r.code ?? 'ERROR'}`);
  return r.envelope.data?.data ?? r.envelope.data;
}

const tools = {
  checkAvailability: async ({ unit, checkIn, checkOut, guests }) => {
    const data = await call('availability', { check_in: checkIn, check_out: checkOut, guests, property_id: PROPERTY_ID });
    const option = data?.opciones?.find((o) => o.unit_id === UNIT_ID_MAP[unit]);
    return option?.estado === 'disponible';
  },
  quote: async ({ unit, checkIn, checkOut, guests }) => {
    const data = await call('quote', {
      check_in: checkIn,
      check_out: checkOut,
      guests,
      property_id: PROPERTY_ID,
      idempotency_key: `e2e-live-quote-${unit}-${Date.now()}`,
    });
    const option = data?.opciones?.find((o) => o.unit_id === UNIT_ID_MAP[unit]);
    return {
      quote_id: data?.quote_id,
      total: option?.precio_total ?? null,
      requires_manual_confirmation: option?.requires_manual_confirmation ?? false,
    };
  },
  createHold: async ({ quoteId, unit }) => {
    const data = await call('hold', {
      quote_id: quoteId,
      unit_id: UNIT_ID_MAP[unit],
      idempotency_key: `e2e-live-hold-${unit}-${Date.now()}`,
    });
    return { hold_id: data?.hold_id };
  },
  status: async ({ operationId }) => call('status', { operation_id: operationId }),
};

const conversation = createConversation({ conversationId: `e2e-live-${Date.now()}`, correlationId: randomUUID(), channel: 'e2e_live' });
const events = [];
const onEvent = (e) => events.push({ type: e.type, ...Object.fromEntries(Object.entries(e).filter(([k]) => !['type', 'timestamp', 'conversation_id', 'correlation_id', 'channel'].includes(k))) });

let conv = conversation;
conv = await advanceConversation(conv, { checkIn: CHECK_IN, checkOut: CHECK_OUT, guests: 1 }, tools, onEvent);
console.log('Tras fechas+huespedes:', conv.state, JSON.stringify(conv.options));

if (conv.state === 'OPTIONS_PRESENTED' && conv.options.length > 0) {
  conv = await advanceConversation(conv, { selectUnit: conv.options[0].unit, requestBooking: true }, tools, onEvent);
  console.log('Tras seleccionar y reservar:', conv.state, JSON.stringify({ quote: conv.quote, hold: conv.hold }));
}

console.log(JSON.stringify({ overall: conv.state === 'HOLD_CREATED' ? 'PASS' : 'REVIEW', final_state: conv.state, events }, null, 2));
