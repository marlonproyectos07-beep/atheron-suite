/**
 * Mocks de comprension para PRUEBAS DE ARQUITECTURA Y SEGURIDAD. No miden la calidad de ningun LLM real.
 *  - OracleMock: "LLM perfecto" que devuelve la intencion esperada del caso (cota superior de la plomeria).
 *  - AdversarialMock: "LLM malicioso/equivocado" que intenta debilitar las reglas (siempre disponibilidad, datos inventados).
 *  - BenignMock: dice SALUDO con alta confianza para todo (intenta silenciar escalamientos).
 *  - ChaosMock: falla de formas variadas (error, timeout, texto libre, esquema invalido, baja confianza).
 */
import { MockUnderstandingProvider } from '../src/hybrid/provider.mjs';
import { makeInterpretation } from '../src/hybrid/schema.mjs';

const INTENT_MAP = { PAGO: 'METODO_PAGO', ANTICIPO_DIFERIDO: 'ANTICIPO', ACLARACION_PRECIO: 'CONSULTA_PRECIO', PRESUPUESTO_LIMITADO: 'CONSULTA_PRECIO', OBJECION_PRECIO: 'CONSULTA_PRECIO', EQUIPAJE: 'CHECKIN_TEMPRANO', FACTURA: 'INTENCION_NO_ENTENDIDA', LLEGADA_TARDE: 'LLEGADA_TARDE' };
const ACTIONS = { CANCELACION: 'CANCEL', CAMBIO_FECHAS: 'CHANGE', NO_SHOW: 'NO_SHOW', EXTENSION: 'EXTEND' };

export class OracleMock extends MockUnderstandingProvider {
  constructor(opts = {}) {
    super({ name: 'oracle-mock', ...opts });
    this.current = null;
    this.script = () => this.#answer();
  }

  setTurn(c, i) { this.current = { c, last: i === c.turns.length - 1 }; }

  #answer() {
    const { c, last } = this.current;
    if (!last) return makeInterpretation({ intent: 'SALUDO', confidence: 0.9 });
    const raw = c.intent ?? c.intentAny?.[0] ?? 'INTENCION_NO_ENTENDIDA';
    const intent = INTENT_MAP[raw] ?? raw;
    const text = c.turns.map((t) => (typeof t === 'string' ? t : t.transcript)).join(' ').toLowerCase();
    const channel = /airbnb/.test(text) ? 'AIRBNB' : /booking/.test(text) ? 'BOOKING' : null;
    return makeInterpretation({
      intent,
      confidence: 0.95,
      entities: { dates: c.memory?.checkIn ? [c.memory.checkIn] : [], pax: c.memory?.guests ?? null, channel },
      reservation_action: ACTIONS[intent] ?? null,
      payment_claim: intent === 'ENVIO_COMPROBANTE',
    });
  }
}

export const adversarialMock = () => new MockUnderstandingProvider({
  name: 'adversarial-mock',
  script: () => makeInterpretation({ intent: 'CONSULTA_DISPONIBILIDAD', confidence: 0.99, entities: { dates: ['2027-01-15'], pax: 2, property: 'AS', channel: 'DIRECT', amount: 1 }, reservation_state: 'NEW_INQUIRY' }),
});

export const benignMock = () => new MockUnderstandingProvider({ name: 'benign-mock', script: () => makeInterpretation({ intent: 'SALUDO', confidence: 0.99 }) });

export function chaosMock() {
  let i = 0;
  return new MockUnderstandingProvider({
    name: 'chaos-mock',
    script: () => {
      const mode = i++ % 5;
      if (mode === 0) throw new Error('boom');
      if (mode === 1) return new Promise(() => {}); // nunca resuelve -> timeout
      if (mode === 2) return 'Claro, creo que el cliente quiere reservar una habitacion.'; // texto libre
      if (mode === 3) return { intent: 'CONSULTA_DISPONIBILIDAD', confidence: 7, extra: true }; // esquema invalido
      return makeInterpretation({ intent: 'CONSULTA_DISPONIBILIDAD', confidence: 0.3 }); // baja confianza
    },
  });
}
