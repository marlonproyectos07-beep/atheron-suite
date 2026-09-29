import { createHash } from 'node:crypto';

/**
 * Fixtures de DRY_RUN (Fase 12).
 *
 * IMPORTANTE: estos datos son mocks para probar el contrato sin tocar Odoo.
 * NO son tarifas, capacidades ni disponibilidad reales. Nunca deben
 * presentarse como datos reales de Atheron Suite (regla del proyecto: no
 * inventar datos comerciales). Cada respuesta de fixture incluye
 * `dry_run: true` y una nota explicita.
 *
 * Las unidades listadas (201, 202, 203, 301, 302, CASA_COMPLETA) coinciden
 * con los nombres ya documentados y aprobados en HOTEL-002
 * (AI/ODOO_HOTEL_STATE.md), reutilizados aqui solo como identificadores
 * estables para pruebas, sin ninguna tarifa ni capacidad real asociada.
 */

export const PILOT_UNITS = Object.freeze([
  { unit_id: 'unit-201', property_id: 'atheron-suite' },
  { unit_id: 'unit-202', property_id: 'atheron-suite' },
  { unit_id: 'unit-203', property_id: 'atheron-suite' },
  { unit_id: 'unit-301', property_id: 'atheron-suite' },
  { unit_id: 'unit-302', property_id: 'atheron-suite' },
  { unit_id: 'unit-casa-completa', property_id: 'atheron-suite' },
]);

function deterministicSeed(...parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function buildAvailabilityFixture({ check_in, check_out, guests, property_id }) {
  const units = PILOT_UNITS.filter((u) => !property_id || u.property_id === property_id).map((unit) => {
    const seed = deterministicSeed(unit.unit_id, check_in, check_out);
    return {
      ...unit,
      available: parseInt(seed.slice(0, 2), 16) % 5 !== 0, // determinista, no aleatorio real
      max_guests_fixture: 4,
    };
  });

  return {
    dry_run: true,
    note: 'DRY_RUN fixture: no refleja disponibilidad real de Odoo.',
    check_in,
    check_out,
    guests,
    units,
  };
}

export function buildQuoteFixture({ check_in, check_out, guests, property_id, idempotency_key }) {
  const seed = deterministicSeed('quote', check_in, check_out, String(guests), property_id ?? '', idempotency_key);
  const quoteId = `dryq_${seed.slice(0, 16)}`;
  const nights = 1; // fixture: no calcula noches reales entre fechas
  return {
    dry_run: true,
    note: 'DRY_RUN fixture: no refleja tarifas reales de Odoo (lista de precios 20).',
    quote_id: quoteId,
    check_in,
    check_out,
    guests,
    property_id: property_id ?? 'atheron-suite',
    nights,
    currency: 'COP',
    mock_total_minor: (parseInt(seed.slice(0, 8), 16) % 500000) + 100000,
    expires_at_offset_minutes: 30,
  };
}

export function buildHoldFixture({ quote_id, idempotency_key }) {
  const seed = deterministicSeed('hold', quote_id, idempotency_key);
  const holdId = `dryh_${seed.slice(0, 16)}`;
  return {
    dry_run: true,
    note: 'DRY_RUN fixture: no se escribe ningun HOLD real en Odoo.',
    hold_id: holdId,
    quote_id,
    status: 'HELD',
    hold_duration_minutes: 120, // refleja la politica actual (pendiente CEO), no una decision nueva
  };
}
