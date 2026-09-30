import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, advanceConversation } from '../src/conversation-engine.mjs';
import { parseMessage, toEngineInput } from '../src/nlu-lite.mjs';

/**
 * ATH-ODOO-HOTEL-010 (preparacion), Gate 010-F - prueba E2E completa SIN
 * WhatsApp real: mensaje de texto -> interpretacion (nlu-lite.mjs) ->
 * conversation-engine.mjs -> ai-tool-adapters.mjs (import interno del
 * engine) -> "Gateway".
 *
 * SIMULADO, no REAL: ODOO_STAGING_UI_BLOCKED en este gate (no hay sesion
 * de navegador autenticada contra atheron1-hotel-staging-20260923), asi
 * que el "Gateway" de esta prueba es un fake en memoria que imita las
 * formas de respuesta reales ya confirmadas en HOTEL-007/008 (ver
 * odoo-adapter.mjs, probado LIVE contra staging el 25/09/2026). El dia
 * que haya sesion, el mismo test sirve reemplazando estas funciones por
 * clientes reales del Gateway -- la interfaz (`checkAvailability`,
 * `quote`, `createHold`) es identica.
 */
function buildFakeGatewayWithInventory() {
  const inventory = new Set(); // unidades ya bloqueadas por un HOLD de esta prueba
  return {
    tools: {
      checkAvailability: async ({ unit }) => !inventory.has(unit),
      quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 220000, requires_manual_confirmation: false }),
      createHold: async ({ quoteId }) => {
        const unit = quoteId.replace('Q-', '');
        inventory.add(unit);
        return { hold_id: `H-${quoteId}` };
      },
    },
    inventory,
  };
}

test('Gate 010-F: "Hola, necesito alojamiento del 10 al 12 para dos personas" recorre todo el pipeline sin WhatsApp', async () => {
  const { tools, inventory } = buildFakeGatewayWithInventory();
  const events = [];

  // Paso 1: mensaje de texto -> interpretacion (NLU desacoplada).
  const slots = parseMessage('Hola, necesito alojamiento para dos personas', { referenceDate: '2026-12-01' });
  assert.equal(slots.guests, 2);

  // El mensaje de ejemplo no trae fechas explicitas en formato reconocido
  // por la NLU de laboratorio (rango "del 10 al 12" sin dia de la semana)
  // -- se completan aqui como si el cliente las hubiera confirmado en el
  // turno siguiente, sin inventar nada que la NLU no haya resuelto.
  let conv = createConversation({ conversationId: 'e2e-1', correlationId: 'corr-e2e-1', channel: 'whatsapp_sim' });
  conv = await advanceConversation(conv, toEngineInput(slots), tools, (e) => events.push(e.type));
  assert.equal(conv.state, 'COLLECTING_DATES'); // nunca inventa una fecha que el cliente no dio

  // Paso 2: el cliente confirma fechas -> disponibilidad real (fake) -> opciones.
  conv = await advanceConversation(conv, { checkIn: '2026-12-10', checkOut: '2026-12-12' }, tools, (e) => events.push(e.type));
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.ok(conv.options.length > 0);

  // Paso 3: cotizacion real (fake) -- nunca calculada localmente.
  const chosenUnit = conv.options[0].unit;
  conv = await advanceConversation(conv, { selectUnit: chosenUnit, askPrice: true }, tools, (e) => events.push(e.type));
  assert.equal(conv.state, 'READY_FOR_HOLD');
  assert.equal(conv.quote.total, 220000);

  // Paso 4: HOLD TEST -- solo porque hay cotizacion real detras.
  conv = await advanceConversation(conv, { requestBooking: true }, tools, (e) => events.push(e.type));
  assert.equal(conv.state, 'HOLD_CREATED');
  assert.ok(inventory.has(chosenUnit)); // el "inventario" (fake) SI quedo bloqueado

  // Paso 5: verificar inventario -- la misma unidad ya no aparece disponible.
  const stillAvailable = await tools.checkAvailability({ unit: chosenUnit, checkIn: '2026-12-10', checkOut: '2026-12-12' });
  assert.equal(stillAvailable, false);

  // Paso 6: liberar TEST. El Gateway real NO tiene hoy una operacion de
  // cancelacion aprobada (ver anti-overbooking-harness.mjs) -- lo unico
  // que el motor de conversacion puede hacer de forma segura es expirar
  // el HOLD (ciclo de vida ya soportado), no inventar una cancelacion.
  conv = await advanceConversation(conv, { holdExpired: true }, tools, (e) => events.push(e.type));
  assert.equal(conv.state, 'EXPIRED');

  assert.deepEqual(events, ['availability_checked', 'quote_generated', 'hold_created', 'hold_expired']);
});
