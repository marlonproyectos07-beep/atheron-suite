import { ConnectorError } from './errors.mjs';

export const SMOOBU_VARS = ['SMOOBU_BASE_URL', 'SMOOBU_KEY_ID', 'SMOOBU_SECRET'];
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
    baseUrl: env.SMOOBU_BASE_URL.trim(),
    keyId: env.SMOOBU_KEY_ID,
    secret: env.SMOOBU_SECRET,
    authMode: env.SMOOBU_AUTH_MODE === 'api-key' ? 'api-key' : 'hmac',
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
  return Object.fromEntries([...SMOOBU_VARS, ...ODOO_VARS].map((n) => [n, Boolean(env[n]?.trim())]));
}
