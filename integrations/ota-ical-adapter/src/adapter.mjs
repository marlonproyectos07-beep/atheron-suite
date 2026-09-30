import { parseIcal } from './ical-parser.mjs';
import { normalizeEvent, rangesOverlap } from './normalize.mjs';
import { AdapterError } from './errors.mjs';

/**
 * OtaCalendarAdapter — Fase 7 de ATH-OTA-001.
 *
 * Responsabilidad única: convertir un feed .ics de Airbnb/Booking en
 * operaciones de bloqueo/liberación idempotentes sobre unidades internas,
 * aplicando la regla CASA COMPLETA <-> habitaciones (Fase 6) y dejando en
 * cola cualquier cosa que no pueda resolver con certeza (Fase 7).
 *
 * Explícitamente NO hace:
 *  - no calcula tarifas, impuestos ni facturación (Fase 5/8);
 *  - no confirma ni cancela reservas internas válidas — si detecta que un
 *    bloqueo entrante choca con una reserva interna, lo manda a la cola de
 *    conflictos en vez de sobreescribir;
 *  - no se conecta a feeds reales (eso lo decide un humano fuera de este
 *    módulo, pasando la URL real al llamador).
 */
export class OtaCalendarAdapter {
  /**
   * @param {object} deps
   * @param {import('./unit-mapping.mjs').UnitMappingRegistry} deps.mappingRegistry
   * @param {import('./inventory-sink.mjs').InventorySink} deps.sink
   * @param {import('./conflict-queue.mjs').ConflictQueue} deps.conflictQueue
   * @param {{hasConflict(unitId: string, startDate: string, endDate: string, excludeExternalEventId?: string): boolean}} [deps.internalReservationChecker]
   *   Puerto opcional hacia "¿esta unidad tiene una reserva interna válida en
   *   este rango?". Sin conexión real a Odoo todavía (Fase 7), por defecto
   *   asume que no hay información y nunca bloquea por este motivo — ver
   *   docs/ota/ATH-OTA-001-PENDIENTES-HUMANOS.md.
   */
  constructor({ mappingRegistry, sink, conflictQueue, internalReservationChecker = null }) {
    this.mappingRegistry = mappingRegistry;
    this.sink = sink;
    this.conflictQueue = conflictQueue;
    this.internalReservationChecker = internalReservationChecker;

    /** @type {Map<string, import('./normalize.mjs').DomainEvent>} externalEventId -> último estado aplicado */
    this._appliedState = new Map();
    /** @type {Array<object>} bitácora de cada operación, éxito o error (Fase 7: "auditar cada operación") */
    this.auditLog = [];
  }

  /**
   * Sincroniza un feed completo de una fuente+listing.
   * Idempotente: reprocesar el mismo texto .ics no produce efectos nuevos.
   * @returns {{created: string[], updated: string[], cancelled: string[], skipped: string[], conflicts: object[]}}
   */
  sync(icsText, { source, listingId }) {
    const result = { created: [], updated: [], cancelled: [], skipped: [], conflicts: [] };

    const mapping = this.mappingRegistry.resolve(source, listingId);
    if (!mapping) {
      const conflict = this.conflictQueue.push({
        type: 'UNMAPPED_LISTING',
        source,
        listingId,
        reason: 'No existe mapeo CONFIRMADO en la matriz para este listing',
      });
      this._audit({ op: 'sync', source, listingId, result: 'error', errorCode: 'UNMAPPED_LISTING' });
      result.conflicts.push(conflict);
      return result;
    }

    let rawEvents;
    try {
      rawEvents = parseIcal(icsText);
    } catch (err) {
      this._audit({ op: 'sync', source, listingId, result: 'error', errorCode: err.code ?? 'ICAL_PARSE_ERROR' });
      throw err;
    }

    for (const rawEvent of rawEvents) {
      this._applyOne(rawEvent, { source, listingId, mapping }, result);
    }

    return result;
  }

  _applyOne(rawEvent, { source, listingId, mapping }, result) {
    let domainEvent;
    try {
      domainEvent = normalizeEvent(rawEvent, { source, listingId });
    } catch (err) {
      this._audit({ op: 'apply_event', source, listingId, uid: rawEvent.uid, result: 'error', errorCode: err.code ?? 'NORMALIZE_ERROR' });
      const conflict = this.conflictQueue.push({
        type: 'MALFORMED_EVENT',
        source,
        listingId,
        uid: rawEvent.uid,
        reason: err.message,
      });
      result.conflicts.push(conflict);
      return;
    }

    const previous = this._appliedState.get(domainEvent.externalEventId);

    // Idempotencia: mismo evento, mismo contenido -> no-op.
    if (previous && sameContent(previous, domainEvent)) {
      result.skipped.push(domainEvent.externalEventId);
      this._audit({ op: 'apply_event', ...eventAuditFields(domainEvent), result: 'skipped_idempotent' });
      return;
    }

    if (domainEvent.status === 'CANCELLED') {
      this._release(domainEvent, mapping);
      result.cancelled.push(domainEvent.externalEventId);
      this._audit({ op: 'cancel', ...eventAuditFields(domainEvent), result: 'ok' });
      return;
    }

    const blockGroup = mapping.blockGroup.length > 0 ? mapping.blockGroup : [mapping.unitId];

    for (const unitId of blockGroup) {
      const collision = this._detectCollision(unitId, domainEvent);
      if (collision) {
        const conflict = this.conflictQueue.push({
          type: collision.type,
          source,
          listingId,
          unitId,
          externalEventId: domainEvent.externalEventId,
          startDate: domainEvent.startDate,
          endDate: domainEvent.endDate,
          conflictsWith: collision.with,
        });
        this._audit({ op: 'apply_event', ...eventAuditFields(domainEvent), unitId, result: 'conflict', errorCode: collision.type });
        result.conflicts.push(conflict);
        return; // No se aplica ningún bloqueo de este evento si una sola unidad del grupo choca.
      }
    }

    for (const unitId of blockGroup) {
      this.sink.block({
        unitId,
        startDate: domainEvent.startDate,
        endDate: domainEvent.endDate,
        externalEventId: domainEvent.externalEventId,
        reason: `${source}:${listingId}`,
      });
    }

    this._appliedState.set(domainEvent.externalEventId, { ...domainEvent, blockGroup });
    if (previous) {
      result.updated.push(domainEvent.externalEventId);
      this._audit({ op: 'update', ...eventAuditFields(domainEvent), result: 'ok' });
    } else {
      result.created.push(domainEvent.externalEventId);
      this._audit({ op: 'create', ...eventAuditFields(domainEvent), result: 'ok' });
    }
  }

  _release(domainEvent, mapping) {
    const previous = this._appliedState.get(domainEvent.externalEventId);
    const blockGroup = previous?.blockGroup ?? (mapping.blockGroup.length > 0 ? mapping.blockGroup : [mapping.unitId]);
    for (const unitId of blockGroup) {
      this.sink.release({ unitId, externalEventId: domainEvent.externalEventId });
    }
    this._appliedState.set(domainEvent.externalEventId, domainEvent);
  }

  /**
   * Colisión = otro evento externo (distinto UID) con rango solapado ya
   * aplicado sobre la misma unidad, o una reserva interna válida detectada
   * por internalReservationChecker. Habitaciones hermanas compatibles no se
   * consultan aquí porque no comparten blockGroup (Fase 6).
   */
  _detectCollision(unitId, domainEvent) {
    if (this.internalReservationChecker?.hasConflict(unitId, domainEvent.startDate, domainEvent.endDate, domainEvent.externalEventId)) {
      return { type: 'INTERNAL_RESERVATION_CONFLICT', with: 'odoo_internal' };
    }

    for (const [externalEventId, applied] of this._appliedState.entries()) {
      if (externalEventId === domainEvent.externalEventId) continue;
      if (applied.status === 'CANCELLED') continue;
      if (!applied.blockGroup?.includes(unitId)) continue;
      if (rangesOverlap(domainEvent.startDate, domainEvent.endDate, applied.startDate, applied.endDate)) {
        return { type: 'OTA_EVENT_OVERLAP', with: externalEventId };
      }
    }
    return null;
  }

  _audit(entry) {
    this.auditLog.push({ ...entry, at: new Date().toISOString() });
  }
}

function sameContent(a, b) {
  return a.startDate === b.startDate && a.endDate === b.endDate && a.status === b.status;
}

function eventAuditFields(domainEvent) {
  return {
    source: domainEvent.source,
    listingId: domainEvent.listingId,
    externalEventId: domainEvent.externalEventId,
    startDate: domainEvent.startDate,
    endDate: domainEvent.endDate,
    status: domainEvent.status,
  };
}
