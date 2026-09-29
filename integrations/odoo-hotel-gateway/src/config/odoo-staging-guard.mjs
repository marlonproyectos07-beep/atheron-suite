/**
 * ATH-ODOO-STAGING — validador fail-closed compartido para cualquier
 * camino que quiera hablar con Odoo staging (el credential store nuevo,
 * el runner LIVE de HOTEL-008A, o el que venga despues). No lee ningun
 * almacen de secretos ni archivo: solo valida el `env` que ya le pasaron.
 * No imprime nada — el llamador decide que loguear, y nunca debe loguear
 * el valor de ODOO_TECHNICAL_SECRET.
 */

export const ALLOWED_DATABASE = 'atheron1-hotel-staging-20260923';

export const REQUIRED_VARS = Object.freeze([
  'ODOO_BASE_URL',
  'ODOO_DATABASE',
  'ODOO_TECHNICAL_USER',
  'ODOO_TECHNICAL_SECRET',
  'ODOO_ACTION_ID',
]);

export const STAGING_GUARD_ERROR_CODES = Object.freeze({
  MISSING_VAR: 'MISSING_VAR',
  DATABASE_NOT_ALLOWED: 'DATABASE_NOT_ALLOWED',
});

export class StagingGuardError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'StagingGuardError';
    this.code = code;
  }
}

/**
 * Falla cerrado ante cualquier ambiguedad: variable ausente/vacia, o
 * ODOO_DATABASE distinto (por igualdad estricta, sin trim ni
 * normalizacion de mayusculas) del unico valor de staging autorizado.
 * Nunca hay fallback a produccion ni a ningun otro valor.
 */
export function assertStagingEnv(env = process.env) {
  for (const key of REQUIRED_VARS) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new StagingGuardError(STAGING_GUARD_ERROR_CODES.MISSING_VAR, `falta la variable requerida: ${key}`);
    }
  }

  if (env.ODOO_DATABASE !== ALLOWED_DATABASE) {
    throw new StagingGuardError(
      STAGING_GUARD_ERROR_CODES.DATABASE_NOT_ALLOWED,
      `ODOO_DATABASE no es la base de staging autorizada (se recibio un valor distinto de "${ALLOWED_DATABASE}")`,
    );
  }

  return Object.freeze({
    baseUrl: env.ODOO_BASE_URL,
    database: env.ODOO_DATABASE,
    technicalUser: env.ODOO_TECHNICAL_USER,
    technicalSecret: env.ODOO_TECHNICAL_SECRET,
    actionId: Number(env.ODOO_ACTION_ID),
  });
}

/** Version segura para logs: nunca incluye technicalSecret, ni completo ni parcial. */
export function describeStagingConfigSafely(config) {
  const maskedUser =
    config.technicalUser.length <= 2 ? '**' : `${config.technicalUser.slice(0, 2)}${'*'.repeat(Math.max(3, config.technicalUser.length - 2))}`;
  return Object.freeze({
    database: config.database,
    action_id: config.actionId,
    technical_user_masked: maskedUser,
    technical_secret: 'presente (oculto)',
    base_url_host: safeHost(config.baseUrl),
  });
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'INVALID_URL';
  }
}
