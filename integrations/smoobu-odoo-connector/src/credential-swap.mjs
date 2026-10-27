import { createHash } from 'node:crypto';

/**
 * ATH-DEV-025 — SIN RED. Decide si SMOOBU_API_KEY y SMOOBU_API_SECRET estan intercambiados comparando la huella
 * SHA-256 (12 primeros caracteres) de cada valor con la huella de REFERENCIA de la clave real visible en Smoobu
 * (patron usr_live_ + 32 hex, 41 caracteres). La referencia es una huella unidireccional, no un secreto.
 * Nunca devuelve valores, prefijos, fragmentos ni huellas calculadas: solo MATCH / NO MATCH y banderas.
 */
export const REFERENCE_FINGERPRINT12 = '5190e872b9e9';
export const KEY_FORMAT = /^usr_live_[0-9a-f]{32}$/;

const fp12 = (v) => createHash('sha256').update(v).digest('hex').slice(0, 12);
const matches = (v, ref) => typeof v === 'string' && v !== '' && (fp12(v) === ref || fp12(v.trim()) === ref);
const formatOk = (v) => typeof v === 'string' && KEY_FORMAT.test(v.trim());

export function checkCredentialSwap(env = process.env, ref = REFERENCE_FINGERPRINT12) {
  const key = env.SMOOBU_API_KEY; const secret = env.SMOOBU_API_SECRET;
  const keyMatch = matches(key, ref); const secretMatch = matches(secret, ref);
  const fmt = [formatOk(key) && 'SMOOBU_API_KEY', formatOk(secret) && 'SMOOBU_API_SECRET'].filter(Boolean);
  let verdict;
  if (secretMatch && !keyMatch) verdict = 'CREDENCIALES PROBABLEMENTE INTERCAMBIADAS';
  else if (keyMatch && !secretMatch) verdict = 'ASIGNACION CORRECTA DE LA CLAVE';
  else if (keyMatch && secretMatch) verdict = 'AMBIGUO: AMBOS COINCIDEN';
  else verdict = 'NINGUNO COINCIDE CON LA HUELLA DE REFERENCIA';
  return { keyMatch, secretMatch, formatCorrect: fmt, verdict };
}

export function renderCredentialSwap(r) {
  return [
    `SMOOBU_API_KEY: ${r.keyMatch ? 'MATCH' : 'NO MATCH'}`,
    `SMOOBU_API_SECRET: ${r.secretMatch ? 'MATCH' : 'NO MATCH'}`,
    `FORMATO_CORRECTO: ${r.formatCorrect.length ? r.formatCorrect.join(', ') : 'NINGUNA'}`,
    `RESULTADO: ${r.verdict}`,
  ].join('\n');
}
