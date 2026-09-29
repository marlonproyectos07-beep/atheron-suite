/**
 * Exportador iCal Nivel 1 (Workstream F). Genera un feed VCALENDAR a partir
 * del modelo de inventario (inventory-model.mjs), con el bloqueo cruzado ya
 * aplicado. Funcion pura: no publica nada, no llama red, no toca NOBEDS.
 */

import { calendarFor } from './inventory-model.mjs';

function toIcsDate(dateStr) {
  return dateStr.replaceAll('-', '');
}

function foldLine(line) {
  // RFC 5545: lineas > 75 octetos se pliegan. Nuestros valores son cortos,
  // pero se deja el helper para no violar el estandar si crecen.
  if (line.length <= 75) return line;
  const chunks = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

/** Agrupa fechas ocupadas consecutivas en rangos [start, endExclusive). */
export function coalesceOccupiedRanges(calendarDays) {
  const ranges = [];
  let current = null;
  for (const day of calendarDays) {
    if (!day.occupied) {
      current = null;
      continue;
    }
    const nextDay = new Date(`${day.date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayStr = nextDay.toISOString().slice(0, 10);

    if (current && current.end === day.date) {
      current.end = nextDayStr;
      current.reasons.add(day.reason);
    } else {
      current = { start: day.date, end: nextDayStr, reasons: new Set([day.reason]) };
      ranges.push(current);
    }
  }
  return ranges.map((r) => ({ start: r.start, end: r.end, reasons: [...r.reasons] }));
}

/**
 * Construye el texto ICS para `unit` entre `from` (incl.) y `to` (excl.).
 * `stamp` es inyectable para tests deterministas (por defecto usa el reloj
 * real solo fuera de tests).
 */
export function buildIcalFeed(bookings, unit, { from, to, prodId = '-//Atheron Hotels//Nivel1 iCal//ES', stamp } = {}) {
  const days = calendarFor(bookings, unit, { from, to });
  const ranges = coalesceOccupiedRanges(days);
  const dtstamp = toIcsDate(stamp ?? new Date().toISOString().slice(0, 10)) + 'T000000Z';

  const events = ranges.map((range, idx) => {
    const uid = `atheron-${unit}-${toIcsDate(range.start)}-${toIcsDate(range.end)}@nivel1.local`;
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(range.start)}`,
      `DTEND;VALUE=DATE:${toIcsDate(range.end)}`,
      foldLine(`SUMMARY:Bloqueado (${range.reasons.join(',')})`),
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    `X-ATHERON-UNIT:${unit}`,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
