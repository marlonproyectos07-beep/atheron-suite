import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';
import { validateWrite } from './sync-write-guard.mjs';
import { DEFAULT_MAX_WRITES } from './sync-write-client.mjs';
import { PROD_DB, PROD_HOST, TEST_DB_RE } from './sire-tra/guard.mjs';

/**
 * ATH-HOTELS-SIRE-TRA-001 — Cliente de ESCRITURA del conector en MODO COPIA DE PRUEBAS.
 *
 * `SyncWriteClient` (produccion) sigue fijado a atheron1.odoo.com / atheron1 y DESARMADO; este archivo no lo toca ni lo redirige.
 * Esta clase es otra puerta, con la misma lista blanca de campos (`validateWrite`) y el mismo tope, pero:
 *   - solo acepta una copia: host `<db>.odoo.com`, base `atheron1-pruebas-AAAAMMDD`; jamas `atheron1` ni `atheron1.odoo.com`;
 *   - exige una credencial distinta de la de produccion (si se le pasa la de produccion, se niega);
 *   - exige la frase de armado de copia (una orden explicita, no un secreto);
 *   - no usa ni cambia WRITES_ENABLED / RELEASE_UNLOCKED: esos interruptores siguen siendo solo de produccion.
 * La validacion del destino se repite en CADA escritura (no solo al construir).
 */
export const COPY_ARM_PHRASE = 'ESCRIBIR SOLO EN LA COPIA DE PRUEBAS ATHERON1-PRUEBAS';

/** Regla pura de destino (sin red). Lanza ConnectorError con un codigo; devuelve el destino normalizado. */
export function assertCopyTarget({ baseUrl, database, apiKey, productionApiKey = null }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new ConnectorError('COPY_TARGET_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (url.pathname && url.pathname !== '/') || url.search || url.hash) throw new ConnectorError('COPY_TARGET_NOT_BARE_ORIGIN');
  const host = url.hostname.toLowerCase();
  if (host === PROD_HOST || host.endsWith(`.${PROD_HOST}`) || database === PROD_DB) throw new ConnectorError('COPY_TARGET_IS_PRODUCTION');
  if (!TEST_DB_RE.test(database || '')) throw new ConnectorError('COPY_DATABASE_NOT_ALLOWED');
  if (host !== `${database}.odoo.com`) throw new ConnectorError('COPY_HOST_DATABASE_MISMATCH');
  if (!apiKey) throw new ConnectorError('COPY_CREDENTIAL_MISSING');
  if (productionApiKey && apiKey === productionApiKey) throw new ConnectorError('COPY_USES_PRODUCTION_CREDENTIAL');
  return { baseUrl: `https://${host}`, database };
}

export class CopyWriteClient extends OdooJson2Client {
  constructor({ arm = null, maxWrites = DEFAULT_MAX_WRITES, productionApiKey = null, ...opts }) {
    const target = assertCopyTarget({ baseUrl: opts.baseUrl, database: opts.database, apiKey: opts.apiKey, productionApiKey });
    super({ ...opts, baseUrl: target.baseUrl, database: target.database });
    this.armed = arm === COPY_ARM_PHRASE;
    this.maxWrites = maxWrites; this.writes = 0; this.log = []; this.mode = 'copia';
  }

  /** Unica puerta de escritura. */
  async execute(model, method, params) {
    if (!this.armed) throw new ConnectorError('COPY_WRITES_DISABLED');
    assertCopyTarget({ baseUrl: this.baseUrl, database: this.database, apiKey: this.apiKey }); // otra vez, por si alguien mutó el cliente
    validateWrite(model, method, params);
    if (this.writes >= this.maxWrites) throw new ConnectorError('SYNC_WRITE_BUDGET_EXHAUSTED');
    this.writes += 1; // se cuenta ANTES de enviar: un fallo ambiguo no autoriza reintentar en esta ejecucion
    this.log.push({ model, method, ids: params?.ids ?? null });
    return this._request(model, method, params);
  }
}
