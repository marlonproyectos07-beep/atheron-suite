/**
 * ATH-DISP-001 — acceso de recepción por PIN propio de cada operador.
 *
 * - Un PIN por operador. Se guarda solo el hash (scrypt) en la variable de
 *   entorno del servidor HOTEL_RECEPTION_OPERATORS. Nunca en el repo, ni en
 *   el navegador, ni en Odoo.
 * - Sesión en cookie firmada (HMAC-SHA256) con HOTEL_RECEPTION_SESSION_SECRET.
 * - Bloqueo temporal tras varios intentos fallidos por operador.
 * - No crea usuarios Odoo: la identidad del operador vive aquí.
 */

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEY_LEN = 32;
const PIN_RE = /^\d{6,8}$/;

export const OPERATOR_IDS = Object.freeze(['marlon', 'angela', 'hermarit', 'otro']);
export const OPERATOR_NAMES = Object.freeze({ marlon: 'Marlon', angela: 'Ángela', hermarit: 'Hermarit', otro: 'Otro' });
export const SESSION_TTL_MS = 10 * 60 * 60 * 1000;
export const COOKIE_NAME = 'atheron_recepcion';

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && PIN_RE.test(pin);
}

/** Hash con sal aleatoria: `scrypt$<saltHex>$<hashHex>`. */
export async function hashPin(pin, salt = randomBytes(16)) {
  if (!isValidPinFormat(pin)) throw new Error('PIN_FORMAT_INVALID');
  const derived = await scrypt(pin, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPin(pin, stored) {
  if (!isValidPinFormat(pin) || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (expected.length !== KEY_LEN) return false;
  const actual = await scrypt(pin, salt, KEY_LEN);
  return timingSafeEqual(actual, expected);
}

/**
 * Lee el roster desde JSON: [{ "id": "marlon", "pinHash": "scrypt$..." }, ...].
 * Lanza error si falta un operador, hay ids desconocidos o un hash mal formado.
 */
export function parseRoster(json) {
  let list;
  try {
    list = JSON.parse(json);
  } catch {
    throw new Error('ROSTER_INVALID_JSON');
  }
  // Acepta el arreglo directo o el formato del almacén: {"operators":[...]}.
  if (list && !Array.isArray(list) && Array.isArray(list.operators)) list = list.operators;
  if (!Array.isArray(list)) throw new Error('ROSTER_NOT_ARRAY');
  const byId = new Map();
  for (const item of list) {
    if (!item || !OPERATOR_IDS.includes(item.id)) throw new Error('ROSTER_UNKNOWN_OPERATOR');
    if (typeof item.pinHash !== 'string' || !item.pinHash.startsWith('scrypt$')) throw new Error('ROSTER_HASH_INVALID');
    byId.set(item.id, item.pinHash);
  }
  for (const id of OPERATOR_IDS) {
    if (!byId.has(id)) throw new Error(`ROSTER_MISSING_${id.toUpperCase()}`);
  }
  return byId;
}

/** Bloqueo por operador tras `max` fallos dentro de `windowMs`. En memoria. */
export class LoginLimiter {
  constructor({ max = 5, windowMs = 15 * 60_000, clock = () => Date.now() } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.clock = clock;
    this.failures = new Map();
  }

  isLocked(key) {
    const now = this.clock();
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (now - entry.first > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.max;
  }

  recordFailure(key) {
    const now = this.clock();
    const entry = this.failures.get(key);
    if (!entry || now - entry.first > this.windowMs) {
      this.failures.set(key, { count: 1, first: now });
    } else {
      entry.count += 1;
    }
  }

  reset(key) {
    this.failures.delete(key);
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signSession({ operatorId, name, now = Date.now(), ttlMs = SESSION_TTL_MS }, secret) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET_TOO_SHORT');
  const payload = b64url(JSON.stringify({ op: operatorId, name, exp: now + ttlMs }));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Devuelve { operatorId, name } o null si la sesión es inválida o expiró. */
export function verifySession(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest());
  const received = Buffer.from(sig, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!OPERATOR_IDS.includes(data.op) || typeof data.exp !== 'number' || data.exp <= now) return null;
  return { operatorId: data.op, name: String(data.name || OPERATOR_NAMES[data.op]).slice(0, 40) };
}

/** Nombre visible: el operador de la lista, o el nombre escrito para «Otro». */
export function resolveOperatorName(operatorId, typedName) {
  if (operatorId === 'otro') {
    const clean = String(typedName || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
    return clean || null;
  }
  return OPERATOR_NAMES[operatorId];
}
