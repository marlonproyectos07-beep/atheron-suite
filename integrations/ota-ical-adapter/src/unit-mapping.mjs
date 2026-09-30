import { AdapterError } from './errors.mjs';

/**
 * Registro de mapeo (fuente OTA + listing) -> unidad interna Odoo.
 *
 * IMPORTANTE: este módulo NO trae mapeos reales de producción. La fuente de
 * verdad del mapeo es docs/ota/ATH-OTA-001-MATRIZ.md; solo las filas
 * marcadas CONFIRMADO deberían cargarse aquí en un entorno real, y siempre
 * en STAGING primero (Fase 7: "NO conectar feeds reales todavía").
 *
 * Un "grupo de bloqueo" (blockGroup) es el conjunto de unit_id que deben
 * quedar bloqueadas cuando cualquier miembro del grupo se reserva: la unidad
 * CASA COMPLETA y todas sus habitaciones. Las habitaciones hermanas
 * compatibles (p. ej. 201 y 203, que no comparten cama ni baño) NO deben
 * bloquearse entre sí — ver docs/ota/ATH-OTA-001-ARQUITECTURA.md §Fase 6,
 * que reutiliza la regla ya validada en ATH-ODOO-HOTEL-002/006.
 */
export class UnitMappingRegistry {
  constructor(entries = []) {
    this._bySourceListing = new Map();
    this._byUnitId = new Map();
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(entry) {
    const { source, listingId, unitId, propertyId, isCasaCompleta = false, blockGroup = [] } = entry;
    if (!source || !listingId || !unitId || !propertyId) {
      throw new AdapterError(
        'MAPPING_INVALID_ENTRY',
        'Cada mapeo requiere source, listingId, unitId y propertyId',
        { entry },
      );
    }
    const key = mappingKey(source, listingId);
    if (this._bySourceListing.has(key)) {
      throw new AdapterError('MAPPING_DUPLICATE', `Ya existe un mapeo para ${key}`, { entry });
    }
    const record = { source, listingId, unitId, propertyId, isCasaCompleta, blockGroup };
    this._bySourceListing.set(key, record);
    this._byUnitId.set(unitId, record);
  }

  resolve(source, listingId) {
    const record = this._bySourceListing.get(mappingKey(source, listingId));
    if (!record) {
      return null;
    }
    return record;
  }

  /** Unidades que deben quedar bloqueadas cuando `unitId` se reserva (incluye la propia unidad). */
  blockGroupFor(unitId) {
    const record = this._byUnitId.get(unitId);
    if (!record) return [unitId];
    return record.blockGroup.length > 0 ? record.blockGroup : [unitId];
  }
}

function mappingKey(source, listingId) {
  return `${source}::${listingId}`;
}
