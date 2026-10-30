import { ConnectorError } from './errors.mjs';

/**
 * Guardia de staging para CUALQUIER ruta futura de escritura (hoy no existe ninguna en este conector).
 * Falla cerrado: sin base de staging explicita, con la base de produccion, con la misma credencial
 * que produccion o sin el interruptor explicito, rechaza.
 */
export const STAGING_DATABASE = 'atheron1-hotel-staging-20260923';
export const PRODUCTION_DATABASE_NAMES = Object.freeze(['atheron1']);

export function assertStagingWriteTarget(env = process.env) {
  const db = env.ODOO_STAGING_DATABASE;
  if (!db || db !== STAGING_DATABASE) throw new ConnectorError('STAGING_DATABASE_NOT_AUTHORIZED');
  if (PRODUCTION_DATABASE_NAMES.includes(db) || db === env.ODOO_DATABASE) throw new ConnectorError('STAGING_EQUALS_PRODUCTION');
  if (!env.ODOO_STAGING_BASE_URL) throw new ConnectorError('STAGING_BASE_URL_MISSING');
  // la base de staging vive en su propio host (<base>.odoo.com), distinto del de produccion
  let host = '';
  try { host = new URL(env.ODOO_STAGING_BASE_URL).hostname; } catch { throw new ConnectorError('STAGING_BASE_URL_INVALID'); }
  if (host !== `${STAGING_DATABASE}.odoo.com`) throw new ConnectorError('STAGING_HOST_NOT_AUTHORIZED');
  if (!env.ODOO_STAGING_API_KEY) throw new ConnectorError('STAGING_CREDENTIAL_MISSING');
  if (env.ODOO_STAGING_API_KEY === env.ODOO_API_KEY) throw new ConnectorError('STAGING_USES_PRODUCTION_CREDENTIAL');
  if (env.ODOO_STAGING_WRITES !== 'yes-staging') throw new ConnectorError('STAGING_WRITES_NOT_ENABLED');
  return { baseUrl: env.ODOO_STAGING_BASE_URL, database: db, apiKey: env.ODOO_STAGING_API_KEY };
}

/** Variables de staging que Marlon debe cargar (nombres; los valores nunca van al chat). */
export const STAGING_VARS = Object.freeze({
  public: ['ODOO_STAGING_BASE_URL', 'ODOO_STAGING_DATABASE'],
  secret: ['ODOO_STAGING_API_KEY'],
});
