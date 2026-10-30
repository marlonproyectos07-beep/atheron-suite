import { UNITS, unitForSmoobuApartment } from './unit-map.mjs';
import { TARGET_RESERVATION } from './diagnose.mjs';

/** ATH-DEV-028 — resumen SANEADO de una pagina de reservas Smoobu. Solo campos tecnicos; nunca huespedes, contactos ni precios. */
export const WINDOW = Object.freeze({ from: '2026-10-26', to: '2026-10-27' });
export const EXCLUDED_APARTMENTS = Object.freeze([3567496]); // Carrera 19
const MAX_LISTED = 60;
const scalar = (v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null);
const dateOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function summarizeReservationsPage(data) {
  const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
  const rows = bookings.map((b) => {
    const aptId = Number(b?.apartment?.id);
    const unit = unitForSmoobuApartment(aptId);
    return {
      id: Number(b?.id) || null, type: scalar(b?.type), arrival: dateOnly(b?.arrival), departure: dateOnly(b?.departure),
      apartmentId: Number.isInteger(aptId) ? aptId : null, unit: unit?.unit ?? null, roleId: unit?.odooRoleId ?? null,
      excluded: EXCLUDED_APARTMENTS.includes(aptId), inUnitMap: Boolean(unit),
      channelId: scalar(b?.channel?.id), blocked: typeof b?.['is-blocked-booking'] === 'boolean' ? b['is-blocked-booking'] : null,
    };
  });
  const byType = {}; for (const r of rows) byType[r.type ?? 'null'] = (byType[r.type ?? 'null'] ?? 0) + 1;
  const pilot = rows.find((r) => r.id === TARGET_RESERVATION) ?? null;
  return {
    result: 'LECTURA_OK', page: scalar(data?.page), pageCount: scalar(data?.page_count), pageSize: scalar(data?.page_size), totalItems: scalar(data?.total_items),
    topLevelKeys: Object.keys(data ?? {}).sort(), bookingKeys: bookings[0] ? Object.keys(bookings[0]).sort() : [],
    reservationsReturned: rows.length, byType,
    inUnitMap: rows.filter((r) => r.inUnitMap).length, excludedCarrera19: rows.filter((r) => r.excluded).length, unmapped: rows.filter((r) => !r.inUnitMap && !r.excluded).length,
    mapUnits: UNITS.map((u) => u.unit),
    pilot: { id: TARGET_RESERVATION, found: Boolean(pilot), ...(pilot ? { type: pilot.type, arrival: pilot.arrival, departure: pilot.departure, apartmentId: pilot.apartmentId, unit: pilot.unit, roleId: pilot.roleId } : {}) },
    listed: rows.slice(0, MAX_LISTED), listedTruncated: rows.length > MAX_LISTED,
  };
}
