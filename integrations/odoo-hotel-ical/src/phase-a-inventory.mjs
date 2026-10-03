/** PHASE A: inventario de evidencia, no configuracion operativa de feeds.
 * No contiene URLs, secretos ni datos para conectar canales reales.
 * Cobertura significa sincronizacion OTA <-> Odoo continua y verificada.
 */
import { CANONICAL_UNITS } from './ota-adapters.mjs';

export const COVERAGE = Object.freeze({
  CONNECTED: 'CONNECTED',
  PARTIAL: 'PARTIAL',
  UNCONNECTED: 'UNCONNECTED',
  UNKNOWN: 'UNKNOWN',
});

const generalBookingProperty = '16559325';

export const PHASE_A_UNITS = Object.freeze([
  {
    unit: 'AHS-201', odoo_unit_id: 1, booking_property_id: generalBookingProperty,
    booking_calendar_id: null, airbnb_listing_id: null, coverage: COVERAGE.UNCONNECTED,
    note: 'Sin feed por unidad ni fila OTA en Odoo STAGING documentada.',
  },
  {
    unit: 'AHS-202', odoo_unit_id: null, booking_property_id: generalBookingProperty,
    booking_calendar_id: null, airbnb_listing_id: null, coverage: COVERAGE.UNCONNECTED,
    note: 'IDs de unidad/listing pendientes; sin fila OTA documentada.',
  },
  {
    unit: 'AHS-203', odoo_unit_id: null, booking_property_id: generalBookingProperty,
    booking_calendar_id: null, airbnb_listing_id: null, coverage: COVERAGE.UNCONNECTED,
    note: 'Un slot Odoo etiquetado Booking no acredita un feed conectado.',
  },
  {
    unit: 'AHS-301', odoo_unit_id: null, booking_property_id: generalBookingProperty,
    booking_calendar_id: null, airbnb_listing_id: '1057232086445101786', coverage: COVERAGE.UNCONNECTED,
    note: 'ID Airbnb conocido; sin feed por unidad ni fila OTA documentada.',
  },
  {
    unit: 'AHS-302', odoo_unit_id: 5, booking_property_id: generalBookingProperty,
    booking_calendar_id: '1655932505', airbnb_listing_id: '1119517434126866031', coverage: COVERAGE.PARTIAL,
    note: 'Feeds reales y piloto manual Airbnb; sin runner continuo ni salida Odoo registrada.',
  },
  {
    unit: 'AHS-CASA', odoo_unit_id: 6, booking_property_id: '16569053',
    booking_calendar_id: null, airbnb_listing_id: null, coverage: COVERAGE.UNCONNECTED,
    note: 'Propiedad Booking separada; anuncio Airbnb por confirmar; sin feeds OTA documentados.',
  },
].map((entry) => Object.freeze(entry)));

export function summarizeCoverage(units = PHASE_A_UNITS) {
  const counts = { TOTAL_UNITS: units.length, CONNECTED: 0, PARTIAL: 0, UNCONNECTED: 0, UNKNOWN: 0, AT_RISK: 0 };
  for (const entry of units) {
    if (!CANONICAL_UNITS.includes(entry.unit)) throw new Error('UNKNOWN_CANONICAL_UNIT');
    if (!(entry.coverage in COVERAGE)) throw new Error('UNKNOWN_COVERAGE');
    counts[entry.coverage] += 1;
    if (entry.coverage !== COVERAGE.CONNECTED) counts.AT_RISK += 1;
  }
  if (new Set(units.map((entry) => entry.unit)).size !== units.length) throw new Error('DUPLICATE_UNIT');
  if (units.length !== CANONICAL_UNITS.length ||
      CANONICAL_UNITS.some((unit) => !units.some((entry) => entry.unit === unit))) {
    throw new Error('INCOMPLETE_UNIT_INVENTORY');
  }
  return Object.freeze(counts);
}
