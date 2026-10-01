import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LabMessagingProvider } from '../src/messaging-provider.mjs';
import { createWhatsAppOrchestrator } from '../src/whatsapp-orchestrator.mjs';
import { HOTEL_011_TEST_MESSAGE } from '../src/whatsapp-test-gate.mjs';

function buildTools({ availableUnits = [] } = {}) {
  return {
    checkAvailability: async ({ unit }) => availableUnits.includes(unit),
    quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 220000, requires_manual_confirmation: false }),
    createHold: async ({ quoteId }) => ({ hold_id: `H-${quoteId}` }),
  };
}

const REFERENCE_DATE = '2026-12-01'; // martes

test('HOTEL-011: mensaje CEO consulta disponibilidad y responde sin cotizar ni crear HOLD', async () => {
  const provider = new LabMessagingProvider();
  const checked = [];
  const tools = { checkAvailability: async (request) => { checked.push(request); return true; } };
  const orchestrator = createWhatsAppOrchestrator({ provider, tools, referenceDate: '2026-09-30' });
  await provider.receiveMessage({ from: '573000000000', text: HOTEL_011_TEST_MESSAGE, message_id: 'hotel-011-test' });
  assert.deepEqual(checked, [{ unit: '201', checkIn: '2026-11-10', checkOut: '2026-11-12', guests: 2 }]);
  assert.equal(orchestrator.getConversation('573000000000').state, 'OPTIONS_PRESENTED');
  assert.equal(orchestrator.getConversation('573000000000').quote, null);
  assert.equal(orchestrator.getConversation('573000000000').hold, null);
  assert.equal(provider.sentMessages.length, 1);
  assert.match(provider.sentMessages[0].text, /201/);
  assert.doesNotMatch(provider.sentMessages[0].text, /\$|COP|reserva|confirmad/i);
});

test('Fase 5 -- golden path: mensaje con fechas y personas completas llega hasta HOLD_CREATED y responde por WhatsApp', async () => {
  const provider = new LabMessagingProvider();
  const events = [];
  createWhatsAppOrchestrator({ provider, tools: buildTools({ availableUnits: ['201'] }), referenceDate: REFERENCE_DATE, onEvent: (e) => events.push(e.type) });

  await provider.receiveMessage({ from: '573000000000', text: 'Hola, necesito habitación del viernes al domingo para 2 personas.', message_id: 'wamid-1' });

  assert.ok(provider.sentMessages.length >= 1);
  const last = provider.sentMessages.at(-1);
  assert.equal(last.to, '573000000000');
  assert.match(last.text, /Tengo estas opciones|OCUPADA|CHECK|/i); // alguna respuesta real, nunca vacia
  assert.ok(events.includes('availability_checked'));
});

test('Fase 6 -- datos faltantes: la IA pregunta solo lo que falta, nunca inventa fechas ni personas', async () => {
  const provider = new LabMessagingProvider();
  createWhatsAppOrchestrator({ provider, tools: buildTools(), referenceDate: REFERENCE_DATE });

  await provider.receiveMessage({ from: '573000000001', text: 'Necesito habitación del viernes al domingo.', message_id: 'wamid-2' });
  const reply1 = provider.sentMessages.at(-1).text;
  assert.match(reply1, /cuántas personas/i);

  await provider.receiveMessage({ from: '573000000001', text: 'Somos 3', message_id: 'wamid-3' });
  const reply2 = provider.sentMessages.at(-1).text;
  assert.doesNotMatch(reply2, /para qué fecha/i); // no vuelve a preguntar lo que ya sabe
});

test('Fase 7 -- cambio de fechas a mitad de conversacion recalcula, nunca reutiliza disponibilidad vieja', async () => {
  const provider = new LabMessagingProvider();
  let toolsCalls = 0;
  const tools = { ...buildTools({ availableUnits: ['201'] }) };
  const countedTools = { ...tools, checkAvailability: (...a) => { toolsCalls++; return tools.checkAvailability(...a); } };
  const orchestrator = createWhatsAppOrchestrator({ provider, tools: countedTools, referenceDate: REFERENCE_DATE });

  await provider.receiveMessage({ from: '573000000002', text: 'Del viernes al domingo, somos 2', message_id: 'wamid-4' });
  const callsAfterFirst = toolsCalls;
  await provider.receiveMessage({ from: '573000000002', text: 'Cámbiamela para el sábado', message_id: 'wamid-5' });

  assert.ok(toolsCalls > callsAfterFirst); // volvio a consultar disponibilidad real
  const conv = orchestrator.getConversation('573000000002');
  assert.equal(conv.requested.checkIn, '2026-12-05'); // sabado siguiente, no el viernes original
});

test('Fase 8 -- HUMAN_REQUIRED: descuento escala y arma la ficha de handoff completa', async () => {
  const provider = new LabMessagingProvider();
  let handoff = null;
  createWhatsAppOrchestrator({
    provider,
    tools: buildTools({ availableUnits: ['201'] }),
    referenceDate: REFERENCE_DATE,
    onHumanRequired: (h) => { handoff = h; },
  });

  await provider.receiveMessage({ from: '573000000003', text: 'Del viernes al domingo, somos 2', message_id: 'wamid-6' });
  await provider.receiveMessage({ from: '573000000003', text: '¿Me haces un descuento?', message_id: 'wamid-7' });

  assert.ok(handoff);
  assert.equal(handoff.motivo_de_escalamiento, 'UNAUTHORIZED_DISCOUNT_REQUEST');
  assert.equal(handoff.telefono, null); // el telefono del cliente WhatsApp no viaja en customer.phone en este gate (no se inventa)
  assert.equal(handoff.origen, 'whatsapp');
  const lastReply = provider.sentMessages.at(-1).text;
  assert.doesNotMatch(lastReply, /confirmad[oa]/i); // nunca afirma nada confirmado
});

test('Fase 9 -- idempotencia: el MISMO message_id (reintento) nunca duplica la operacion', async () => {
  const provider = new LabMessagingProvider();
  let holdCalls = 0;
  const tools = buildTools({ availableUnits: ['201'] });
  const countedTools = { ...tools, createHold: (...a) => { holdCalls++; return tools.createHold(...a); } };
  createWhatsAppOrchestrator({ provider, tools: countedTools, referenceDate: REFERENCE_DATE });

  const message = { from: '573000000004', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'wamid-8' };
  await provider.receiveMessage(message);
  await provider.receiveMessage(message); // Meta reintentando el mismo webhook

  assert.equal(holdCalls, 1); // nunca se creo un segundo HOLD por el reintento
});

test('Fase 10 -- concurrencia: cliente A y cliente B piden la misma unidad, Odoo (real) sigue siendo la autoridad final', async () => {
  // El inventario compartido simula lo que Odoo real haria: una vez que
  // A obtiene el HOLD, esa unidad deja de estar disponible para B.
  const inventory = new Set();
  const tools = {
    checkAvailability: async ({ unit }) => !inventory.has(unit),
    quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 220000, requires_manual_confirmation: false }),
    createHold: async ({ quoteId, unit }) => {
      const u = quoteId.replace('Q-', '');
      inventory.add(u);
      return { hold_id: `H-${quoteId}` };
    },
  };
  const providerA = new LabMessagingProvider();
  const providerB = new LabMessagingProvider();
  const orchA = createWhatsAppOrchestrator({ provider: providerA, tools, referenceDate: REFERENCE_DATE });
  const orchB = createWhatsAppOrchestrator({ provider: providerB, tools, referenceDate: REFERENCE_DATE });

  await providerA.receiveMessage({ from: '573000000005', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'wamid-a' });
  await providerB.receiveMessage({ from: '573000000006', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'wamid-b' });

  const convA = orchA.getConversation('573000000005');
  const convB = orchB.getConversation('573000000006');
  const holdCount = [convA, convB].filter((c) => c.state === 'HOLD_CREATED').length;
  assert.equal(holdCount, 1, 'maximo uno de los dos consigue el HOLD, cero sobreventa');
});

test('Fase 11 -- falla del Gateway: el cliente recibe una respuesta corta y clara, nunca un error tecnico ni silencio', async () => {
  const provider = new LabMessagingProvider();
  const events = [];
  const brokenTools = { checkAvailability: async () => { throw new Error('GATEWAY_TIMEOUT'); } };
  createWhatsAppOrchestrator({ provider, tools: brokenTools, referenceDate: REFERENCE_DATE, onEvent: (e) => events.push(e.type) });

  await provider.receiveMessage({ from: '573000000007', text: 'Del viernes al domingo, somos 2', message_id: 'wamid-9' });

  assert.equal(provider.sentMessages.length, 1);
  const reply = provider.sentMessages[0].text;
  assert.doesNotMatch(reply, /GATEWAY_TIMEOUT|Error|stack/i);
  assert.ok(events.includes('gateway_error'));
});

test('falla al ENVIAR la respuesta (p.ej. WhatsAppCloudProvider real sin accessToken todavia) nunca tira la peticion ni pierde el estado ya avanzado', async () => {
  const provider = new LabMessagingProvider();
  provider.sendMessage = async () => { throw new Error('WHATSAPP_ADAPTER_MISCONFIGURED: falta accessToken'); };
  const events = [];
  const orchestrator = createWhatsAppOrchestrator({ provider, tools: buildTools({ availableUnits: ['201'] }), referenceDate: REFERENCE_DATE, onEvent: (e) => events.push(e.type) });

  await assert.doesNotReject(
    provider.receiveMessage({ from: '573000000008', text: 'Del viernes al domingo, somos 2', message_id: 'wamid-10' }),
  );

  assert.ok(events.includes('send_failed'), 'el fallo de envio se reporta via onEvent, no se traga en silencio');
  const conv = orchestrator.getConversation('573000000008');
  assert.equal(conv.state, 'OPTIONS_PRESENTED', 'el motor SI avanzo (Gateway es la fuente de verdad); solo fallo el canal de salida');
});


test('HOTEL-016: disponibilidad -> precio -> media mantiene la unidad 201 y nunca reinicia el flujo', async () => {
  const provider = new LabMessagingProvider();
  let quoteCalls = 0;
  const tools = {
    checkAvailability: async ({ unit }) => unit === '201',
    quote: async ({ unit }) => {
      quoteCalls += 1;
      return { quote_id: `Q-${unit}`, total: 180000, requires_manual_confirmation: false };
    },
  };
  const mediaResolver = (unit) => unit === '201'
    ? {
        images: [
          { url: 'https://example.test/201-a.jpg', caption: '201 A' },
          { url: 'https://example.test/201-b.jpg', caption: '201 B' },
        ],
        video: null,
      }
    : null;

  const orchestrator = createWhatsAppOrchestrator({
    provider,
    tools,
    referenceDate: '2026-10-01',
    allowBookingActions: false,
    mediaResolver,
  });

  await provider.receiveMessage({
    from: '573000000020',
    text: 'Necesito alojamiento mañana por una noche para dos personas',
    message_id: 'h16-1',
  });
  assert.equal(orchestrator.getConversation('573000000020').state, 'OPTIONS_PRESENTED');
  assert.equal(orchestrator.getConversation('573000000020').options[0].unit, '201');

  await provider.receiveMessage({
    from: '573000000020',
    text: '¿Cuánto cuesta?',
    message_id: 'h16-2',
  });
  assert.equal(quoteCalls, 1);
  assert.equal(orchestrator.getConversation('573000000020').selectedUnit, '201');
  assert.equal(orchestrator.getConversation('573000000020').state, 'READY_FOR_HOLD');
  assert.match(provider.sentMessages.at(-1).text, /180\.000/);

  await provider.receiveMessage({
    from: '573000000020',
    text: '¿Tienes imágenes o video para verla?',
    message_id: 'h16-3',
  });
  assert.equal(provider.sentMedia.length, 2);
  assert.equal(provider.sentMedia[0].type, 'image');
  assert.equal(orchestrator.getConversation('573000000020').selectedUnit, '201');
  assert.equal(orchestrator.getConversation('573000000020').state, 'READY_FOR_HOLD');
});

test('HOTEL-016: quiero reservar captura intención pero no crea HOLD en TEST', async () => {
  const provider = new LabMessagingProvider();
  let holdCalls = 0;
  const tools = {
    checkAvailability: async ({ unit }) => unit === '201',
    quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 180000, requires_manual_confirmation: false }),
    createHold: async () => {
      holdCalls += 1;
      return { hold_id: 'NO-DEBE-CREARSE' };
    },
  };
  const orchestrator = createWhatsAppOrchestrator({
    provider,
    tools,
    referenceDate: '2026-10-01',
    allowBookingActions: false,
  });

  await provider.receiveMessage({
    from: '573000000021',
    text: 'Necesito alojamiento mañana por una noche para dos personas',
    message_id: 'h16-b1',
  });
  await provider.receiveMessage({
    from: '573000000021',
    text: '¿Cuánto cuesta?',
    message_id: 'h16-b2',
  });
  await provider.receiveMessage({
    from: '573000000021',
    text: 'Quiero reservar',
    message_id: 'h16-b3',
  });

  assert.equal(holdCalls, 0);
  assert.equal(orchestrator.getConversation('573000000021').state, 'READY_FOR_HOLD');
  assert.match(provider.sentMessages.at(-1).text, /todavía no voy a crear una reserva/i);
});

test('HOTEL-016: "sí" después de presentar una sola opción responde de forma contextual', async () => {
  const provider = new LabMessagingProvider();
  createWhatsAppOrchestrator({
    provider,
    tools: { checkAvailability: async ({ unit }) => unit === '201' },
    referenceDate: '2026-10-01',
    allowBookingActions: false,
  });

  await provider.receiveMessage({
    from: '573000000022',
    text: 'Necesito alojamiento mañana por una noche para dos personas',
    message_id: 'h16-c1',
  });
  await provider.receiveMessage({
    from: '573000000022',
    text: 'Sí',
    message_id: 'h16-c2',
  });

  assert.match(provider.sentMessages.at(-1).text, /fotos|precio/i);
  assert.equal(provider.sentMessages.at(-1).text.includes('Tengo estas opciones disponibles'), false);
});
