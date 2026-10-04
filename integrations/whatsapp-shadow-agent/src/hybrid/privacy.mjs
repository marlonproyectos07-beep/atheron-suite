/**
 * Compuerta de privacidad previa a cualquier proveedor. FALLO CERRADO: ante PII sensible (o duda) el mensaje
 * NO sale a ningun proveedor y el caso pasa a una persona. Incluye deteccion de datos FRAGMENTADOS en varios
 * mensajes (p. ej. una tarjeta enviada en dos o tres burbujas).
 */
import { redactPII, normalizeForScan } from './pii.mjs';

const digitsOf = (s) => s.replace(/\D/g, '');
const numericHeavy = (s) => {
  const t = s.replace(/\s/g, '');
  return t.length > 0 && digitsOf(t).length >= 3 && digitsOf(t).length / t.length >= 0.6;
};

/**
 * Detecta numeros largos repartidos en turnos consecutivos.
 * @param {string[]} turns textos en orden (el ultimo es el mensaje actual)
 * @returns {{fragmented:{type:string, indexes:number[]}[], sensitive:boolean}}
 */
export function scanFragments(turns) {
  const found = [];
  let chain = null; // { digits, indexes }
  const close = () => {
    if (chain && chain.indexes.length >= 2) {
      const n = chain.digits.length;
      if (n >= 13 && n <= 19) found.push({ type: 'CARD', indexes: chain.indexes });
      else if (n >= 10 && n < 13) found.push(n === 10 && chain.digits[0] === '3' ? { type: 'PHONE', indexes: chain.indexes } : { type: 'ACCOUNT', indexes: chain.indexes });
    }
    chain = null;
  };
  turns.forEach((raw, i) => {
    const t = normalizeForScan(raw ?? '').trim();
    if (numericHeavy(t)) {
      chain ??= { digits: '', indexes: [] };
      chain.digits += digitsOf(t);
      chain.indexes.push(i);
      return;
    }
    const lead = t.match(/^(\d[\d\s.-]*)/)?.[1];
    if (chain && lead) { chain.digits += digitsOf(lead); chain.indexes.push(i); }
    close();
    const trail = t.match(/(\d[\d\s.-]*)$/)?.[1];
    if (trail && digitsOf(trail).length >= 3) chain = { digits: digitsOf(trail), indexes: [i] };
  });
  close();
  return { fragmented: found, sensitive: found.some((f) => f.type === 'CARD' || f.type === 'ACCOUNT') };
}

/**
 * @param {{history:string[], current:string}} input  history = textos previos del cliente (ya guardados)
 * @returns {{external_provider_allowed:boolean, reasons:string[], text:string, redactions:object, fragmented:object[]}}
 */
export function privacyGate({ history = [], current }) {
  const red = redactPII(current);
  const frag = scanFragments([...history, current ?? '']);
  const reasons = [...red.sensitive_reasons, ...frag.fragmented.filter((f) => f.type === 'CARD' || f.type === 'ACCOUNT').map((f) => `FRAGMENTED_${f.type}`)];
  return { external_provider_allowed: reasons.length === 0, reasons, text: red.text, redactions: red.redactions, fragmented: frag.fragmented };
}

/** Reescribe en el historial los turnos que formaron un dato fragmentado (nunca queda el digito crudo). */
export function scrubHistory(session, guestIndexes, placeholder) {
  const guests = session.history.filter((h) => h.role === 'guest');
  for (const i of guestIndexes) if (guests[i]) guests[i].text = placeholder;
}
