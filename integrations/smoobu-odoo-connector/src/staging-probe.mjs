/**
 * Sondeo SIN credenciales de si una base existe en el host JSON-2. No envia Authorization.
 * Compara una base de control (produccion) con la de staging; solo informa codigos y un mensaje saneado.
 */
export async function probeDatabase({ baseUrl, database, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/json/2/res.users/context_get`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-odoo-database': database }, body: '{}', signal: AbortSignal.timeout(timeoutMs),
    });
    let message = '';
    try { message = (await res.text()).replace(/[\u0000-\u001f]+/g, ' ').replace(/https?:\/\/\S+/g, '[url]').slice(0, 140); } catch { /* sin cuerpo */ }
    return { database, httpStatus: res.status, message };
  } catch (e) {
    return { database, error: e?.cause?.code ?? e?.name ?? 'NETWORK' };
  }
}

/** GET sin credenciales a la raiz de un host: codigo HTTP y, si redirige, solo el host de destino. */
export async function probeHost({ origin, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  try {
    const res = await fetchImpl(origin, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers?.get?.('location');
    let redirectHost = null;
    try { redirectHost = loc ? new URL(loc, origin).host : null; } catch { redirectHost = '(invalido)'; }
    return { origin, httpStatus: res.status, redirectHost };
  } catch (e) {
    return { origin, error: e?.cause?.code ?? e?.name ?? 'NETWORK' };
  }
}
