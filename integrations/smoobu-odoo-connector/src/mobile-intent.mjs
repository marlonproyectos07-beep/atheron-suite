// ATH-MOBILE-001. SOLO SIMULACION, NUNCA ENVIA DATOS A ODOO NI SMOOBU.
import { createHash } from 'node:crypto';

const TYPES = new Set(['CONSULTAR_RESERVA', 'CONSULTAR_PAGO', 'PROPONER_RESERVA']);
const SRC = new Set(['CHATGPT', 'CLAUDE']);
function validKey(s) { return typeof s === 'string' && /^[A-Za-z0-9_.:-]{8,80}$/.test(s); }
function validation(req) {
  if (!req || !validKey(req.operationKey) || !SRC.has(req.source) || !TYPES.has(req.type)) return 'PETICION_INVALIDA';
  if (req.type === 'PROPONER_RESERVA') {
    if (!['201','202','203','301','302'].includes(req.room) || !/^\d{4}-\d{2}-\d{2}$/.test(req.arrival ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(req.departure ?? '') || req.arrival >= req.departure || !Number.isInteger(req.amountCOP) || req.amountCOP <= 0) return 'PROPUESTA_INCOMPLETA';
  }
  return null;
}
const essential = (r) => ({ type: r.type, room: r.room ?? null, arrival: r.arrival ?? null, departure: r.departure ?? null, amountCOP: r.amountCOP ?? null });
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Memoria de proceso SOLO PARA PRUEBAS. La implementacion real debera emplear almacenamiento atomico y privado.
export function createPilotInbox() {
  const requests = new Map();
  return {
    receive(request) {
      const err = validation(request);
      if (err) return { status: 'RECHAZADA', error: err, writes: 0 };
      const contentHash = hash(essential(request));
      const existing = requests.get(request.operationKey);
      if (existing) return existing.contentHash === contentHash
        ? { status: 'PROPUESTA_EXISTENTE', reference: existing.ref, writes: 0 }
        : { status: 'CONFLICTO_CLAVE', writes: 0 };
      const ref = 'MOB-DEMO-' + hash(request.operationKey).slice(0, 10).toUpperCase();
      requests.set(request.operationKey, { contentHash, ref });
      return { status: 'PROPUESTA_NO_EJECUTADA', reference: ref, writes: 0 };
    },
    count() { return requests.size; },
  };
}
