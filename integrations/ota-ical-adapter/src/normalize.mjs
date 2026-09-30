import { AdapterError } from './errors.mjs';

/**
 * Convierte un VEVENT crudo (salida de ical-parser.mjs) en un DomainEvent
 * estable, independiente del formato de origen (Airbnb y Booking difieren
 * en cómo marcan cancelaciones y en si usan STATUS o "removido del feed").
 *
 * DomainEvent:
 *  { externalUid, source, listingId, externalEventId, startDate, endDate,
 *    status, lastModifiedIso, isAllDay, summary }
 *
 * `endDate` sigue la convención iCal: exclusivo (DTEND es la noche en la que
 * la unidad vuelve a estar libre), igual que Odoo la usa para
 * disponibilidad/HOLD (Fase 6 de ATH-OTA-001).
 */
export function normalizeEvent(rawEvent, { source, listingId }) {
  const { uid, dtstart, dtend, status, lastModified, dtstamp, summary } = rawEvent;

  if (!dtend) {
    // Algunos feeds de disponibilidad (ambos, Airbnb y Booking) solo mandan
    // DTSTART para bloqueos de una sola noche. Tratamos DTEND ausente como
    // "un día" (DTSTART + 1) para no perder el evento.
    if (!dtstart.isAllDay) {
      throw new AdapterError('ICAL_MISSING_DTEND', `VEVENT ${uid} sin DTEND y no es de día completo`);
    }
  }

  const startDate = dtstart.isoDate;
  const endDate = dtend ? dtend.isoDate : addOneDay(dtstart.isoDate);

  if (dtstart.isAllDay && endDate <= startDate) {
    throw new AdapterError('ICAL_INVALID_RANGE', `VEVENT ${uid}: DTEND (${endDate}) no es posterior a DTSTART (${startDate})`);
  }

  const normalizedStatus = normalizeStatus(status);
  const lastModifiedIso = (lastModified ?? dtstamp)?.isoDate ?? null;

  return {
    externalUid: uid,
    source,
    listingId,
    externalEventId: `${source}:${listingId}:${uid}`,
    startDate,
    endDate,
    status: normalizedStatus,
    lastModifiedIso,
    isAllDay: dtstart.isAllDay,
    summary: summary ?? null,
  };
}

function normalizeStatus(status) {
  if (!status) return 'CONFIRMED';
  const upper = status.toUpperCase();
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED';
  if (upper === 'TENTATIVE') return 'TENTATIVE';
  return 'CONFIRMED';
}

function addOneDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function rangesOverlap(startA, endA, startB, endB) {
  // Half-open [start, end): se solapan si empiezan antes de que el otro termine.
  return startA < endB && startB < endA;
}
