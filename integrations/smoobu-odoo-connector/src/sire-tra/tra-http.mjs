/**
 * Cliente HTTP real de la API TRA (pms.mincit.gov.co). Solo se construye con token y nunca registra
 * el cuerpo ni la cabecera. El emisor decide si se puede usar (puertas de emissionGates).
 */
export const TRA_BASE_URL = 'https://pms.mincit.gov.co';

export function createTraHttp({ token, baseUrl = TRA_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  if (!token) throw new Error('TRA_TOKEN_MISSING');
  return {
    async post(kind, payload) {
      if (kind !== 'one' && kind !== 'two') return { error: 'BEFORE_SEND' };
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/${kind}/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `token ${token}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        return { error: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
      }
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json };
    },
  };
}
