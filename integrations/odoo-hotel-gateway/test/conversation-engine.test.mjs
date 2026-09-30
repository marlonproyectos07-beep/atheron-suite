import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, advanceConversation, resumeFromHuman } from '../src/conversation-engine.mjs';

function buildTools({ availableUnits = [], requiresManualConfirmation = false, quoteTotal = 100000 } = {}) {
  return {
    checkAvailability: async ({ unit }) => availableUnits.includes(unit),
    quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: quoteTotal, requires_manual_confirmation: requiresManualConfirmation }),
    createHold: async ({ quoteId }) => ({ hold_id: `H-${quoteId}` }),
  };
}

function newConversation() {
  return createConversation({ conversationId: 'conv-1', correlationId: 'corr-1', channel: 'whatsapp_sim', customer: { phone: '3000000000' } });
}

test('Caso 1: solicitud vaga sin fechas ni huespedes pide fechas primero', async () => {
  const conv = await advanceConversation(newConversation(), {}, buildTools());
  assert.equal(conv.state, 'COLLECTING_DATES');
});

test('Caso 1b: con fechas pero sin huespedes, pide huespedes', async () => {
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-12' }, buildTools());
  assert.equal(conv.state, 'COLLECTING_GUESTS');
});

test('Caso 2: 6 personas fechas especificas -> escoge CASA_COMPLETA (unica con capacidad) y presenta opcion', async () => {
  const tools = buildTools({ availableUnits: ['CASA_COMPLETA'] });
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 6 }, tools);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(conv.options.map((o) => o.unit), ['CASA_COMPLETA']);
});

test('Caso 3: pregunta de precio usa quote real, nunca calcula un precio propio', async () => {
  const tools = buildTools({ availableUnits: ['201'], quoteTotal: 220000 });
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, tools);
  assert.equal(conv.state, 'READY_FOR_HOLD');
  assert.equal(conv.quote.total, 220000); // viene de tools.quote, no de un calculo local
});

test('Caso 4: peticion de descuento siempre escala a humano (no existe regla autorizada)', async () => {
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestDiscount: true }, buildTools());
  assert.equal(conv.state, 'HUMAN_REQUIRED');
  assert.equal(conv.handoffReason, 'UNAUTHORIZED_DISCOUNT_REQUEST');
});

test('Caso 5: "quiero reservar" avanza hasta HOLD_CREATED cuando hay disponibilidad y cotizacion, sin saltarse pasos', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools);
  assert.equal(conv.state, 'HOLD_CREATED');
  assert.ok(conv.hold.hold_id.startsWith('H-Q-201'));
});

test('Caso 5b: "quiero reservar" sin huespedes definidos no confirma nada -- se queda pidiendo el dato', async () => {
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', requestBooking: true }, buildTools());
  assert.equal(conv.state, 'COLLECTING_GUESTS');
  assert.equal(conv.hold, null);
});

test('Caso 6: unidad solicitada no disponible -> ofrece alternativas reales (varias opciones)', async () => {
  const tools = buildTools({ availableUnits: ['202', '203'] });
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, tools);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(conv.options.map((o) => o.unit).sort(), ['202', '203']);
});

test('sin disponibilidad: ninguna alternativa -> OPTIONS_PRESENTED con lista vacia, no se inventa una opcion', async () => {
  const tools = buildTools({ availableUnits: [] });
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, tools);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(conv.options, []);
});

test('Caso 7: cambio de fechas a mitad de conversacion recalcula desde la fuente real (no reutiliza la opcion vieja)', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  const toolsNuevaFecha = buildTools({ availableUnits: ['203'] }); // 201 ya no disponible en la nueva fecha
  conv = await advanceConversation(conv, { checkIn: '2026-12-20', checkOut: '2026-12-21' }, toolsNuevaFecha);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(conv.options.map((o) => o.unit), ['203']);
});

test('Caso 8: cambio de numero de huespedes recalcula la unidad candidata', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools);
  assert.equal(conv.options[0].unit, '201');
  const toolsGrupo = buildTools({ availableUnits: ['CASA_COMPLETA'] });
  conv = await advanceConversation(conv, { guests: 10 }, toolsGrupo);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(conv.options.map((o) => o.unit), ['CASA_COMPLETA']);
});

test('Caso 9: grupo mayor a la capacidad de cualquier alojamiento escala a humano, no se inventa una unidad', async () => {
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 25 }, buildTools());
  assert.equal(conv.state, 'HUMAN_REQUIRED');
  assert.equal(conv.handoffReason, 'LARGE_GROUP_NEEDS_APPROVAL');
});

test('Caso 10: queja/reembolso/excepcion siempre escala a humano, en cualquier estado', async () => {
  const conv = await advanceConversation(newConversation(), { sensitiveReason: 'REFUND_REQUEST' }, buildTools());
  assert.equal(conv.state, 'HUMAN_REQUIRED');
  assert.equal(conv.handoffReason, 'SENSITIVE_REQUEST');
});

test('fecha invalida (checkout <= checkin) nunca avanza de estado con datos incoherentes', async () => {
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-11', checkOut: '2026-12-10' }, buildTools());
  assert.equal(conv.state, 'COLLECTING_DATES');
  assert.equal(conv.lastError, 'CHECKOUT_MUST_BE_AFTER_CHECKIN');
});

test('requires_manual_confirmation de Odoo escala a humano, la IA nunca aprueba en su lugar', async () => {
  const tools = buildTools({ availableUnits: ['201'], requiresManualConfirmation: true });
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, tools);
  assert.equal(conv.state, 'HUMAN_REQUIRED');
  assert.equal(conv.handoffReason, 'MANUAL_CONFIRMATION_REQUIRED');
});

test('conversacion ya escalada a humano no se reabre sola con un mensaje nuevo', async () => {
  let conv = await advanceConversation(newConversation(), { sensitiveReason: 'X' }, buildTools());
  assert.equal(conv.state, 'HUMAN_REQUIRED');
  conv = await advanceConversation(conv, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, buildTools());
  assert.equal(conv.state, 'HUMAN_REQUIRED');
});

test('GATE 010-A: "quiero reservar" repetido tras HOLD_CREATED es idempotente, no crea un segundo HOLD', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools);
  const firstHoldId = conv.hold.hold_id;
  conv = await advanceConversation(conv, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools);
  assert.equal(conv.state, 'HOLD_CREATED');
  assert.equal(conv.hold.hold_id, firstHoldId);
});

test('GATE 010-A: repetir el mismo mensaje en OPTIONS_PRESENTED no vuelve a consultar disponibilidad', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  const eventsSegundoTurno = [];
  conv = await advanceConversation(conv, { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools, (e) => eventsSegundoTurno.push(e.type));
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(eventsSegundoTurno, []); // no repite availability_checked
});

test('GATE 010-E (caso 15): HOLD vencido pasa a EXPIRED y emite hold_expired', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools);
  const events = [];
  conv = await advanceConversation(conv, { holdExpired: true }, tools, (e) => events.push(e.type));
  assert.equal(conv.state, 'EXPIRED');
  assert.deepEqual(events, ['hold_expired']);
});

test('GATE 010-E (caso 22): solicitud de cancelacion con impacto economico escala a humano, la IA nunca cancela sola', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools);
  conv = await advanceConversation(conv, { requestCancellation: true }, tools);
  assert.equal(conv.state, 'HUMAN_REQUIRED');
  assert.equal(conv.handoffReason, 'CANCELLATION_REQUEST_NEEDS_HUMAN');
});

test('GATE 010-D: resumeFromHuman reconstruye el estado mas avanzado ya confirmado, sin re-asumir pasos no verificados', async () => {
  const tools = buildTools({ availableUnits: ['201'] });
  let conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, tools);
  assert.equal(conv.state, 'READY_FOR_HOLD');
  conv = { ...conv, state: 'HUMAN_REQUIRED', handoffReason: 'SENSITIVE_REQUEST' };
  const resumed = resumeFromHuman(conv);
  assert.equal(resumed.state, 'READY_FOR_HOLD');
  assert.equal(resumed.handoffReason, null);
});

test('resumeFromHuman lanza error si se llama fuera de HUMAN_REQUIRED (transicion invalida)', () => {
  const conv = newConversation();
  assert.throws(() => resumeFromHuman(conv), /RESUME_ONLY_VALID_FROM_HUMAN_REQUIRED/);
});

test('eventos de observabilidad se emiten con la traza completa, sin datos sensibles', async () => {
  const events = [];
  const tools = buildTools({ availableUnits: ['201'] });
  await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, requestBooking: true }, tools, (e) => events.push(e));
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['availability_checked', 'quote_generated', 'hold_created']);
  for (const e of events) {
    assert.equal(e.conversation_id, 'conv-1');
    assert.equal(e.correlation_id, 'corr-1');
    assert.ok(!('password' in e) && !('token' in e) && !('api_key' in e));
  }
});
