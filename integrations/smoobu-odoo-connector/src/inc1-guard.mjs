import { ConnectorError } from './errors.mjs';
import { INC1_ALLOWED_WRITES, INC1_FIELDS, INC1_NEW_MODELS } from './inc1-spec.mjs';

/** Producciones conocidas: jamas un destino, ni por URL, ni por nombre de base, ni por credencial. */
export const PROD_DB = Object.freeze(['atheron1']);
export const PROD_HOSTS = Object.freeze(['atheron1.odoo.com']);
/** Solo copias de pruebas con este patron (duplicado: atheron1-pruebas-AAAAMMDD). */
export const TEST_DB_RE = /^atheron1-(pruebas|hotel-staging)-\d{8}$/;

/** Falla cerrado. No hace red. */
export function assertIncrement1Target(env = process.env) {
  const base = env.ODOO_TEST_BASE_URL;
  const db = env.ODOO_TEST_DATABASE;
  const key = env.ODOO_TEST_API_KEY;
  if (!base || !db || !key) throw new ConnectorError('INC1_TARGET_INCOMPLETE');
  let url;
  try { url = new URL(base); } catch { throw new ConnectorError('INC1_BASE_URL_INVALID'); }
  if (url.protocol !== 'https:') throw new ConnectorError('INC1_BASE_URL_NOT_HTTPS');
  const host = url.hostname.toLowerCase();
  if (PROD_HOSTS.includes(host) || host === 'atheron1.odoo.com' || host.endsWith('.atheron1.odoo.com')) throw new ConnectorError('INC1_TARGET_IS_PRODUCTION');
  if (PROD_DB.includes(db) || db === env.ODOO_DATABASE || (env.ODOO_BASE_URL && new URL(env.ODOO_BASE_URL).hostname.toLowerCase() === host)) throw new ConnectorError('INC1_TARGET_IS_PRODUCTION');
  if (!TEST_DB_RE.test(db)) throw new ConnectorError('INC1_DATABASE_NAME_NOT_ALLOWED');
  if (host !== `${db}.odoo.com`) throw new ConnectorError('INC1_HOST_DATABASE_MISMATCH');
  if (key === env.ODOO_API_KEY) throw new ConnectorError('INC1_USES_PRODUCTION_CREDENTIAL');
  return { baseUrl: `https://${host}`, database: db, apiKey: key };
}

/** Escritura (--apply): ademas, interruptor explicito. La simulacion nunca lo necesita. */
export function assertApplyAllowed(env = process.env) {
  if (env.ODOO_TEST_WRITES !== 'yes-test-copy') throw new ConnectorError('INC1_WRITES_NOT_ENABLED');
}

/** Lista blanca de escrituras: create en ir.model / ir.model.fields y solo para lo declarado en la especificacion. */
export function assertAllowedWrite(model, method, vals) {
  if (!INC1_ALLOWED_WRITES.some(([m, me]) => m === model && me === method)) throw new ConnectorError('INC1_WRITE_NOT_ALLOWED');
  if (model === 'ir.model') {
    if (!INC1_NEW_MODELS.some((m) => m.model === vals?.model)) throw new ConnectorError('INC1_MODEL_NOT_IN_SPEC');
    return;
  }
  const declared = INC1_FIELDS.some(([m, n]) => m === vals?.model && n === vals?.name);
  if (!declared || !/^x_[a-z0-9_]+$/.test(vals.name)) throw new ConnectorError('INC1_FIELD_NOT_IN_SPEC');
}

/**
 * Comprobacion del entorno. Se separa lo que Odoo hace solo (bandera de neutralizacion) de los
 * controles ADICIONALES. Cualquier dato ilegible cuenta como fallo (STOP).
 * `reader.searchRead` / `reader.searchCount` solo leen.
 */
export async function checkTestEnvironment(reader) {
  const checks = [];
  const add = (id, group, ok, detail = '') => checks.push({ id, group, ok: ok === true, detail });
  try {
    const p = await reader.searchRead('ir.config_parameter', [['key', 'in', ['database.is_neutralized', 'web.base.url']]], ['key', 'value']);
    const neutral = p.find((x) => x.key === 'database.is_neutralized');
    add('E1_neutralizada', 'odoo_automatico', neutral?.value === 'True', neutral ? `valor=${neutral.value}` : 'parametro ausente');
  } catch (e) { add('E1_neutralizada', 'odoo_automatico', false, e.code ?? 'ERROR'); }
  const counts = [
    ['A1_crons_activos_0', 'ir.cron', [['active', '=', true]]],
    ['A2_servidores_correo_saliente_activos_0', 'ir.mail_server', [['active', '=', true]]],
    ['A3_automatizaciones_webhook_o_whatsapp_activas_0', 'base.automation', [['active', '=', true], ['action_server_ids.state', 'in', ['webhook', 'whatsapp']]]],
    ['A4_proveedores_de_pago_habilitados_0', 'payment.provider', [['state', '!=', 'disabled']]],
  ];
  for (const [id, model, domain] of counts) {
    try { const n = await reader.searchCount(model, domain); add(id, 'adicional_nuestro', n === 0, `conteo=${n}`); }
    catch (e) { add(id, 'adicional_nuestro', false, e.code ?? 'ERROR'); }
  }
  return { isolated: checks.every((c) => c.ok), checks };
}
