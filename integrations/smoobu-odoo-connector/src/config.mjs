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
    apiKey: env.SMOOBU_API_KEY,
    apiSecret: env.SMOOBU_API_SECRET,
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
