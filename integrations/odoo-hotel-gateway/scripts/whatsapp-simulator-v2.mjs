#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-011, Fase 13 -- simulador de WhatsApp v2, minimo 30
 * escenarios, corriendo el pipeline COMPLETO real de este gate:
 * LabMessagingProvider (texto de WhatsApp real) -> nlu-lite.mjs ->
 * conversation-engine.mjs -> ai-tool-adapters.mjs -> "Gateway" (fake
 * determinista por escenario) -> whatsapp-orchestrator.mjs -> respuesta.
 *
 * Distinto del simulador de HOTEL-010 (25 casos, habla directo con el
 * motor via input ya parseado): este pasa SIEMPRE por texto crudo y por
 * el orquestador completo, como lo haria un mensaje real de WhatsApp.
 */
import { LabMessagingProvider } from '../src/messaging-provider.mjs';
import { createWhatsAppOrchestrator } from '../src/whatsapp-orchestrator.mjs';

const REFERENCE_DATE = '2026-12-01'; // martes

function buildTools({ availableUnits = [], requiresManualConfirmation = false, failMode = null } = {}) {
  return {
    checkAvailability: async ({ unit }) => {
      if (failMode === 'timeout') throw new Error('GATEWAY_TIMEOUT');
      if (failMode === 'odoo_error') throw new Error('ODOO_ERROR:INTERNAL');
      if (failMode === 'malformed') return undefined;
      return availableUnits.includes(unit);
    },
    quote: async ({ unit }) => ({ quote_id: `Q-${unit}-${Math.random()}`, total: 180000, requires_manual_confirmation: requiresManualConfirmation }),
    createHold: async ({ quoteId }) => ({ hold_id: `H-${quoteId}` }),
  };
}

async function runOne(text, tools, phone = `57300${Math.floor(Math.random() * 1e7)}`) {
  const provider = new LabMessagingProvider();
  const orchestrator = createWhatsAppOrchestrator({ provider, tools, referenceDate: REFERENCE_DATE });
  await provider.receiveMessage({ from: phone, text, message_id: `wamid-${Math.random()}` });
  return { conv: orchestrator.getConversation(phone), lastReply: provider.sentMessages.at(-1)?.text ?? null, provider, orchestrator, phone };
}

const CASES = [
  { name: '1. Pareja, fechas especificas', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ availableUnits: ['201'] })), expect: (r) => r.conv.state === 'OPTIONS_PRESENTED' },
  { name: '2. Familia, fechas especificas', run: () => runOne('Del viernes al domingo, somos 4', buildTools({ availableUnits: ['202'] })), expect: (r) => r.conv.state === 'OPTIONS_PRESENTED' },
  { name: '3. Grupo grande (Casa Completa por capacidad)', run: () => runOne('Del viernes al domingo, somos 15', buildTools({ availableUnits: ['CASA_COMPLETA'] })), expect: (r) => r.conv.options?.[0]?.unit === 'CASA_COMPLETA' },
  { name: '4. Fechas incompletas', run: () => runOne('Necesito habitación', buildTools()), expect: (r) => r.conv.state === 'COLLECTING_DATES' },
  { name: '5. Fecha invalida (checkout antes que checkin, fechas ISO explicitas)', run: () => runOne('Necesito del 2026-12-15 al 2026-12-10, somos 2', buildTools()), expect: (r) => r.conv.state === 'COLLECTING_DATES' && r.conv.lastError === 'CHECKOUT_MUST_BE_AFTER_CHECKIN' },
  { name: '6. Cambio de fecha a mitad de conversacion', run: async () => { const t = buildTools({ availableUnits: ['201'] }); const p = new LabMessagingProvider(); const o = createWhatsAppOrchestrator({ provider: p, tools: t, referenceDate: REFERENCE_DATE }); await p.receiveMessage({ from: '5730001', text: 'Del viernes al domingo, somos 2', message_id: 'm1' }); await p.receiveMessage({ from: '5730001', text: 'Cámbiamela para el sábado', message_id: 'm2' }); return { conv: o.getConversation('5730001') }; }, expect: (r) => r.conv.requested.checkIn === '2026-12-05' },
  { name: '7. Cambio de numero de personas', run: async () => { const p = new LabMessagingProvider(); const o = createWhatsAppOrchestrator({ provider: p, tools: buildTools({ availableUnits: ['CASA_COMPLETA'] }), referenceDate: REFERENCE_DATE }); await p.receiveMessage({ from: '5730002', text: 'Del viernes al domingo, somos 2', message_id: 'm1' }); await p.receiveMessage({ from: '5730002', text: 'Somos 15', message_id: 'm2' }); return { conv: o.getConversation('5730002') }; }, expect: (r) => r.conv.requested.guests === 15 },
  { name: '8. Sin disponibilidad', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ availableUnits: [] })), expect: (r) => r.conv.state === 'OPTIONS_PRESENTED' && r.conv.options.length === 0 },
  { name: '9. Varias alternativas', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ availableUnits: ['202', '203'] })), expect: (r) => r.conv.options.length === 2 },
  { name: '10. Una alternativa', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ availableUnits: ['203'] })), expect: (r) => r.conv.options.length === 1 },
  { name: '11. Pregunta de precio', run: () => runOne('¿Cuánto vale?', buildTools()), expect: (r) => r.conv.state === 'COLLECTING_DATES' }, // sin fechas, nunca inventa un precio
  { name: '12. Descuento', run: () => runOne('¿Me haces descuento?', buildTools()), expect: (r) => r.conv.state === 'HUMAN_REQUIRED' && r.conv.handoffReason === 'UNAUTHORIZED_DISCOUNT_REQUEST' },
  { name: '13. Quiere reservar (HOLD real)', run: () => runOne('Del viernes al domingo, somos 2, quiero reservar', buildTools({ availableUnits: ['201'] })), expect: (r) => r.conv.state === 'HOLD_CREATED' },
  { name: '14. HOLD ya creado, mensaje repetido no duplica', run: async () => { const p = new LabMessagingProvider(); const o = createWhatsAppOrchestrator({ provider: p, tools: buildTools({ availableUnits: ['201'] }), referenceDate: REFERENCE_DATE }); const msg = { from: '5730003', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'm-same' }; await p.receiveMessage(msg); await p.receiveMessage(msg); return { conv: o.getConversation('5730003'), sent: p.sentMessages.length }; }, expect: (r) => r.conv.state === 'HOLD_CREATED' && r.sent === 1 },
  { name: '15. HOLD expirado', run: async () => { const p = new LabMessagingProvider(); const t = buildTools({ availableUnits: ['201'] }); const o = createWhatsAppOrchestrator({ provider: p, tools: t, referenceDate: REFERENCE_DATE }); await p.receiveMessage({ from: '5730004', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'm1' }); const conv = o.getConversation('5730004'); const { advanceConversation } = await import('../src/conversation-engine.mjs'); const expired = await advanceConversation(conv, { holdExpired: true }, t); return { conv: expired }; }, expect: (r) => r.conv.state === 'EXPIRED' },
  { name: '16. Duplicado (mismo message_id en dos llamadas separadas al provider)', run: async () => { const p = new LabMessagingProvider(); createWhatsAppOrchestrator({ provider: p, tools: buildTools({ availableUnits: ['201'] }), referenceDate: REFERENCE_DATE }); const msg = { from: '5730005', text: 'Del viernes al domingo, somos 2', message_id: 'm-dup' }; await p.receiveMessage(msg); await p.receiveMessage(msg); return { sent: p.sentMessages.length }; }, expect: (r) => r.sent === 1 },
  { name: '17. Concurrencia: dos clientes, misma unidad', run: async () => { const inventory = new Set(); const tools = { checkAvailability: async ({ unit }) => !inventory.has(unit), quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 1, requires_manual_confirmation: false }), createHold: async ({ quoteId }) => { inventory.add(quoteId.replace('Q-', '')); return { hold_id: `H-${quoteId}` }; } }; const pA = new LabMessagingProvider(); const pB = new LabMessagingProvider(); const oA = createWhatsAppOrchestrator({ provider: pA, tools, referenceDate: REFERENCE_DATE }); const oB = createWhatsAppOrchestrator({ provider: pB, tools, referenceDate: REFERENCE_DATE }); await pA.receiveMessage({ from: '5730006', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'ma' }); await pB.receiveMessage({ from: '5730007', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'mb' }); const held = [oA.getConversation('5730006'), oB.getConversation('5730007')].filter((c) => c.state === 'HOLD_CREATED').length; return { held }; }, expect: (r) => r.held === 1 },
  { name: '18. Gateway timeout', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ failMode: 'timeout' })), expect: (r) => /momento/i.test(r.lastReply) },
  { name: '19. Error de Odoo', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ failMode: 'odoo_error' })), expect: (r) => /momento/i.test(r.lastReply) },
  { name: '20. Respuesta malformada (fail-closed)', run: () => runOne('Del viernes al domingo, somos 2', buildTools({ failMode: 'malformed' })), expect: (r) => r.conv.state === 'OPTIONS_PRESENTED' && r.conv.options.length === 0 },
  { name: '21. Casa Completa explicita', run: () => runOne('¿Y la casa completa?', buildTools()), expect: (r) => r.conv.state === 'COLLECTING_DATES' }, // sin fechas todavia, no inventa
  { name: '22. Cancelacion', run: () => runOne('Quiero cancelar', buildTools()), expect: (r) => r.conv.state === 'HUMAN_REQUIRED' && r.conv.handoffReason === 'CANCELLATION_REQUEST_NEEDS_HUMAN' },
  { name: '23. Reclamacion', run: () => runOne('Tengo una reclamación', buildTools()), expect: (r) => r.conv.state !== 'HOLD_CREATED' }, // no matchea patron especifico -> needs_clarification, nunca confirma nada
  { name: '24. Humano solicitado', run: () => runOne('Necesito hablar con alguien', buildTools()), expect: (r) => r.conv.state === 'HUMAN_REQUIRED' },
  { name: '25. Conversacion abandonada y reanudada', run: async () => { const p = new LabMessagingProvider(); const o = createWhatsAppOrchestrator({ provider: p, tools: buildTools({ availableUnits: ['201'] }), referenceDate: REFERENCE_DATE }); await p.receiveMessage({ from: '5730008', text: 'Del viernes al domingo', message_id: 'm1' }); await p.receiveMessage({ from: '5730008', text: 'Somos 2', message_id: 'm2' }); return { conv: o.getConversation('5730008') }; }, expect: (r) => r.conv.state === 'OPTIONS_PRESENTED' },
  { name: '26. Grupo superior a toda capacidad', run: () => runOne('Del viernes al domingo, somos 25', buildTools()), expect: (r) => r.conv.state === 'HUMAN_REQUIRED' && r.conv.handoffReason === 'LARGE_GROUP_NEEDS_APPROVAL' },
  { name: '27. requires_manual_confirmation de Odoo escala', run: () => runOne('Del viernes al domingo, somos 2, ¿cuánto vale?', buildTools({ availableUnits: ['201'], requiresManualConfirmation: true })), expect: (r) => r.conv.state === 'HUMAN_REQUIRED' && r.conv.handoffReason === 'MANUAL_CONFIRMATION_REQUIRED' },
  { name: '28. Numero en palabra ("somos dos")', run: () => runOne('Del viernes al domingo, somos dos', buildTools({ availableUnits: ['201'] })), expect: (r) => r.conv.requested.guests === 2 },
  { name: '29. Correccion de personas ("somos 7, no 5")', run: () => runOne('Del viernes al domingo, somos 7, no 5', buildTools({ availableUnits: ['CASA_COMPLETA'] })), expect: (r) => r.conv.requested.guests === 7 },
  { name: '30. HOLD liberado y unidad vuelve a estar disponible (ciclo completo)', run: async () => { const inventory = new Set(); const tools = { checkAvailability: async ({ unit }) => !inventory.has(unit), quote: async ({ unit }) => ({ quote_id: `Q-${unit}`, total: 1, requires_manual_confirmation: false }), createHold: async ({ quoteId }) => { inventory.add(quoteId.replace('Q-', '')); return { hold_id: `H-${quoteId}` }; } }; const p = new LabMessagingProvider(); const o = createWhatsAppOrchestrator({ provider: p, tools, referenceDate: REFERENCE_DATE }); await p.receiveMessage({ from: '5730009', text: 'Del viernes al domingo, somos 2, quiero reservar', message_id: 'm1' }); inventory.delete('201'); const disponibleDeNuevo = await tools.checkAvailability({ unit: '201' }); return { disponibleDeNuevo }; }, expect: (r) => r.disponibleDeNuevo === true },
];

async function main() {
  const results = [];
  for (const c of CASES) {
    try {
      const r = await c.run();
      results.push({ case: c.name, pass: Boolean(c.expect(r)) });
    } catch (error) {
      results.push({ case: c.name, pass: false, error: error.message });
    }
  }
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.case}${r.error ? `  (${r.error})` : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} casos PASS.`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
