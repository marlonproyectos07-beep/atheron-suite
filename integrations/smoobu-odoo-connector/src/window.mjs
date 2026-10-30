import { ConnectorError } from './errors.mjs';

/**
 * ATH-DEV-041 — Ventana de conciliacion configurable y validada. Pura, sin red.
 *
 * Una ventana es un rango de NOCHES [from, to] (ambas inclusive, fechas de calendario YYYY-MM-DD).
 * Una estancia arrival -> departure ocupa las noches arrival .. departure-1.
 *
 * Sin parametros se usa la ventana historica de ATH-DEV-029/033 (26..27 oct) con EXACTAMENTE los mismos
 * rangos de Odoo que estaban fijos en scripts/reconcile-window.mjs: es la prueba de regresion.
 */
export const LEGACY_WINDOW = Object.freeze({
  from: '2026-10-26',
  to: '2026-10-27',
  // valores que estaban fijos en reconcile-window.mjs (ATH-DEV-029/033); no se derivan, se conservan tal cual
  odooSlotRange: Object.freeze({ start: '2026-10-17 00:00:00', end: '2026-11-02 00:00:00' }),
  availabilityRange: Object.freeze({ from: '2026-10-25', to: '2026-10-28' }),
});

/** Tope de noches por ejecucion: evita lecturas masivas. 28-oct-2026 -> 05-ene-2027 son 70 noches. */
export const MAX_WINDOW_NIGHTS = 120;
/** Fechas fuera de este rango se rechazan (errores de tipeo como 2207 o 1926). */
export const MIN_DATE = '2025-01-01';
export const MAX_DATE = '2028-12-31';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

/** true solo para fechas de calendario reales con formato YYYY-MM-DD (rechaza 2026-02-30). */
export function isIsoDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const nightsBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** Lista de noches [from..to] inclusive. */
export function nightsOf(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Valida una ventana explicita. Lanza ConnectorError con codigo legible (nunca adivina ni corrige fechas).
 * Devuelve la ventana y los rangos derivados para Smoobu y Odoo (mismo intervalo relevante en ambos).
 */
export function validateWindow({ from, to }, { maxNights = MAX_WINDOW_NIGHTS } = {}) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new ConnectorError('WINDOW_INVALID_DATE');
  if (from < MIN_DATE || to > MAX_DATE) throw new ConnectorError('WINDOW_OUT_OF_RANGE');
  if (to < from) throw new ConnectorError('WINDOW_REVERSED');
  const nights = nightsBetween(from, to);
  if (nights > maxNights) throw new ConnectorError('WINDOW_TOO_LONG');
  return {
    from, to, nights, legacy: false,
    // Smoobu: from/to se comporta como SOLAPAMIENTO de estancia (empirico, ATH-DEV-029); los extremos no estan
    // demostrados, asi que se pide un dia de margen a cada lado y se filtra en memoria por noches.
    smoobuQuery: { from: addDays(from, -1), to: addDays(to, 1) },
    // Odoo: turnos que se solapan con las noches de la ventana. Un turno de la noche D va de D 20:00Z a D+1 16:00Z;
    // el margen de un dia captura tambien los turnos manuales 12:00 -> 12:00.
    odooSlotRange: { start: `${addDays(from, -1)} 00:00:00`, end: `${addDays(to, 2)} 00:00:00` },
    availabilityRange: { from, to },
    // pedidos de Odoo con fechas que tocan la ventana
    orderRange: { checkinOnOrBefore: to, checkoutAfter: from },
  };
}

/**
 * Lee RECONCILE_FROM / RECONCILE_TO del entorno. Sin ninguna de las dos -> ventana historica (regresion).
 * Con solo una -> error (no se completa la otra por inferencia).
 */
export function resolveWindow(env = process.env, opts = {}) {
  const from = typeof env.RECONCILE_FROM === 'string' ? env.RECONCILE_FROM.trim() : '';
  const to = typeof env.RECONCILE_TO === 'string' ? env.RECONCILE_TO.trim() : '';
  if (!from && !to) {
    return {
      from: LEGACY_WINDOW.from, to: LEGACY_WINDOW.to, nights: nightsBetween(LEGACY_WINDOW.from, LEGACY_WINDOW.to), legacy: true,
      smoobuQuery: { from: LEGACY_WINDOW.from, to: LEGACY_WINDOW.to },
      odooSlotRange: { ...LEGACY_WINDOW.odooSlotRange },
      availabilityRange: { ...LEGACY_WINDOW.availabilityRange },
      orderRange: { checkinOnOrBefore: LEGACY_WINDOW.to, checkoutAfter: LEGACY_WINDOW.from },
    };
  }
  if (!from || !to) throw new ConnectorError('WINDOW_INCOMPLETE');
  return validateWindow({ from, to }, opts);
}

/** Noches de una estancia (arrival..departure-1) recortadas a la ventana. */
export function stayNightsInWindow({ arrival, departure }, { from, to }) {
  if (!isIsoDate(arrival) || !isIsoDate(departure) || departure <= arrival) return [];
  const first = arrival > from ? arrival : from;
  const lastNight = addDays(departure, -1);
  const last = lastNight < to ? lastNight : to;
  return first <= last ? nightsOf(first, last) : [];
}
