import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ATH-DEV-140 — Autorizacion PRIVADA del piloto aislado de WhatsApp.
 *
 * Los «tokens» APROBADO-PILOTO-WA-... que se ven en GitHub Actions son DESAFIOS PUBLICOS: identifican la operacion y el estado de la
 * reserva, NO son secretos y NO autorizan nada por si solos. Quien lea la ejecucion los conoce.
 *
 * La autorizacion de escritura es un codigo firmado con HMAC-SHA256 con una clave PRIVADA (PILOT_WA_AUTH_KEY) que solo tiene
 * gerencia. El codigo va ligado a: ID de Smoobu + clave de la operacion + huella del estado de la reserva + tipo + caducidad.
 *   AUT-WA-E-<AAAAMMDDTHHMM>-<mac>   ejecutar la prueba (una vez)
 *   AUT-WA-A-<AAAAMMDDTHHMM>-<mac>   segunda aprobacion si la clave de Odoo es de administrador
 *   EXC-WA-<dias>-<AAAAMMDDTHHMM>-<mac>   excepcion de gerencia al margen de 7 dias (1 a 6 dias de anticipacion)
 * Caducan a lo sumo 60 minutos despues de emitirse; si la reserva cambia (precio, fechas, telefono...) la huella cambia y dejan de
 * valer; y el piloto se consume tras un uso. Un codigo filtrado en un log no sirve para otra reserva, ni despues de caducar.
 * Este modulo es puro: no lee entorno, no imprime, no usa red.
 */
export const AUTH_MAX_MINUTES = 60;
export const AUTH_KEY_MIN_LENGTH = 32;
export const LEAD_EXCEPTION_MIN_DAYS = 1;
export const LEAD_EXCEPTION_MAX_DAYS = 6;
const KINDS = new Set(['E', 'A', 'EXC']);

const pad = (n) => String(n).padStart(2, '0');
export const stampOf = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
export function parseStamp(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return Number.isNaN(d.getTime()) || stampOf(d) !== s ? null : d;
}
const validKey = (k) => typeof k === 'string' && k.length >= AUTH_KEY_MIN_LENGTH;
const macOf = (key, { kind, smoobuId, opKey, fp, stamp, days }) =>
  createHmac('sha256', key).update(['ATH-DEV-140', kind, smoobuId, opKey, fp, stamp, days ?? ''].join('|')).digest('hex').slice(0, 32);

/** Emite un codigo. Lo usa SOLO la herramienta local de gerencia (scripts/sync-pilot-wa-autoriza.mjs) y las pruebas. */
export function issuePilotWaAuth({ key, kind, smoobuId, opKey, fp, expires, days = null }) {
  if (!validKey(key)) throw new Error('AUTH_KEY_INVALIDA');
  if (!KINDS.has(kind)) throw new Error('AUTH_KIND_INVALIDO');
  if (kind === 'EXC' && !(Number.isInteger(days) && days >= LEAD_EXCEPTION_MIN_DAYS && days <= LEAD_EXCEPTION_MAX_DAYS)) throw new Error('AUTH_DIAS_FUERA_DE_RANGO');
  const stamp = stampOf(expires);
  const mac = macOf(key, { kind, smoobuId, opKey, fp, stamp, days: kind === 'EXC' ? days : null });
  return kind === 'EXC' ? `EXC-WA-${days}-${stamp}-${mac}` : `AUT-WA-${kind}-${stamp}-${mac}`;
}

/**
 * Verifica un codigo contra la operacion y el estado ACTUAL. Nunca lanza.
 * @returns {{ok:boolean, code:string|null, days?:number}}
 */
export function verifyPilotWaAuth({ key, code, kind, smoobuId, opKey, fp, now }) {
  if (!validKey(key)) return { ok: false, code: 'SIN_CLAVE_DE_AUTORIZACION' };
  if (typeof code !== 'string' || !code) return { ok: false, code: 'AUTORIZACION_AUSENTE' };
  const re = kind === 'EXC' ? /^EXC-WA-([1-6])-(\d{8}T\d{4})-([0-9a-f]{32})$/ : new RegExp(`^AUT-WA-${kind}-(\\d{8}T\\d{4})-([0-9a-f]{32})$`);
  const m = re.exec(code);
  if (!m || !KINDS.has(kind)) return { ok: false, code: 'AUTORIZACION_INVALIDA' };
  const days = kind === 'EXC' ? Number(m[1]) : null;
  const stamp = kind === 'EXC' ? m[2] : m[1];
  const mac = kind === 'EXC' ? m[3] : m[2];
  const expires = parseStamp(stamp);
  const expected = macOf(key, { kind, smoobuId, opKey, fp, stamp, days });
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (!expires || a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: 'AUTORIZACION_INVALIDA' };
  const ms = expires.getTime() - now.getTime();
  if (ms < 0) return { ok: false, code: 'AUTORIZACION_VENCIDA' };
  if (ms > AUTH_MAX_MINUTES * 60000) return { ok: false, code: 'AUTORIZACION_VIGENCIA_EXCESIVA' };
  return kind === 'EXC' ? { ok: true, code: null, days } : { ok: true, code: null };
}
