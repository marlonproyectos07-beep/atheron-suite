import { ConnectorError } from './errors.mjs';
import { unitForSmoobuApartment, isExcludedApartment } from './unit-map.mjs';

/**
 * ATH-DEV-053 — Vigilancia de sobreventas (Smoobu `type: "OverBooking"`). Solo lectura.
 *
 * Hecho comprobado (ATH-DEV-052, run #20): una reserva que Smoobu marca "Overbooking" existe en la API con
 * `type: "OverBooking"` (GET /api/reservations/{id} -> HTTP 200), pero GET /api/reservations NO la devuelve.
 * Por eso el listado NO es exhaustivo para sobreventas y no se puede detectar una sobreventa desconocida desde la API.
 *
 * Mecanismo:
 *  - Lista de vigilancia de ids AUTORIZADOS en codigo (empieza solo con 160829171). El entorno solo puede elegir
 *    un subconjunto (OVERBOOKING_WATCH_IDS), nunca anadir ids nuevos.
 *  - Una lectura GET individual por id vigilado (tope MAX_WATCH_READS), sin reintentos; un error no detiene el resto.
 *  - Si el tipo es OverBooking -> alerta de REVISION MANUAL. Nunca se propone pedido, turno, cancelacion ni cambio.
 */
export const AUTHORIZED_WATCH_IDS = Object.freeze(new Set([160829171]));
export const MAX_WATCH_READS = 5;
export const WATCH_STATUS = Object.freeze({
  OVERBOOKING_ALERT: 'OVERBOOKING_ALERT', NOT_OVERBOOKING: 'NOT_OVERBOOKING', CANCELLED: 'CANCELLED',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE', NOT_FOUND: 'NOT_FOUND', READ_ERROR: 'READ_ERROR',
});

export const isOverbookingType = (t) => typeof t === 'string' && /^over[\s_-]?booking$/i.test(t.trim());

/**
 * Ids a vigilar. Sin variable -> todos los autorizados. 'none' -> ninguno.
 * Cualquier id fuera de la lista autorizada, mal formado o en exceso -> error (no se lee nada).
 */
export function resolveWatchIds(env = process.env, { authorized = AUTHORIZED_WATCH_IDS, max = MAX_WATCH_READS } = {}) {
  const raw = typeof env.OVERBOOKING_WATCH_IDS === 'string' ? env.OVERBOOKING_WATCH_IDS.trim() : '';
  if (!raw) return [...authorized].sort((a, b) => a - b).slice(0, max);
  if (raw.toLowerCase() === 'none') return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.every((p) => /^\d{6,12}$/.test(p))) throw new ConnectorError('WATCH_ID_INVALID');
  const ids = [...new Set(parts.map(Number))];
  if (!ids.every((id) => authorized.has(id))) throw new ConnectorError('WATCH_ID_NOT_AUTHORIZED');
  if (ids.length > max) throw new ConnectorError('WATCH_TOO_MANY');
  return ids.sort((a, b) => a - b);
}

function statusOfType(type) {
  if (isOverbookingType(type)) return WATCH_STATUS.OVERBOOKING_ALERT;
  if (type === 'cancellation') return WATCH_STATUS.CANCELLED;
  if (type === 'reservation' || type === 'modification of booking') return WATCH_STATUS.NOT_OVERBOOKING;
  return WATCH_STATUS.UNKNOWN_TYPE;
}

/** Campos tecnicos de una reserva (sin datos del huesped). */
function technical(r) {
  const apt = Number(r?.apartment?.id);
  const unit = unitForSmoobuApartment(apt);
  return {
    type: typeof r?.type === 'string' ? r.type : null,
    apartmentId: Number.isInteger(apt) ? apt : null,
    unit: isExcludedApartment(apt) ? 'EXCLUIDA' : (unit?.unit ?? null),
    arrival: String(r?.arrival ?? '').slice(0, 10) || null,
    departure: String(r?.departure ?? '').slice(0, 10) || null,
    channelId: Number.isInteger(Number(r?.channel?.id)) ? Number(r.channel.id) : null,
  };
}

/**
 * Lee la lista de vigilancia. `listed` = reservas ya devueltas por el listado (por id): si un id vigilado ya vino en el
 * listado no se repite la lectura. Devuelve una entrada por id, en orden, con `manualReview` para las sobreventas.
 */
export async function readWatchlist(smoobu, ids, { listed = new Map(), max = MAX_WATCH_READS } = {}) {
  const unique = [...new Set(ids.map(Number))];
  if (unique.length > max) throw new ConnectorError('WATCH_TOO_MANY');
  const entries = [];
  let requests = 0;
  for (const id of unique) {
    let base;
    if (listed.has(id)) {
      base = { smoobuId: id, source: 'LISTADO', httpStatus: null, ...technical(listed.get(id)) };
      base.status = statusOfType(base.type);
    } else {
      requests += 1;
      try {
        const r = await smoobu.getReservation(id);
        base = { smoobuId: id, source: 'GET_INDIVIDUAL', httpStatus: 200, ...technical(r) };
        base.status = statusOfType(base.type);
      } catch (e) {
        base = { smoobuId: id, source: 'GET_INDIVIDUAL', httpStatus: e.status ?? null, code: e.code ?? 'UNKNOWN', type: null, apartmentId: null, unit: null, arrival: null, departure: null, channelId: null,
          status: e.status === 404 ? WATCH_STATUS.NOT_FOUND : WATCH_STATUS.READ_ERROR };
      }
    }
    entries.push({ ...base,
      missingFromList: !listed.has(id),
      manualReview: base.status === WATCH_STATUS.OVERBOOKING_ALERT ? 'REVISION_MANUAL_SOBREVENTA' : null,
      automaticAction: 'NINGUNA', writesEnabled: false });
  }
  const count = (s) => entries.filter((e) => e.status === s).length;
  return { requests, entries, alerts: count(WATCH_STATUS.OVERBOOKING_ALERT), errors: count(WATCH_STATUS.READ_ERROR), notFound: count(WATCH_STATUS.NOT_FOUND) };
}
