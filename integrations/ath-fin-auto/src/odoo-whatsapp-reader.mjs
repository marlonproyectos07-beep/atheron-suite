// ATH-WA-INGEST-002 — adapter Odoo JSON-2 estrictamente de lectura.
// Uso exclusivo dentro de un backend privado: nunca en navegador/front-end.
const ORIGIN = 'https://atheron1.odoo.com';
const MAX_RESPONSE_BYTES = 400_000;

export function createOdooWhatsAppReader({ baseUrl, database, apiKey, fetchImpl = fetch }) {
  const url = new URL(String(baseUrl || ''));
  if (url.origin !== ORIGIN || !['/', '/json/2'].includes(url.pathname.replace(/\/$/,'')||'/') ||
      url.username || url.password || url.search || url.hash ||
      database !== 'atheron1' || typeof apiKey !== 'string' || apiKey.length < 16 ||
      typeof fetchImpl !== 'function') {
    throw new Error('ODOO_READONLY_CONFIGURATION_INVALID');
  }
  return async function odooSearchRead({ model, method, params }) {
    if (model !== 'whatsapp.message' || method !== 'search_read' ||
        !params || !Array.isArray(params.domain) || !Array.isArray(params.fields) ||
        params.order !== 'create_date asc,id asc' ||
        !Number.isSafeInteger(params.limit) || params.limit<1 || params.limit>100 ||
        params.fields.join(',') !== 'id,wa_account_id,mobile_number,message_type,create_date,body') {
      throw new Error('READ_ONLY_ALLOWLIST_VIOLATION');
    }
    const endpoint = ORIGIN + '/json/2/whatsapp.message/search_read';
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {
          'Authorization': 'bearer ' + apiKey,
          'X-Odoo-Database': database,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
    } catch {
      throw new Error('ODOO_READ_FAILED');
    }
    if (!response?.ok || response.status !== 200 ||
        Number(response.headers?.get?.('content-length')||0)>MAX_RESPONSE_BYTES) {
      throw new Error('ODOO_READ_FAILED');
    }
    let payload;
    try {
      const data = await response.text();
      if(data.length>MAX_RESPONSE_BYTES) throw new Error('Too large');
      payload = JSON.parse(data);
    } catch {
      throw new Error('ODOO_READ_FAILED');
    }
    if(!Array.isArray(payload)) throw new Error('ODOO_BAD_RESPONSE');
    return payload;
  };
}
