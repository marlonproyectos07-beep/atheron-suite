/**
 * Cliente HTTP real de la API TRA (pms.mincit.gov.co). Solo se construye con token y nunca registra
 * el cuerpo ni la cabecera. El emisor decide si se puede usar (puertas de emissionGates).
 *
 * Manual oficial Grupo 1, PMS (Res. 409 de 2022, version 02-02-2023), "Headers": `Authorization` = `token <token>`
 * (la palabra token, un espacio y el token). El cuerpo es el JSON del manual ("raw" JSON en Postman), de ahi el
 * Content-Type. Una sola peticion por llamada: este cliente no reintenta nunca.
 */
export const TRA_BASE_URL = 'https://pms.mincit.gov.co';

/** Cabeceras exactas del manual. Separadas para poder probarlas sin red. */
export function traHeaders(token) {
  return { Authorization: `token ${token}`, 'Content-Type': 'application/json' };
}

export function createTraHttp({ token, baseUrl = TRA_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  if (!token) throw new Error('TRA_TOKEN_MISSING');
  return {
    async post(kind, payload) {
      if (kind !== 'one' && kind !== 'two') return { error: 'BEFORE_SEND' };
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/${kind}/`, {
          method: 'POST',
          headers: traHeaders(token),
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
