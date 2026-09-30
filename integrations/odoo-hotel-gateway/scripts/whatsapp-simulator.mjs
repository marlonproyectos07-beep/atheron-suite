#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-010 (preparacion), Frente L / Gate 010-E - simulador de
 * conversacion SIN WhatsApp real, expandido a los 25 escenarios pedidos
 * por el CEO. Corre conversation-engine.mjs (y, para los primeros casos,
 * tambien nlu-lite.mjs) con herramientas falsas deterministas -- sin
 * red, sin Odoo real, sin WhatsApp/Meta.
 *
 * Uso: node scripts/whatsapp-simulator.mjs
 */

import { createConversation, advanceConversation } from '../src/conversation-engine.mjs';
import { parseMessage, toEngineInput } from '../src/nlu-lite.mjs';

function buildTools({ availableUnits = [], requiresManualConfirmation = false, failMode = null } = {}) {
  return {
    checkAvailability: async ({ unit }) => {
      if (failMode === 'timeout') throw new Error('GATEWAY_TIMEOUT');
      if (failMode === 'malformed') return undefined; // fail-closed: se trata como no disponible
      return availableUnits.includes(unit);
    },
    quote: async ({ unit }) => {
      if (failMode === 'odoo_error') throw new Error('ODOO_ERROR:INSUFFICIENT_CAPACITY');
      return { quote_id: `Q-${unit}`, total: 180000, requires_manual_confirmation: requiresManualConfirmation };
    },
    createHold: async ({ quoteId }) => ({ hold_id: `H-${quoteId}` }),
  };
}

const REFERENCE_DATE = '2026-12-01';

async function runFromText(text, tools) {
  const conv = createConversation({ conversationId: `sim-${text}`, correlationId: `corr-${text}`, channel: 'whatsapp_sim' });
  const slots = parseMessage(text, { referenceDate: REFERENCE_DATE });
  return advanceConversation(conv, toEngineInput(slots), tools);
}

const CASES = [
  { name: '1. Pareja (2 personas), fechas especificas', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 2 }, buildTools({ availableUnits: ['201'] })), expect: 'OPTIONS_PRESENTED' },
  { name: '2. Familia (4 personas)', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 4 }, buildTools({ availableUnits: ['202'] })), expect: 'OPTIONS_PRESENTED' },
  { name: '3. Grupo (10 personas, requiere Casa Completa)', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 10 }, buildTools({ availableUnits: ['CASA_COMPLETA'] })), expect: 'OPTIONS_PRESENTED' },
  { name: '4. Fechas incompletas', run: () => run({ checkIn: '2026-12-10' }, buildTools()), expect: 'COLLECTING_DATES' },
  { name: '5. Fecha invalida (checkout <= checkin)', run: () => run({ checkIn: '2026-12-11', checkOut: '2026-12-10' }, buildTools()), expect: 'COLLECTING_DATES' },
  {
    name: '6. Cambio de fecha a mitad de conversacion',
    run: async () => {
      let c = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, buildTools({ availableUnits: ['201'] }));
      return advanceConversation(c, { checkIn: '2026-12-20', checkOut: '2026-12-21' }, buildTools({ availableUnits: ['203'] }));
    },
    expect: 'OPTIONS_PRESENTED',
  },
  {
    name: '7. Cambio de huespedes a mitad de conversacion',
    run: async () => {
      let c = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, buildTools({ availableUnits: ['201'] }));
      return advanceConversation(c, { guests: 10 }, buildTools({ availableUnits: ['CASA_COMPLETA'] }));
    },
    expect: 'OPTIONS_PRESENTED',
  },
  { name: '8. Sin disponibilidad', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, buildTools({ availableUnits: [] })), expect: 'OPTIONS_PRESENTED' },
  { name: '9. Varias alternativas', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, buildTools({ availableUnits: ['202', '203'] })), expect: 'OPTIONS_PRESENTED' },
  { name: '10. Una alternativa', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, buildTools({ availableUnits: ['203'] })), expect: 'OPTIONS_PRESENTED' },
  { name: '11. Pregunta de precio (via NLU)', run: () => runFromText('¿Cuánto vale?', buildTools({ availableUnits: ['201'] })).then(async (c) => advanceConversation(c, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, buildTools({ availableUnits: ['201'] }))), expect: 'READY_FOR_HOLD' },
  { name: '12. Descuento', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestDiscount: true }, buildTools()), expect: 'HUMAN_REQUIRED' },
  { name: '13. Quiere reservar', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, buildTools({ availableUnits: ['201'] })), expect: 'HOLD_CREATED' },
  { name: '14. HOLD creado y consultado de nuevo (idempotente)', run: async () => { const c = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, buildTools({ availableUnits: ['201'] })); return advanceConversation(c, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, buildTools({ availableUnits: ['201'] })); }, expect: 'HOLD_CREATED' },
  { name: '15. HOLD expirado', run: async () => { const c = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, buildTools({ availableUnits: ['201'] })); return advanceConversation(c, { holdExpired: true }, buildTools()); }, expect: 'EXPIRED' },
  { name: '16. Duplicado (mismo requestBooking dos veces, mismo hold)', run: async () => { const tools = buildTools({ availableUnits: ['201'] }); const c1 = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools); const c2 = await advanceConversation(c1, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools); return c1.hold.hold_id === c2.hold.hold_id ? c2 : { state: 'FAILED_DUPLICATE_HOLD' }; }, expect: 'HOLD_CREATED' },
  { name: '17. Mensaje repetido en OPTIONS_PRESENTED (no repite availability_checked)', run: async () => { const tools = buildTools({ availableUnits: ['201'] }); const c1 = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools); const events = []; const c2 = await advanceConversation(c1, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools, (e) => events.push(e.type)); return events.length === 0 ? c2 : { state: 'FAILED_REPEATED_CHECK' }; }, expect: 'OPTIONS_PRESENTED' },
  { name: '18. Gateway timeout (nunca inventa un resultado, propaga el error)', run: async () => { try { await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, buildTools({ failMode: 'timeout' })); return { state: 'FAILED_SHOULD_HAVE_THROWN' }; } catch { return { state: 'PROPAGATED_ERROR' }; } }, expect: 'PROPAGATED_ERROR' },
  { name: '19. Odoo error en quote (nunca inventa una cotizacion)', run: async () => { try { await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, buildTools({ availableUnits: ['201'], failMode: 'odoo_error' })); return { state: 'FAILED_SHOULD_HAVE_THROWN' }; } catch { return { state: 'PROPAGATED_ERROR' }; } }, expect: 'PROPAGATED_ERROR' },
  { name: '20. Respuesta malformada de disponibilidad (fail-closed: se trata como no disponible)', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, buildTools({ failMode: 'malformed' })), expect: 'OPTIONS_PRESENTED' },
  { name: '21. Grupo superior a la capacidad de todo (escala, no inventa unidad)', run: () => run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 25 }, buildTools()), expect: 'HUMAN_REQUIRED' },
  { name: '22. Cancelacion (siempre humano, impacto economico)', run: async () => { const tools = buildTools({ availableUnits: ['201'] }); const c = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools); return advanceConversation(c, { requestCancellation: true }, tools); }, expect: 'HUMAN_REQUIRED' },
  { name: '23. Reclamacion', run: () => run({ sensitiveReason: 'COMPLAINT' }, buildTools()), expect: 'HUMAN_REQUIRED' },
  { name: '24. Humano solicitado explicitamente (via NLU)', run: () => runFromText('Necesito hablar con alguien', buildTools()), expect: 'HUMAN_REQUIRED' },
  {
    name: '25. Conversacion abandonada y reanudada (el estado persiste)',
    run: async () => {
      const c1 = await run({ checkIn: '2026-12-10', checkOut: '2026-12-11' }, buildTools());
      // "abandono": no llega ningun mensaje mas por un tiempo -- el estado
      // simplemente se queda quieto, no hay temporizador que lo mueva solo.
      // "reanuda": llega el dato que faltaba, como si nada hubiera pasado.
      return advanceConversation(c1, { guests: 1 }, buildTools({ availableUnits: ['201'] }));
    },
    expect: 'OPTIONS_PRESENTED',
  },
];

function run(input, tools) {
  const conv = createConversation({ conversationId: `sim-${Math.random()}`, correlationId: `corr-${Math.random()}`, channel: 'whatsapp_sim' });
  return advanceConversation(conv, input, tools);
}

async function main() {
  const results = [];
  for (const testCase of CASES) {
    const conv = await testCase.run();
    const pass = conv.state === testCase.expect;
    results.push({ case: testCase.name, expected: testCase.expect, actual: conv.state, pass });
  }
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.case}  (esperado=${r.expected} real=${r.actual})`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} casos PASS.`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
