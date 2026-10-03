/**
 * Reglas comerciales aprobadas por el CEO. Funciones puras, sin red.
 * Nada aqui concede descuentos ni inventa precios: solo calcula sobre el
 * total vigente que entrega Odoo.
 */
import { bogotaToday, diffDays } from './nlu.mjs';

export const DEPOSIT_PCT = 50;
export const CANCEL_NOTICE_HOURS = 48;
export const CREDIT_MONTHS = 6;

/** Anticipo = 50% del total vigente; saldo = lo que queda. Enteros (COP no usa decimales). */
export function computeDeposit(total) {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null;
  const anticipo = Math.round((total * DEPOSIT_PCT) / 100);
  return { pct: DEPOSIT_PCT, anticipo, saldo: total - anticipo };
}

/**
 * Cancelacion/cambio de fecha en reserva DIRECTA.
 * El check-in se toma a las 00:00 (Colombia): es la lectura conservadora, porque
 * cuenta menos horas de aviso y por tanto escala mas casos a un humano.
 * @returns {{kind:'NEED_DATE'|'OTA'|'WITHIN_POLICY'|'EXCEPTION', hours?:number}}
 */
export function cancellationDecision({ checkIn, now, channel }) {
  if (channel === 'booking' || channel === 'airbnb') return { kind: 'OTA', channel };
  if (!checkIn) return { kind: 'NEED_DATE' };
  const checkInTs = Date.parse(`${checkIn}T00:00:00-05:00`);
  const hours = Math.floor((checkInTs - now.getTime()) / 3600000);
  if (hours >= CANCEL_NOTICE_HOURS) return { kind: 'WITHIN_POLICY', hours };
  return { kind: 'EXCEPTION', hours };
}

export { bogotaToday, diffDays };
