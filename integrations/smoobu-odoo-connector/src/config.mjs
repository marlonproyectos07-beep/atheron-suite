import { ConnectorError } from './errors.mjs';

/** Seis variables. PUBLICAS: no son secretas (URLs y nombre de base). SECRETAS: se cargan solo en un almacen seguro. */
export const PUBLIC_VARS = ['SMOOBU_BASE_URL', 'ODOO_BASE_URL', 'ODOO_DATABASE'];
export const SECRET_VARS = ['SMOOBU_API_KEY', 'SMOOBU_API_SECRET', 'ODOO_API_KEY'];
export const SMOOBU_VARS = ['SMOOBU_API_KEY', 'SMOOBU_API_SECRET'];
export const ODOO_VARS = ['ODOO_BASE_URL', 'ODOO_DATABASE', 'ODOO_API_KEY'];

function need(env, names, prefix) {
  const missing = names.filter((n) => typeof env[n] !== 'string' || env[n].trim() === '');
  if (missing.length) {
    const err = new ConnectorError(`${prefix}_ENV_MISSING`);
    err.missing = missing; // solo nombres de variable, nunca valores
    throw err;
  }
}

export function loadSmoobuConfig(env = process.env) {
  need(env, SMOOBU_VARS, 'SMOOBU');
  return {
    baseUrl: env.SMOOBU_BASE_URL?.trim() || 'https://login.smoobu.com',
    // trim: un salto de linea o espacio pegado junto al secreto es la causa tipica de un 401 de firma
    apiKey: env.SMOOBU_API_KEY.trim(),
    apiSecret: env.SMOOBU_API_SECRET.trim(),
  };
}

export function loadOdooConfig(env = process.env) {
  need(env, ODOO_VARS, 'ODOO');
  return {
    baseUrl: env.ODOO_BASE_URL.trim(),
    database: env.ODOO_DATABASE.trim(),
    apiKey: env.ODOO_API_KEY,
  };
}

/** Estado seguro para imprimir: solo presente/ausente. */
export function envStatus(env = process.env) {
  return Object.fromEntries([...PUBLIC_VARS, ...SECRET_VARS].map((n) => [n, Boolean(env[n]?.trim())]));
}

/**
 * Higiene de credenciales SIN revelar valores: solo booleanos. Detecta lo que
 * suele romper una firma al pegar un secreto en un formulario.
 */
export function credentialHygiene(env = process.env) {
  const probe = (v) => (typeof v !== 'string' ? null : {
    hasOuterWhitespace: v !== v.trim(),
    hasInnerWhitespace: /\s/.test(v.trim()),
    hasQuotes: /^["'`]|["'`]$/.test(v.trim()),
    hasNonAscii: /[^\x20-\x7e\s]/.test(v),
    key_and_secret_identical: undefined,
  });
  const k = probe(env.SMOOBU_API_KEY); const s = probe(env.SMOOBU_API_SECRET);
  const same = typeof env.SMOOBU_API_KEY === 'string' && env.SMOOBU_API_KEY.trim() !== '' && env.SMOOBU_API_KEY.trim() === env.SMOOBU_API_SECRET?.trim();
  for (const x of [k, s]) if (x) delete x.key_and_secret_identical;
  return { SMOOBU_API_KEY: k, SMOOBU_API_SECRET: s, keyEqualsSecret: same };
}
