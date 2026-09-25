import { AdapterError } from './errors.mjs';

/**
 * Parser mínimo de iCalendar (RFC 5545) para VEVENT.
 * Sin dependencias externas, a propósito: el gateway HOTEL-007 (rama
 * feature/ath-odoo-hotel-007-gateway) sigue el mismo criterio de cero
 * dependencias para el código que toca inventario/reservas.
 *
 * Cubre solo lo que Airbnb/Booking exponen en sus feeds públicos de
 * disponibilidad: UID, DTSTART, DTEND, STATUS, SUMMARY, DTSTAMP,
 * LAST-MODIFIED. No interpreta RRULE (los feeds de disponibilidad de OTA
 * no las usan: cada bloqueo es un VEVENT independiente).
 */

function unfoldLines(raw) {
  const rawLines = raw.replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim() !== '') {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseContentLine(line) {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    throw new AdapterError('ICAL_MALFORMED_LINE', `Línea sin ':' — ${line.slice(0, 40)}`);
  }
  const head = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...paramParts] = head.split(';');
  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Convierte DTSTART/DTEND/DTSTAMP/LAST-MODIFIED al formato interno:
 * { raw, isAllDay, isoDate } donde isoDate es 'YYYY-MM-DD' para todo el día
 * o un ISO 8601 completo si trae hora.
 */
function parseIcalDate(field) {
  const { params, value } = field;
  const isAllDay = params.VALUE === 'DATE' || /^\d{8}$/.test(value);
  if (isAllDay) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (!m) throw new AdapterError('ICAL_MALFORMED_DATE', `Fecha DATE inválida: ${value}`);
    return { raw: value, isAllDay: true, isoDate: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!m) throw new AdapterError('ICAL_MALFORMED_DATE', `Fecha DATE-TIME inválida: ${value}`);
  const [, y, mo, d, h, mi, s, z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
  return { raw: value, isAllDay: false, isoDate: iso, tzid: params.TZID };
}

/**
 * Parsea un calendario iCal completo y devuelve la lista de VEVENT crudos
 * (sin mapear todavía a unidad interna — eso lo hace el adapter).
 */
export function parseIcal(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new AdapterError('ICAL_EMPTY', 'El feed iCal está vacío');
  }
  const lines = unfoldLines(raw);
  const events = [];
  let current = null;

  for (const line of lines) {
    const { name, params, value } = parseContentLine(line);

    if (name === 'BEGIN' && value === 'VEVENT') {
      current = {};
      continue;
    }
    if (name === 'END' && value === 'VEVENT') {
      if (!current) {
        throw new AdapterError('ICAL_MALFORMED_LINE', 'END:VEVENT sin BEGIN:VEVENT');
      }
      if (!current.uid) {
        throw new AdapterError('ICAL_MISSING_UID', 'VEVENT sin UID');
      }
      if (!current.dtstart) {
        throw new AdapterError('ICAL_MISSING_DTSTART', `VEVENT ${current.uid} sin DTSTART`);
      }
      events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    switch (name) {
      case 'UID':
        current.uid = value.trim();
        break;
      case 'DTSTART':
        current.dtstart = parseIcalDate({ params, value });
        break;
      case 'DTEND':
        current.dtend = parseIcalDate({ params, value });
        break;
      case 'DTSTAMP':
        current.dtstamp = parseIcalDate({ params, value });
        break;
      case 'LAST-MODIFIED':
        current.lastModified = parseIcalDate({ params, value });
        break;
      case 'STATUS':
        current.status = value.trim().toUpperCase();
        break;
      case 'SUMMARY':
        current.summary = unescapeText(value.trim());
        break;
      case 'SEQUENCE':
        current.sequence = Number.parseInt(value.trim(), 10);
        break;
      default:
        // Campos no usados (DESCRIPTION, ORGANIZER, etc.) se ignoran a propósito:
        // Fase 8 prohíbe expresamente propagar datos privados del huésped.
        break;
    }
  }

  if (current) {
    throw new AdapterError('ICAL_UNTERMINATED_VEVENT', 'BEGIN:VEVENT sin END:VEVENT correspondiente');
  }

  return events;
}
