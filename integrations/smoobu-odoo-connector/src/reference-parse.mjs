/**
 * ATH-DEV-041 — Lectura de identificadores en `sale.order.x_pms_reference` (texto libre escrito a mano). Pura, sin red.
 *
 * Ejemplos reales del formato (sin datos personales): "Smoobu 161079481 / Booking 5357335668", "Beds24 #94513315 - Hab 201".
 * El texto puede llevar NOMBRES, CEDULAS o comprobantes de pago: por eso
 *  - solo se aceptan como identificadores los numeros/codigos precedidos de una ETIQUETA explicita (Smoobu, Booking, Airbnb, Beds24);
 *  - los numeros largos SIN etiqueta se guardan aparte (`unlabeled`) y solo sirven para marcar AMBIGUO, nunca un MATCH;
 *  - el texto original nunca sale de este modulo ni se imprime.
 */
const LABELED = [
  // "Smoobu 160965781", "Smoobu ID: 160965781", "Smoobu #160965781" y (ATH-DEV-074) "SMOOBU-160965781", el formato que se usa en Odoo
  { kind: 'smoobu', re: /\bsmoobu\s*(?:id|reserva|n[oº°.]*)?\s*[:#-]?\s*(\d{6,12})\b/gi },
  // "Booking 6044417870", "Booking.com #6044417870", "Booking ID 6044417870", "Booking N. 6044417870"
  { kind: 'booking', re: /\bbooking(?:\.com)?\s*(?:id|reserva|number|n[oº°.]*)?\s*[:#]?\s*(\d{6,14})\b/gi },
  // "Airbnb HMABCD1234" (codigo alfanumerico) o "Airbnb 1234567890"
  { kind: 'airbnb', re: /\bairbnb\s*(?:id|code|c[oó]digo|reserva)?\s*[:#]?\s*([A-Z0-9]{6,14})\b/gi },
  // "Beds24 #94513315" (sistema anterior; se conserva como evidencia, no cruza con Smoobu)
  { kind: 'beds24', re: /\bbeds\s?24\s*(?:id)?\s*[:#]?\s*#?\s*(\d{6,12})\b/gi },
];
const LONG_NUMBER = /\b\d{8,14}\b/g;

/**
 * @returns {{smoobu:string[], booking:string[], airbnb:string[], beds24:string[], unlabeled:string[]}}
 * Los valores se devuelven solo para comparar en memoria; quien llame no debe imprimirlos.
 */
export function parseReferences(text) {
  const out = { smoobu: [], booking: [], airbnb: [], beds24: [], unlabeled: [] };
  if (typeof text !== 'string' || !text.trim()) return out;
  const consumed = new Set();
  for (const { kind, re } of LABELED) {
    for (const m of text.matchAll(re)) {
      const value = kind === 'airbnb' ? m[1].toUpperCase() : m[1];
      if (!out[kind].includes(value)) out[kind].push(value);
      consumed.add(m[1]);
    }
  }
  for (const m of text.matchAll(LONG_NUMBER)) {
    if (!consumed.has(m[0]) && !out.unlabeled.includes(m[0])) out.unlabeled.push(m[0]);
  }
  return out;
}

export const hasAnyLabeled = (r) => r.smoobu.length + r.booking.length + r.airbnb.length + r.beds24.length > 0;

/** Normaliza el identificador OTA que devuelve Smoobu (`reference-id`): solo digitos o codigo alfanumerico. */
export function normalizeOtaRef(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return /^[A-Z0-9]{6,20}$/.test(s) ? s : null;
}
