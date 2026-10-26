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
