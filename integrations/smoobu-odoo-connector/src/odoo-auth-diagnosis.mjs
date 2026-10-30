import { ODOO_FACTS } from './odoo-facts.mjs';

/**
 * ATH-DEV-030 — diagnostico de autenticacion Odoo JSON-2. UNA llamada de lectura (res.users/context_get), sin reintentos.
 * Salida: HTTP, tipo de error saneado y exito/fallo. Nunca la clave, su longitud, hash, prefijo ni cabeceras.
 * No afirma causas que no se pueden demostrar (por ejemplo, caducidad).
 */
export const ENDPOINT = '/json/2/res.users/context_get';

/** Banderas de higiene de la clave (solo booleanos): una clave con espacios o saltos de linea suele producir 401. */
export function apiKeyHygiene(value) {
  if (typeof value !== 'string' || value === '') return { present: false };
  return { present: true, hasOuterWhitespace: value !== value.trim(), hasInnerWhitespace: /\s/.test(value.trim()), hasQuotes: /^["'`]|["'`]$/.test(value.trim()), hasNonAscii: /[^\x20-\x7e\s]/.test(value) };
}

export function classifyOdooResult({ httpStatus, code, detail = null }) {
  const msg = String(detail ?? '').toLowerCase();
  const hint = [/api\s*key|apikey/.test(msg) && 'MENSAJE_MENCIONA_API_KEY', /database|base de datos/.test(msg) && 'MENSAJE_MENCIONA_BASE_DE_DATOS', /expired|expir/.test(msg) && 'MENSAJE_MENCIONA_EXPIRACION'].filter(Boolean);
  if (httpStatus === 200) return { authenticated: true, verdict: 'CREDENCIAL_FUNCIONA', hint: [] };
  if (httpStatus === 401) return { authenticated: false, verdict: 'CREDENCIAL_O_CONFIGURACION_RECHAZADA', hint, note: 'Odoo no identifica al usuario; la causa no se puede distinguir desde aqui (clave, base de datos o configuracion)' };
  if (httpStatus === 403) return { authenticated: null, verdict: 'PERMISO_INSUFICIENTE_O_ACCESO_API_NO_PERMITIDO', hint, note: 'No se amplian privilegios' };
  if (httpStatus === 404) return { authenticated: null, verdict: 'ENDPOINT_O_BASE_NO_ENCONTRADO', hint: [] };
  if (httpStatus === null) return { authenticated: null, verdict: code === 'ODOO_TIMEOUT' ? 'TIEMPO_AGOTADO' : 'ERROR_DE_RED_O_CONFIGURACION', hint: [] };
  return { authenticated: null, verdict: 'RESULTADO_INESPERADO_DETENER', hint: [] };
}

const scrub = (t) => (typeof t === 'string' ? t.replace(/bearer\s+\S+/gi, '[auth-redactado]').replace(/authorization\S*/gi, '[cabecera-redactada]') : t);

export async function runOdooAuthDiagnosis({ client, cfg, env = process.env }) {
  const target = (() => { try { const u = new URL(cfg.baseUrl); return { host: u.hostname, protocol: u.protocol, database: cfg.database, expectedHost: u.hostname === 'atheron1.odoo.com' && cfg.database === 'atheron1' }; } catch { return { host: null, expectedHost: false }; } })();
  const base = { requests: 1, endpoint: `POST ${ENDPOINT}`, target, companyIdInConfig: ODOO_FACTS.companyId, apiKey: apiKeyHygiene(cfg.apiKey), writes: 0 };
  try {
    const ctx = await client.call('res.users', 'context_get', {});
    return { ...base, httpStatus: 200, uid: Number.isInteger(ctx?.uid) ? ctx.uid : null, ...classifyOdooResult({ httpStatus: 200 }) };
  } catch (e) {
    const detail = scrub(e.detail ?? null);
    return { ...base, httpStatus: e.status ?? null, errorCode: e.code ?? 'UNKNOWN', upstreamMessage: detail, ...classifyOdooResult({ httpStatus: e.status ?? null, code: e.code, detail }) };
  }
}
