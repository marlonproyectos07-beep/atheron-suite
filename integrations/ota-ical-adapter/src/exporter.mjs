import { AdapterError } from './errors.mjs';

/**
 * Exportador iCal por unidad — Fase 8.
 *
 * Genera únicamente VEVENT UID/DTSTART/DTEND/STATUS/LAST-MODIFIED. A
 * propósito NO acepta ni escribe teléfono, email, documento, precio ni
 * ningún dato financiero del huésped: la firma de `exportUnitCalendar` ni
 * siquiera recibe esos campos como parámetro, así que no hay manera de que
 * se filtren por error.
 */
export function exportUnitCalendar(unitId, blocks, { now = new Date() } = {}) {
  if (!unitId) {
    throw new AdapterError('EXPORT_MISSING_UNIT', 'unitId es obligatorio para exportar un calendario');
  }
  const stamp = formatDateTimeUtc(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atheron Suite//OTA Calendar Adapter//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const block of blocks) {
    assertBlockShape(block);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(block.externalEventId ?? `${unitId}-${block.startDate}-${block.endDate}`)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(block.startDate)}`,
      `DTEND;VALUE=DATE:${toIcalDate(block.endDate)}`,
      `STATUS:${block.status ?? 'CONFIRMED'}`,
      `LAST-MODIFIED:${block.lastModifiedIso ? formatDateTimeUtc(new Date(block.lastModifiedIso)) : stamp}`,
      'SUMMARY:No disponible',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function assertBlockShape(block) {
  const forbidden = ['phone', 'telefono', 'email', 'correo', 'document', 'documento', 'price', 'precio', 'amount', 'tarifa', 'guestName', 'huesped'];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(block, key)) {
      throw new AdapterError('EXPORT_FORBIDDEN_FIELD', `Campo no permitido en la exportación pública: ${key}`, { key });
    }
  }
  if (!block.startDate || !block.endDate) {
    throw new AdapterError('EXPORT_INVALID_BLOCK', 'Cada bloqueo requiere startDate y endDate');
  }
}

function toIcalDate(isoDate) {
  return isoDate.replaceAll('-', '');
}

function formatDateTimeUtc(date) {
  const iso = date.toISOString(); // 2026-09-25T12:00:00.000Z
  return iso.slice(0, 19).replaceAll(/[-:]/g, '') + 'Z';
}

function escapeText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
