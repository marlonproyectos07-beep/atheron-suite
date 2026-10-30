/**
 * Comprobacion de salida HTTPS sin credenciales: solo dice si cada host
 * responde y con que codigo (cualquier codigo HTTP prueba conectividad;
 * 401/403/404 son normales sin autenticacion). Errores de red se clasifican.
 */
export function hostsToCheck(env = process.env) {
  const hosts = [env.SMOOBU_BASE_URL || 'https://login.smoobu.com', env.ODOO_BASE_URL].filter(Boolean);
  return [...new Set(hosts.map((u) => new URL(u).origin))];
}

export function classifyNetworkError(e) {
  const c = e?.cause?.code ?? e?.code;
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') return 'DNS';
  if (c === 'ECONNREFUSED' || c === 'ECONNRESET') return 'CONNECTION';
  if (e?.name === 'TimeoutError' || c === 'ETIMEDOUT') return 'TIMEOUT';
  if (String(c).includes('CERT') || String(c).includes('TLS')) return 'TLS';
  return 'NETWORK';
}

export async function checkConnectivity({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const out = [];
  for (const origin of hostsToCheck(env)) {
    try {
      const res = await fetchImpl(origin, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      out.push({ origin, reachable: true, httpStatus: res.status });
    } catch (e) {
      out.push({ origin, reachable: false, cause: classifyNetworkError(e) });
    }
  }
  return out;
}
