import { BEDS24_PROPERTY_ID, BEDS24_ROOM_UNITS, CASA_UNIT } from './config.mjs';

/**
 * Adaptador Beds24 SOLO LECTURA (ATH-OPS-DASHBOARD-001).
 * Garantías: (1) el transporte rechaza todo método distinto de GET; (2) solo admite rutas de lectura de una lista cerrada;
 * (3) los errores llevan código, nunca el cuerpo de la respuesta ni el token; (4) no pide ni usa write:bookings.
 * Los nombres de campos de la API v2 son HIPÓTESIS hasta la primera lectura real autorizada (ver AI/ATH-OPS-DASHBOARD-001.md §6).
 */
export const BEDS24_BASE_URL = 'https://beds24.com/api/v2';
export const ALLOWED_GET_PATHS = Object.freeze(['/bookings', '/inventory/rooms/calendar', '/properties', '/inventory/rooms']);

export class OpsReadError extends Error {
  constructor(code, { status = null } = {}) { super(code); this.name = 'OpsReadError'; this.code = code; this.status = status; }
}

export function createReadOnlyTransport({ fetchImpl = globalThis.fetch, baseUrl = BEDS24_BASE_URL, token } = {}) {
  return Object.freeze({
    readOnly: true,
    async request({ method = 'GET', path, query = {} } = {}) {
      if (String(method).toUpperCase() !== 'GET') throw new OpsReadError('BEDS24_WRITE_FORBIDDEN');
      if (!ALLOWED_GET_PATHS.includes(path)) throw new OpsReadError('BEDS24_PATH_NOT_ALLOWED');
      if (typeof token !== 'string' || token.length === 0) throw new OpsReadError('BEDS24_TOKEN_MISSING');
      if (typeof fetchImpl !== 'function') throw new OpsReadError('BEDS24_FETCH_UNAVAILABLE');
      const url = new URL(baseUrl + path);
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      let res;
      try { res = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', token } }); }
      catch { throw new OpsReadError('BEDS24_NETWORK_ERROR'); }
      if (res.status === 429) throw new OpsReadError('BEDS24_RATE_LIMITED', { status: 429 });
      if (!res.ok) throw new OpsReadError('BEDS24_HTTP_ERROR', { status: res.status });
      try { return await res.json(); } catch { throw new OpsReadError('BEDS24_RESPONSE_INVALID'); }
    },
  });
}

export class Beds24ReadOnlyClient {
  constructor({ transport, propertyId = BEDS24_PROPERTY_ID, maxPages = 50 } = {}) {
    if (transport?.readOnly !== true) throw new OpsReadError('READ_ONLY_TRANSPORT_REQUIRED');
    this.transport = transport; this.propertyId = propertyId; this.maxPages = maxPages;
  }

  /** Reservas que tocan [from, to]: sale >= from y llega <= to. Pagina hasta agotar. */
  async listBookings({ from, to }) {
    const out = [];
    for (let page = 1; page <= this.maxPages; page += 1) {
      const body = await this.transport.request({
        path: '/bookings',
        query: { propertyId: this.propertyId, departureFrom: from, arrivalTo: to, includeInvoiceItems: true, page },
      });
      if (!body || !Array.isArray(body.data)) throw new OpsReadError('BEDS24_RESPONSE_INVALID');
      out.push(...body.data);
      if (body.pages?.nextPageExists !== true) return out;
    }
    throw new OpsReadError('BEDS24_TOO_MANY_PAGES');
  }

  /** Calendario de habitación (cierres/disponibilidad). Solo lectura. */
  getCalendar({ roomId, from, to }) {
    return this.transport.request({ path: '/inventory/rooms/calendar', query: { roomId, startDate: from, endDate: to } });
  }
}

// ---------------------------------------------------------------- normalización

export const STATUS = Object.freeze({
  CONFIRMED: 'CONFIRMED', PENDING: 'PENDING', HOLD: 'HOLD', CANCELLED: 'CANCELLED', BLACKOUT: 'BLACKOUT', INQUIRY: 'INQUIRY', UNKNOWN: 'UNKNOWN',
});
/** HIPÓTESIS: new/request ocupan calendario pero no son «confirmadas». Verificar con datos reales. */
const STATUS_MAP = { confirmed: 'CONFIRMED', new: 'PENDING', request: 'PENDING', cancelled: 'CANCELLED', canceled: 'CANCELLED', black: 'BLACKOUT', inquiry: 'INQUIRY' };
const HOLD_NOTE = /HOLD\s+hasta\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/i;
const STAY_TAG = /ATH-STAY-[A-Z0-9]+(?:-[A-Z0-9]+)*/i;

function sourceOf(raw) {
  const s = `${raw.channel ?? ''} ${raw.apiSource ?? ''} ${raw.referer ?? ''}`.toLowerCase();
  if (s.includes('booking')) return 'BOOKING';
  if (s.includes('airbnb')) return 'AIRBNB';
  return 'DIRECT';
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Convierte una reserva Beds24 v2 en el registro neutro del tablero. No conserva email ni teléfono. */
export function normalizeBeds24Booking(raw, { roomUnits = BEDS24_ROOM_UNITS } = {}) {
  const notes = [raw.notes, raw.comments].filter((x) => typeof x === 'string' && x).join(' | ');
  const unit = roomUnits[String(raw.roomId)] ?? null;
  let status = STATUS_MAP[String(raw.status ?? '').toLowerCase()] ?? STATUS.UNKNOWN;
  const hold = HOLD_NOTE.exec(notes);
  const holdExpires = hold ? `${hold[1]}${hold[2] ? ` ${hold[2]}` : ''}` : null;
  if (hold && (status === 'CONFIRMED' || status === 'PENDING')) status = STATUS.HOLD;

  const items = Array.isArray(raw.invoiceItems) ? raw.invoiceItems : [];
  const lineTotal = (i) => (i.lineTotal != null ? num(i.lineTotal) : num(i.qty ?? 1) * num(i.amount));
  const charges = items.filter((i) => String(i.type ?? 'charge').toLowerCase() === 'charge');
  const chargeTotal = items.length ? charges.reduce((a, i) => a + lineTotal(i), 0) : num(raw.price);
  // HIPÓTESIS: los pagos son líneas type=payment con importe positivo.
  const payments = items.filter((i) => String(i.type).toLowerCase() === 'payment')
    .map((i) => ({ id: String(i.id), amount: Math.abs(lineTotal(i)), date: i.createdAt ?? i.date ?? null, status: 'PAYMENT_REPORTED' }));

  return {
    bookingId: String(raw.id),
    masterId: raw.masterId != null && String(raw.masterId) !== String(raw.id) ? String(raw.masterId) : null,
    externalRef: raw.apiReference ?? null,
    source: sourceOf(raw),
    status, unit, isCasa: unit === CASA_UNIT, roomId: String(raw.roomId ?? ''),
    checkin: raw.arrival ?? null, checkout: raw.departure ?? null,
    guests: num(raw.numAdult) + num(raw.numChild),
    guest: [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() || String(raw.title ?? '').trim() || null,
    chargeTotal, payments, notes,
    holdExpires,
    masterStayRef: (STAY_TAG.exec(`${raw.apiReference ?? ''} ${notes}`)?.[0] ?? '').toUpperCase() || null,
  };
}
