#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-010 (preparacion), Frente L - simulador de conversacion
 * SIN WhatsApp real. Corre los 10 casos de conversacion pedidos por el
 * CEO contra conversation-engine.mjs con herramientas falsas
 * (deterministas, sin red, sin Odoo real), para poder probar la logica
 * conversacional antes de conectar Meta.
 *
 * Uso: node scripts/whatsapp-simulator.mjs
 */

import { createConversation, advanceConversation } from '../src/conversation-engine.mjs';

function buildTools({ availableUnits = [], requiresManualConfirmation = false } = {}) {
  return {
    checkAvailability: async ({ unit }) => availableUnits.includes(unit),
    quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 180000, requires_manual_confirmation: requiresManualConfirmation }),
    createHold: async ({ quoteId }) => ({ hold_id: `H-${quoteId}` }),
  };
}

const CASES = [
  {
    name: '1. Solicitud vaga',
    turns: [{ input: {}, tools: buildTools() }],
    expectState: 'COLLECTING_DATES',
  },
  {
    name: '2. Grupo de 6, fechas especificas',
    turns: [{ input: { checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 6 }, tools: buildTools({ availableUnits: ['CASA_COMPLETA'] }) }],
    expectState: 'OPTIONS_PRESENTED',
  },
  {
    name: '3. Pregunta de precio (usa quote real)',
    turns: [{ input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, tools: buildTools({ availableUnits: ['201'] }) }],
    expectState: 'READY_FOR_HOLD',
  },
  {
    name: '4. Pide descuento',
    turns: [{ input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestDiscount: true }, tools: buildTools() }],
    expectState: 'HUMAN_REQUIRED',
  },
  {
    name: '5. "Quiero reservar"',
    turns: [{ input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools: buildTools({ availableUnits: ['201'] }) }],
    expectState: 'HOLD_CREATED',
  },
  {
    name: '6. Pide alternativas (unidad no disponible)',
    turns: [{ input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, tools: buildTools({ availableUnits: ['202', '203'] }) }],
    expectState: 'OPTIONS_PRESENTED',
  },
  {
    name: '7. Cambio de fechas a mitad de conversacion',
    turns: [
      { input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools: buildTools({ availableUnits: ['201'] }) },
      { input: { checkIn: '2026-12-20', checkOut: '2026-12-21' }, tools: buildTools({ availableUnits: ['203'] }) },
    ],
    expectState: 'OPTIONS_PRESENTED',
  },
  {
    name: '8. Cambio de numero de huespedes',
    turns: [
      { input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools: buildTools({ availableUnits: ['201'] }) },
      { input: { guests: 10 }, tools: buildTools({ availableUnits: ['CASA_COMPLETA'] }) },
    ],
    expectState: 'OPTIONS_PRESENTED',
  },
  {
    name: '9. Grupo grande (excede capacidad de todo)',
    turns: [{ input: { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 25 }, tools: buildTools() }],
    expectState: 'HUMAN_REQUIRED',
  },
  {
    name: '10. Reembolso/queja/excepcion',
    turns: [{ input: { sensitiveReason: 'COMPLAINT' }, tools: buildTools() }],
    expectState: 'HUMAN_REQUIRED',
  },
];

async function run() {
  let conv = null;
  const results = [];
  for (const testCase of CASES) {
    conv = createConversation({ conversationId: `sim-${testCase.name}`, correlationId: `corr-${testCase.name}`, channel: 'whatsapp_sim' });
    const events = [];
    for (const turn of testCase.turns) {
      conv = await advanceConversation(conv, turn.input, turn.tools, (e) => events.push(e.type));
    }
    const pass = conv.state === testCase.expectState;
    results.push({ case: testCase.name, expected: testCase.expectState, actual: conv.state, pass, events });
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.case}  (esperado=${r.expected} real=${r.actual})  eventos=[${r.events.join(',')}]`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} casos PASS.`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
