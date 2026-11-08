import { ConnectorError } from '../errors.mjs';

/** Produccion conocida: nunca es destino de pruebas, ni por URL, ni por nombre, ni por credencial. */
export const PROD_DB = 'atheron1';
export const PROD_HOST = 'atheron1.odoo.com';
/** Solo copias de pruebas creadas con este patron. La base staging antigua NO se acepta sin verificacion. */
export const TEST_DB_RE = /^atheron1-pruebas-\d{8}$/;
export const PRODUCTION_APPROVAL = 'si-aprobado-por-marlon';

function parseHttps(raw, code) {
  let url;
  try { url = new URL(raw); } catch { throw new ConnectorError(`${code}_INVALID`); }
  if (url.protocol !== 'https:') throw new ConnectorError(`${code}_NOT_HTTPS`);
  if (url.username || url.password || url.port || (url.pathname && url.pathname !== '/') || url.search || url.hash) throw new ConnectorError(`${code}_NOT_BARE_ORIGIN`);
  return url.hostname.toLowerCase();
}

/** Destino de pruebas (Node, JSON-2). Falla cerrado. No hace red. */
export function assertTestTarget(env = process.env) {
  const { ODOO_TEST_BASE_URL: base, ODOO_TEST_DATABASE: db, ODOO_TEST_API_KEY: key } = env;
  if (!base || !db || !key) throw new ConnectorError('TARGET_INCOMPLETE');
  const host = parseHttps(base, 'TARGET_URL');
  let prodHost = null;
  if (env.ODOO_BASE_URL) { try { prodHost = new URL(env.ODOO_BASE_URL).hostname.toLowerCase(); } catch { prodHost = null; } }
  if (host === PROD_HOST || host.endsWith(`.${PROD_HOST}`) || db === PROD_DB || db === env.ODOO_DATABASE || host === prodHost) throw new ConnectorError('TARGET_IS_PRODUCTION');
  if (!TEST_DB_RE.test(db)) throw new ConnectorError('TARGET_DATABASE_NOT_ALLOWED');
  if (host !== `${db}.odoo.com`) throw new ConnectorError('TARGET_HOST_DATABASE_MISMATCH');
  if (key === env.ODOO_API_KEY) throw new ConnectorError('TARGET_USES_PRODUCTION_CREDENTIAL');
  return { baseUrl: `https://${host}`, database: db, apiKey: key, kind: 'test' };
}

/** Produccion: solo con aprobacion explicita escrita y para --apply. No se usa en esta mision. */
export function assertProductionTarget(env = process.env) {
  if (env.ATH_DEPLOY_PRODUCTION !== PRODUCTION_APPROVAL) throw new ConnectorError('PRODUCTION_NOT_APPROVED');
  const host = parseHttps(env.ODOO_BASE_URL || '', 'PROD_URL');
  if (host !== PROD_HOST || env.ODOO_DATABASE !== PROD_DB || !env.ODOO_API_KEY) throw new ConnectorError('PRODUCTION_TARGET_INVALID');
  return { baseUrl: `https://${host}`, database: PROD_DB, apiKey: env.ODOO_API_KEY, kind: 'production' };
}

/** Destino en el navegador (sesion de la propia copia). */
export function assertBrowserTarget(hostname) {
  const h = String(hostname || '').toLowerCase();
  const db = h.endsWith('.odoo.com') ? h.slice(0, -'.odoo.com'.length) : '';
  if (h === PROD_HOST || !TEST_DB_RE.test(db)) throw new ConnectorError('BROWSER_TARGET_NOT_TEST_COPY');
  return db;
}
