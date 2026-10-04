/**
 * Punto de entrada: conversacion -> lead estructurado + clasificacion comercial + payload Odoo (DRY_RUN).
 * Puro y sincrono: sin I/O, sin red, sin proveedor, sin mensajes salientes. Todo en SHADOW.
 */
import { extractLead } from './lead.mjs';
import { classifyLead } from './classify.mjs';
import { buildOdooPayload, validateOdooPayload } from './odoo-payload.mjs';

export function captureReservation(turns, opts = {}) {
  const lead = extractLead(turns, opts);
  const classification = classifyLead(lead);
  const odoo_payload = buildOdooPayload({ lead, classification }, { odoo_ids: opts.odoo_ids ?? null });
  const validation = validateOdooPayload(odoo_payload);
  return { lead, classification, odoo_payload, payload_validation: validation, outbound: null, mode: 'SHADOW' };
}

/** Turnos desde el historial de la sesion (texto ya redactado: no incluye nombres ni datos sensibles). */
export function turnsFromSession(session) {
  return session.history.filter((h) => h.role === 'guest' && h.text).map((h) => ({ role: 'guest', text: h.text }));
}

/** Captura desde la sesion del agente (sin nombre: el historial no guarda PII; la persona lo completa en Odoo). */
export function captureFromSession(session, opts = {}) {
  return captureReservation(turnsFromSession(session), { today: session.now?.slice(0, 10), conversation_id: session.id, ...opts });
}
