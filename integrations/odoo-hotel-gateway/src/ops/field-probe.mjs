/**
 * Inventario de campos REALES de la API v2 (solo nombres y tipos; jamás valores, para no filtrar datos de huéspedes)
 * y comprobaciones de la lectura real. Pura: recibe las reservas ya leídas por el cliente SOLO LECTURA.
 */
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export function inventoryFields(rawBookings) {
  const fields = {}; const items = {};
  for (const b of rawBookings) {
    for (const [k, v] of Object.entries(b)) { (fields[k] ??= { types: new Set(), present: 0 }).types.add(typeOf(v)); fields[k].present += 1; }
    for (const it of Array.isArray(b.invoiceItems) ? b.invoiceItems : []) {
      for (const [k, v] of Object.entries(it)) { (items[k] ??= { types: new Set(), present: 0 }).types.add(typeOf(v)); items[k].present += 1; }
    }
  }
  const out = (o) => Object.fromEntries(Object.entries(o).sort().map(([k, v]) => [k, { types: [...v.types].sort(), present: v.present }]));
  return { bookings: rawBookings.length, booking_fields: out(fields), invoice_item_fields: out(items) };
}

/** Campos que el normalizador espera; los que falten en la lectura real se reportan, no se suponen. */
export const EXPECTED_BOOKING_FIELDS = Object.freeze(['id', 'roomId', 'arrival', 'departure', 'status', 'numAdult', 'numChild', 'firstName', 'lastName', 'channel', 'apiReference', 'masterId', 'price', 'notes', 'comments', 'invoiceItems']);
export const missingExpectedFields = (inv) => EXPECTED_BOOKING_FIELDS.filter((f) => !(f in inv.booking_fields));
