import { ConnectorError } from './errors.mjs';
import { PilotWriteClient, PILOT_MAX_WINDOW_MINUTES } from './sync-pilot-client.mjs';
import { normalizePhoneE164 } from './guest-contact.mjs';

/**
 * ATH-DEV-140 — Cliente de escritura EXCLUSIVO del piloto aislado de WhatsApp. Reutiliza PilotWriteClient (atado a UNA operacion,
 * 3 escrituras, consumido al terminar o ante cualquier error) pero con interruptor, ventana y frase PROPIOS: los del piloto
 * ATH-DEV-118/122 y los de la sincronizacion programada (SYNC_ARM, SYNC_DESBLOQUEO, #101) no lo arman ni lo desarman.
 *
 * Armado solo si, a la vez: PILOT_WA_ARMED === true (constante; hoy false; la cambia un PR de activacion con orden de gerencia),
 * la hora actual esta dentro de [PILOT_WA_NOT_BEFORE, PILOT_WA_NOT_AFTER] (como mucho 15 minutos; hoy null = nunca), arm igual a la
 * frase propia y destino atheron1. Ademas: la reserva elegida debe coincidir con la de la operacion, y la nota debe ser la nota
 * interna de ESTA reserva con UNA ancla wa.me cuyo numero es el del huesped.
 */
export const PILOT_WA_ARMED = false;
export const PILOT_WA_NOT_BEFORE = null;
export const PILOT_WA_NOT_AFTER = null;
export const PILOT_WA_ARM_PHRASE = 'EJECUTAR PILOTO AISLADO WHATSAPP SMOOBU ODOO UNA RESERVA CON DOBLE APROBACION';

export function pilotWaArmedBy({ armed, notBefore, notAfter, arm, now }) {
  if (armed !== true || typeof notBefore !== 'string' || typeof notAfter !== 'string' || arm !== PILOT_WA_ARM_PHRASE) return false;
  const from = Date.parse(notBefore); const to = Date.parse(notAfter);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
  if (to - from > PILOT_MAX_WINDOW_MINUTES * 60000) return false;
  return now.getTime() >= from && now.getTime() <= to;
}

export class PilotWaWriteClient extends PilotWriteClient {
  constructor({ op, selectedId, arm = null, clock = () => new Date(), ...opts }) {
    super({ op, arm: null, clock, ...opts });
    if (Number(selectedId) !== op.smoobuId) throw new ConnectorError('PILOT_WA_SELECCION_NO_COINCIDE');
    this.selectedId = Number(selectedId);
    // el interruptor del piloto anterior no cuenta: se sustituye por el propio
    this.armCheck = () => pilotWaArmedBy({ armed: PILOT_WA_ARMED, notBefore: PILOT_WA_NOT_BEFORE, notAfter: PILOT_WA_NOT_AFTER, arm, now: clock() });
  }

  assertInScope(model, method, params) {
    super.assertInScope(model, method, params);
    if (model === 'sale.order' && method === 'message_post') {
      const guestPhone = normalizePhoneE164(this.op.payload.partner?.guest?.phone);
      const body = String(params.body ?? '');
      const anchors = [...body.matchAll(/<a href="https:\/\/wa\.me\/(\d{8,15})\?text=[A-Za-z0-9%._~-]*"/g)];
      const ok = params.body_is_html === true && guestPhone.ok && anchors.length === 1 && `+${anchors[0][1]}` === guestPhone.e164
        && body.startsWith(`ATH-SYNC | clave ${this.op.key} | SMOOBU-${this.op.smoobuId} | CREATE_ORDER`);
      if (!ok) throw new ConnectorError('PILOT_WA_NOTA_FUERA_DE_ALCANCE');
    }
  }
}
