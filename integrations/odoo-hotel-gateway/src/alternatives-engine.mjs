/**
 * ATH-ODOO-HOTEL-008 Nivel 1, Workstream C - motor de alternativas.
 *
 * NO inventa disponibilidad: `checkAvailability` es inyectado y debe venir
 * respaldado por Odoo/el gateway (en produccion) o por un fixture
 * determinista (en tests). Este modulo solo decide QUE alternativas
 * ofrecer dado lo que Odoo ya respondio -- nunca calcula disponibilidad
 * por su cuenta.
 *
 * Separacion de datos y presentacion: esto devuelve datos crudos
 * (unit/capacity), nunca texto comercial. La capa conversacional (Sofia)
 * redacta el mensaje a partir de este resultado.
 */

export const ROOM_UNITS = Object.freeze(['201', '202', '203', '301', '302']);
export const CASA_COMPLETA = 'CASA_COMPLETA';

/**
 * Capacidad estructural de cada unidad. Los numeros de habitaciones (4)
 * reutilizan `max_guests_fixture` ya usado en
 * integrations/odoo-hotel-gateway/fixtures/dry-run-fixtures.mjs. El de
 * Casa Completa reutiliza el rango publicado realmente en el listing de
 * Booking ya observado ("Atheron Grand House Zipaquira de 10 a 20
 * personas", ver AI/ATH-ODOO-HOTEL-008_OTA_MAP.md) -- no es un dato
 * inventado, es el limite superior ya publico. La capacidad real y
 * definitiva de cada unidad la sigue decidiendo Odoo/el CEO.
 */
export const UNIT_CATALOG = Object.freeze({
  201: { capacity: 4 },
  202: { capacity: 4 },
  203: { capacity: 4 },
  301: { capacity: 4 },
  302: { capacity: 4 },
  [CASA_COMPLETA]: { capacity: 20 },
});

function assertKnownUnit(unit) {
  if (!(unit in UNIT_CATALOG)) {
    throw new Error(`UNKNOWN_UNIT: ${unit}`);
  }
}

/**
 * @param {{requestedUnit: string, checkIn: string, checkOut: string, guests: number}} request
 * @param {{checkAvailability: (unit: string, checkIn: string, checkOut: string) => Promise<boolean> | boolean, units?: object}} deps
 */
export async function requestAccommodationAlternatives(
  { requestedUnit, checkIn, checkOut, guests },
  { checkAvailability, units = UNIT_CATALOG },
) {
  assertKnownUnit(requestedUnit);
  if (!checkIn || !checkOut) throw new Error('CHECKIN_CHECKOUT_REQUIRED');
  if (!Number.isInteger(guests) || guests <= 0) throw new Error('GUESTS_MUST_BE_POSITIVE_INTEGER');
  const capacity = units[requestedUnit]?.capacity;
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('CAPACITY_UNKNOWN');
  if (guests > capacity) {
    return { requested_unit: requestedUnit, requested_available: false,
      alternatives: [], status: 'CAPACITY_GAP', capacity };
  }

  const requestedAvailable = await checkAvailability(requestedUnit, checkIn, checkOut);
  if (requestedAvailable) {
    return { requested_unit: requestedUnit, requested_available: true, alternatives: [] };
  }

  // Casa Completa no tiene sustituto: ninguna habitacion individual
  // reemplaza comercialmente "la casa entera". Si Casa Completa no esta
  // disponible, no se ofrecen habitaciones sueltas como alternativa.
  if (requestedUnit === CASA_COMPLETA) {
    return { requested_unit: requestedUnit, requested_available: false, alternatives: [] };
  }

  const alternatives = [];
  for (const candidate of ROOM_UNITS) {
    if (candidate === requestedUnit) continue;
    if (units[candidate].capacity < guests) continue; // capacidad insuficiente: nunca se ofrece
    const available = await checkAvailability(candidate, checkIn, checkOut);
    if (available) alternatives.push({ unit: candidate, capacity: units[candidate].capacity });
  }

  return { requested_unit: requestedUnit, requested_available: false, alternatives };
}
