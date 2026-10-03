/**
 * GOAL-WHATSAPP-AGENT-001 -- configuracion y kill switch.
 * Todos los modos existen en la arquitectura, pero SOLO `shadow` esta
 * habilitado. Cualquier otro valor falla cerrado al arrancar.
 * Sin secretos: aqui solo hay banderas y el nombre de la base staging.
 */

export const MODES = Object.freeze(['shadow', 'supervised', 'auto_offhours', 'auto']);
export const ENABLED_MODES = Object.freeze(['shadow']);
export const ALLOWED_ODOO_DATABASE = 'atheron1-hotel-staging-20260923';

export class ConfigError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'ConfigError';
    this.code = code;
  }
}

/**
 * WHATSAPP_AUTOMATION_ENABLED (kill switch): por defecto `false`; con `false`
 *   el agente no analiza ni responde nada.
 * WHATSAPP_AUTOMATION_MODE: por defecto `shadow`; solo `shadow` esta habilitado.
 */
export function resolveConfig(env = process.env) {
  const mode = (env.WHATSAPP_AUTOMATION_MODE ?? 'shadow').trim();
  if (!MODES.includes(mode)) throw new ConfigError('UNKNOWN_MODE', `WHATSAPP_AUTOMATION_MODE desconocido: ${mode}`);
  if (!ENABLED_MODES.includes(mode)) {
    throw new ConfigError('MODE_NOT_ENABLED', `el modo "${mode}" existe pero NO esta habilitado en esta version (solo shadow)`);
  }
  const enabled = String(env.WHATSAPP_AUTOMATION_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  return Object.freeze({ mode, enabled });
}

/** Si hay base Odoo configurada, tiene que ser exactamente la de staging. Nunca produccion. */
export function assertStagingDatabase(database) {
  if (database !== ALLOWED_ODOO_DATABASE) {
    throw new ConfigError('DATABASE_NOT_ALLOWED', `ODOO_DATABASE no es la base staging autorizada`);
  }
  return true;
}
