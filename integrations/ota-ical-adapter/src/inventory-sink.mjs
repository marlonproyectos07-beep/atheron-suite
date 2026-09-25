/**
 * Puerto que recibe las operaciones de bloqueo/liberación que produce el
 * OtaCalendarAdapter. En este repositorio solo existe la implementación en
 * memoria (para tests y fixtures locales).
 *
 * En producción, el sink real sería un cliente del gateway HOTEL-007
 * (`integrations/odoo-hotel-gateway`, rama feature/ath-odoo-hotel-007-gateway).
 * Ese gateway HOY solo expone availability/quote/hold/status pensados para el
 * flujo de cotización propio (hold requiere quote_id). Bloquear fechas a
 * partir de un VEVENT externo (sin cotización previa) es una operación
 * distinta que ese contrato todavía no cubre — ver
 * docs/ota/ATH-OTA-001-PENDIENTES-HUMANOS.md, "Endpoint de bloqueo externo en
 * el gateway". Por eso este adapter no llama al gateway directamente: expone
 * un puerto (`InventorySink`) para que, cuando ese endpoint exista, solo haga
 * falta escribir un nuevo adaptador de salida sin tocar la lógica de
 * parseo/idempotencia/colisión de aquí.
 */
export class InventorySink {
  async block(_op) {
    throw new Error('InventorySink.block no implementado');
  }

  async release(_op) {
    throw new Error('InventorySink.release no implementado');
  }
}

export class InMemoryInventorySink extends InventorySink {
  constructor() {
    super();
    /** @type {Map<string, {unitId: string, startDate: string, endDate: string, externalEventId: string}>} */
    this.blocks = new Map();
    this.calls = [];
  }

  async block({ unitId, startDate, endDate, externalEventId, reason }) {
    this.calls.push({ type: 'block', unitId, startDate, endDate, externalEventId, reason });
    this.blocks.set(blockKey(unitId, externalEventId), { unitId, startDate, endDate, externalEventId });
  }

  async release({ unitId, externalEventId }) {
    this.calls.push({ type: 'release', unitId, externalEventId });
    this.blocks.delete(blockKey(unitId, externalEventId));
  }

  isBlocked(unitId, externalEventId) {
    return this.blocks.has(blockKey(unitId, externalEventId));
  }

  activeBlocksFor(unitId) {
    return [...this.blocks.values()].filter((b) => b.unitId === unitId);
  }
}

function blockKey(unitId, externalEventId) {
  return `${unitId}::${externalEventId}`;
}
