#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-011, Fase 14 -- E2E completo, SIN WhatsApp real todavia:
 * LabMessagingProvider (mensaje de texto tal cual lo escribiria un
 * cliente real) -> whatsapp-orchestrator.mjs -> nlu-lite.mjs ->
 * conversation-engine.mjs -> ai-tool-adapters.mjs -> Gateway LIVE real
 * -> Odoo STAGING real.
 *
 * Requiere las 5 variables ODOO_* (scripts/secure-store/load-odoo-secrets.ps1).
 */
import { randomUUID } from 'node:crypto';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { LabMessagingProvider } from '../src/messaging-provider.mjs';
import { createWhatsAppOrchestrator } from '../src/whatsapp-orchestrator.mjs';

const UNIT_ID_MAP = { 201: 1, 202: 2, 203: 3, 301: 4, 302: 5, CASA_COMPLETA: 6 };
const PROPERTY_ID = 1;

const config = loadGuardedConfig(process.env);
const built = buildGatewayFromEnv({ ...process.env, DRY_RUN: 'false' });
const rawKey = randomUUID();
built.identityStore.register({ agentId: 'hotel011-e2e-whatsapp-local', actor: 'claude-code', rawKey });

async function call(operation, body) {
  const r = await built.gateway.handle({ operation, agentId: 'hotel011-e2e-whatsapp-local', rawKey, body });
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
    const data = await call('quote', { check_in: checkIn, check_out: checkOut, guests, property_id: PROPERTY_ID, idempotency_key: `e2e-wa-${unit}-${Date.now()}` });
    const option = data?.opciones?.find((o) => o.unit_id === UNIT_ID_MAP[unit]);
    return { quote_id: data?.quote_id, total: option?.precio_total ?? null, requires_manual_confirmation: option?.requires_manual_confirmation ?? false };
  },
  createHold: async ({ quoteId, unit }) => {
    const data = await call('hold', { quote_id: quoteId, unit_id: UNIT_ID_MAP[unit], idempotency_key: `e2e-wa-hold-${unit}-${Date.now()}` });
    return { hold_id: data?.hold_id };
  },
};

const provider = new LabMessagingProvider();
const events = [];
const orchestrator = createWhatsAppOrchestrator({
  provider,
  tools,
  referenceDate: new Date().toISOString().slice(0, 10),
  onEvent: (e) => events.push({ type: e.type, unit: e.unit, hold_id: e.hold_id, quote_id: e.quote_id }),
});

const CHECK_IN = process.env.PRUEBA_REINA_CHECK_IN;
const CHECK_OUT = process.env.PRUEBA_REINA_CHECK_OUT;
if (!CHECK_IN || !CHECK_OUT) {
  console.error(JSON.stringify({ overall: 'MISSING_DATES' }, null, 2));
  process.exit(2);
}

const phone = '573000000000';
// Mensaje EXACTO del "golden path" pedido en el mandato (Fase 5/17).
await provider.receiveMessage({ from: phone, text: `Hola, necesito habitación del ${CHECK_IN} al ${CHECK_OUT} para 2 personas.`, message_id: `wamid-e2e-${Date.now()}` });

let conv = orchestrator.getConversation(phone);
if (conv.state === 'OPTIONS_PRESENTED' && conv.options.length > 0) {
  const unit = conv.options[0].unit;
  await provider.receiveMessage({ from: phone, text: `Quiero reservar la ${unit}.`, message_id: `wamid-e2e-select-${Date.now()}` });
  conv = orchestrator.getConversation(phone);
}

console.log(JSON.stringify({
  overall: conv.state === 'HOLD_CREATED' ? 'PASS' : 'REVIEW',
  final_state: conv.state,
  unit: conv.selectedUnit,
  quote_total: conv.quote?.total ?? null,
  hold_id: conv.hold?.hold_id ?? null,
  events,
  whatsapp_replies: provider.sentMessages.map((m) => m.text),
}, null, 2));
