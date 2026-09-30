import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { UnitMappingRegistry } from '../src/unit-mapping.mjs';
import { InMemoryInventorySink } from '../src/inventory-sink.mjs';
import { ConflictQueue } from '../src/conflict-queue.mjs';
import { OtaCalendarAdapter } from '../src/adapter.mjs';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function loadFixture(name) {
  return readFileSync(path.join(fixturesDir, name), 'utf8');
}

/**
 * Mapeo de STAGING solo para tests: reproduce, sin usar identificadores
 * reales de OTA, el caso Hotel Atheron Suite (habitación 201) y el caso
 * CASA COMPLETA "La Magia de Zipaquirá" con sus 4 habitaciones hermanas.
 */
export function buildFixtureRegistry() {
  return new UnitMappingRegistry([
    {
      source: 'booking',
      listingId: 'fixture-atheron-suite-201',
      unitId: 'hotel-atheron-suite:201',
      propertyId: 'hotel-atheron-suite',
      blockGroup: ['hotel-atheron-suite:201'],
    },
    {
      source: 'airbnb',
      listingId: 'fixture-atheron-suite-201',
      unitId: 'hotel-atheron-suite:201',
      propertyId: 'hotel-atheron-suite',
      blockGroup: ['hotel-atheron-suite:201'],
    },
    {
      source: 'airbnb',
      listingId: 'fixture-casa-completa-magia',
      unitId: 'hotel-atheron-suite:casa-completa',
      propertyId: 'hotel-atheron-suite',
      isCasaCompleta: true,
      blockGroup: [
        'hotel-atheron-suite:casa-completa',
        'hotel-atheron-suite:201',
        'hotel-atheron-suite:202',
        'hotel-atheron-suite:203',
        'hotel-atheron-suite:301',
        'hotel-atheron-suite:302',
      ],
    },
  ]);
}

export function buildHarness() {
  const mappingRegistry = buildFixtureRegistry();
  const sink = new InMemoryInventorySink();
  const conflictQueue = new ConflictQueue();
  const adapter = new OtaCalendarAdapter({ mappingRegistry, sink, conflictQueue });
  return { mappingRegistry, sink, conflictQueue, adapter };
}
