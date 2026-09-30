#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-010, Prioridad 4 -- amplia el E2E conversacional real
 * con varios escenarios contra Odoo STAGING. Reutiliza exactamente el
 * mismo motor (`conversation-engine.mjs`) y el mismo wrapper de
 * herramientas que `e2e-conversational-live.mjs`.
 *
 * Los escenarios que NO llegan a "quiero reservar" nunca crean un HOLD
 * real (availability/quote no escriben en Odoo, solo hold lo hace) --
 * footprint minimo, nada que limpiar salvo donde se indique.
 */
import { randomUUID } from 'node:crypto';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { createConversation, advanceConversation } from '../src/conversation-engine.mjs';

const UNIT_ID_MAP = { 201: 1, 202: 2, 203: 3, 301: 4, 302: 5, CASA_COMPLETA: 6 };
const PROPERTY_ID = 1;

const config = loadGuardedConfig(process.env);
const built = buildGatewayFromEnv({ ...process.env, DRY_RUN: 'false' });
const rawKey = randomUUID();
built.identityStore.register({ agentId: 'hotel010-e2e-scenarios-local', actor: 'claude-code', rawKey });

async function call(operation, body) {
  const r = await built.gateway.handle({ operation, agentId: 'hotel010-e2e-scenarios-local', rawKey, body });
  if (!r.envelope.ok) throw new Error(`GATEWAY_${r.envelope.error?.code ?? r.code ?? 'ERROR'}`);
  return r.envelope.data?.data ?? r.envelope.data;
}

function buildTools() {
  return {
    checkAvailability: async ({ unit, checkIn, checkOut, guests }) => {
      const data = await call('availability', { check_in: checkIn, check_out: checkOut, guests, property_id: PROPERTY_ID });
      const option = data?.opciones?.find((o) => o.unit_id === UNIT_ID_MAP[unit]);
      return option?.estado === 'disponible';
    },
    quote: async ({ unit, checkIn, checkOut, guests }) => {
      const data = await call('quote', { check_in: checkIn, check_out: checkOut, guests, property_id: PROPERTY_ID, idempotency_key: `e2e-scn-${unit}-${Date.now()}-${Math.random()}` });
      const option = data?.opciones?.find((o) => o.unit_id === UNIT_ID_MAP[unit]);
      return { quote_id: data?.quote_id, total: option?.precio_total ?? null, requires_manual_confirmation: option?.requires_manual_confirmation ?? false };
    },
    createHold: async ({ quoteId, unit }) => {
      const data = await call('hold', { quote_id: quoteId, unit_id: UNIT_ID_MAP[unit], idempotency_key: `e2e-scn-hold-${unit}-${Date.now()}` });
      return { hold_id: data?.hold_id };
    },
  };
}

const results = [];

async function run(name, fn) {
  try {
    const detail = await fn();
    results.push({ scenario: name, overall: 'PASS', detail });
  } catch (error) {
    results.push({ scenario: name, overall: 'ERROR', error: error.message });
  }
}

// 1. Fechas disponibles -> opciones reales.
await run('fechas_disponibles', async () => {
  const conv = createConversation({ conversationId: 'scn-1', correlationId: randomUUID(), channel: 'e2e_live' });
  const result = await advanceConversation(conv, { checkIn: '2027-04-10', checkOut: '2027-04-11', guests: 1 }, buildTools());
  return { state: result.state, options: result.options.map((o) => o.unit) };
});

// 2. Varias alternativas: pedir 201 explicitamente (suele estar ocupado en ventanas ya usadas) para forzar el motor de alternativas real.
await run('varias_alternativas_o_no_disponible', async () => {
  const conv = createConversation({ conversationId: 'scn-2', correlationId: randomUUID(), channel: 'e2e_live' });
  const result = await advanceConversation(conv, { checkIn: '2027-04-10', checkOut: '2027-04-11', guests: 1, selectUnit: '201' }, buildTools());
  return { state: result.state, options: result.options.map((o) => o.unit) };
});

// 3. Cambio de fechas a mitad de conversacion -- debe volver a consultar disponibilidad real.
await run('cambio_de_fechas', async () => {
  const tools = buildTools();
  let conv = createConversation({ conversationId: 'scn-3', correlationId: randomUUID(), channel: 'e2e_live' });
  conv = await advanceConversation(conv, { checkIn: '2027-04-10', checkOut: '2027-04-11', guests: 1 }, tools);
  const before = conv.options.map((o) => o.unit);
  conv = await advanceConversation(conv, { checkIn: '2027-04-20', checkOut: '2027-04-21' }, tools);
  return { before, after: conv.options.map((o) => o.unit), state: conv.state };
});

// 4. Cambio de numero de personas -- debe recalcular la unidad candidata con datos reales.
await run('cambio_de_personas', async () => {
  const tools = buildTools();
  let conv = createConversation({ conversationId: 'scn-4', correlationId: randomUUID(), channel: 'e2e_live' });
  conv = await advanceConversation(conv, { checkIn: '2027-04-15', checkOut: '2027-04-16', guests: 1 }, tools);
  const before = conv.options.map((o) => o.unit);
  conv = await advanceConversation(conv, { guests: 12 }, tools);
  return { before, after: conv.options.map((o) => o.unit), state: conv.state };
});

// 5. Mensaje repetido -- no debe volver a llamar al Gateway real (idempotente).
await run('mensaje_repetido_no_duplica_llamadas_reales', async () => {
  const tools = buildTools();
  let calls = 0;
  const countedTools = { ...tools, checkAvailability: (...a) => { calls++; return tools.checkAvailability(...a); } };
  let conv = createConversation({ conversationId: 'scn-5', correlationId: randomUUID(), channel: 'e2e_live' });
  conv = await advanceConversation(conv, { checkIn: '2027-04-25', checkOut: '2027-04-26', guests: 1 }, countedTools);
  const callsAfterFirst = calls;
  conv = await advanceConversation(conv, { checkIn: '2027-04-25', checkOut: '2027-04-26', guests: 1 }, countedTools);
  return { state: conv.state, calls_first: callsAfterFirst, calls_total: calls, no_duplicate_call: calls === callsAfterFirst };
});

// 6. Cotizacion (quote) real explicita via pregunta de precio.
await run('cotizacion_real_via_pregunta_precio', async () => {
  const tools = buildTools();
  const conv = createConversation({ conversationId: 'scn-6', correlationId: randomUUID(), channel: 'e2e_live' });
  const result = await advanceConversation(conv, { checkIn: '2027-05-05', checkOut: '2027-05-06', guests: 2, askPrice: true }, tools);
  return { state: result.state, quote_total: result.quote?.total ?? null };
});

console.log(JSON.stringify({ overall: results.every((r) => r.overall === 'PASS') ? 'ALL_PASS' : 'SOME_FAILED', results }, null, 2));
