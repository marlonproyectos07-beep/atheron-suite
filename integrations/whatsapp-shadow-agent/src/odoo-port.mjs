/**
 * Puerto hacia Odoo para el agente SHADOW. Solo expone LECTURA de
 * disponibilidad y cotizacion; cualquier otra operacion (hold, cancel,
 * release, crear reserva, registrar pago) lanza ShadowViolation. Las
 * tarifas vienen SIEMPRE de Odoo: el agente nunca las calcula.
 *
 * Forma normalizada de respuesta:
 *   { status: 'OK'|'NO_AVAILABILITY'|'ERROR'|'TIMEOUT',
 *     options: [{ unit, label, capacity, bath, total, nights, price_basis, deposit_required? }] }
 */

export class ShadowViolation extends Error {
  constructor(operation) {
    super(`SHADOW_MODE_FORBIDS: ${operation}`);
    this.name = 'ShadowViolation';
    this.operation = operation;
  }
}

export const ALLOWED_OPERATIONS = Object.freeze(['availability', 'quote']);
export const FORBIDDEN_OPERATIONS = Object.freeze(['hold', 'createHold', 'cancel', 'release', 'createReservation', 'registerPayment', 'write', 'send']);

/** Envuelve cualquier puerto: solo deja pasar availability/quote y registra cada llamada. */
export function guardPort(port) {
  const calls = [];
  const guarded = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'calls') return calls;
        if (!ALLOWED_OPERATIONS.includes(prop)) {
          return () => {
            throw new ShadowViolation(String(prop));
          };
        }
        return async (request) => {
          calls.push({ operation: prop, request });
          return port[prop](request);
        };
      },
    },
  );
  return guarded;
}

/**
 * Adaptador al Gateway HOTEL-007 ya existente (solo Hotel Atheron Suite:
 * UNIT_ID_MAP no cubre otras propiedades). `quote` queda DESACTIVADO por
 * defecto: crea una cotizacion en Odoo y el modo SHADOW no escribe.
 */
export function createGatewayShadowPort({ client, propertyIds = {}, unitIdMap = { 201: 1, 202: 2, 203: 3, 301: 4, 302: 5, CASA_COMPLETA: 6 }, allowQuote = false, newId = () => `shadow-${Date.now()}` }) {
  const unitOf = Object.fromEntries(Object.entries(unitIdMap).map(([u, id]) => [id, u]));
  const BATH = { 201: 'compartido', 202: 'compartido', 203: 'privado', 301: 'privado', 302: 'privado' };
  return {
    async availability({ property, checkIn, checkOut, guests }) {
      const propertyId = propertyIds[property];
      if (!propertyId) return { status: 'ERROR', error: 'PROPERTY_NOT_MAPPED', options: [] };
      const res = await client.availability({ check_in: checkIn, check_out: checkOut, guests, property_id: propertyId, correlation_id: newId() });
      const data = res?.data?.data ?? res?.data ?? res;
      const options = (data?.opciones ?? [])
        .filter((o) => o.estado === 'disponible')
        .map((o) => ({ unit: unitOf[o.unit_id] ?? String(o.unit_id), label: o.nombre, capacity: o.capacidad_comercial, bath: BATH[unitOf[o.unit_id]] ?? null, total: null, price_basis: 'room' }));
      return { status: options.length ? 'OK' : 'NO_AVAILABILITY', options };
    },
    async quote({ property, checkIn, checkOut, guests }) {
      if (!allowQuote) throw new ShadowViolation('quote (crea cotizacion en Odoo; desactivado en SHADOW)');
      const propertyId = propertyIds[property];
      const res = await client.quote({ check_in: checkIn, check_out: checkOut, guests, property_id: propertyId, idempotency_key: `shadow-quote-${newId()}`, correlation_id: newId() });
      const data = res?.data?.data ?? res?.data ?? res;
      const options = (data?.opciones ?? []).map((o) => ({ unit: unitOf[o.unit_id] ?? String(o.unit_id), label: o.nombre, capacity: o.capacidad_comercial, bath: BATH[unitOf[o.unit_id]] ?? null, total: o.precio_total ?? null, price_basis: 'room', deposit_required: o.anticipo ?? null }));
      return { status: options.length ? 'OK' : 'NO_AVAILABILITY', options };
    },
  };
}
