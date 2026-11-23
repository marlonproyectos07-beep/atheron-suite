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
        params.fields.join(',') !== 'id,wa_account_id,mobile_number,message_type,create_date,body' ||
        params.domain.length !== 4 ||
        !Array.isArray(params.domain[0]) || params.domain[0][0] !== 'wa_account_id' ||
        params.domain[0][1] !== '=' || !Number.isSafeInteger(params.domain[0][2]) ||
        !Array.isArray(params.domain[1]) || params.domain[1].join('|') !== 'message_type|=|inbound' ||
        !Array.isArray(params.domain[2]) || params.domain[2][0] !== 'mobile_number' ||
        params.domain[2][1] !== 'in' || !Array.isArray(params.domain[2][2]) ||
        params.domain[2][2].length < 1 || params.domain[2][2].some(s => !/^\\+?[1-9][0-9]{7,14}$/.test(s)) ||
        !Array.isArray(params.domain[3]) || params.domain[3][0] !== 'create_date' ||
        params.domain[3][1] !== '>=' ||
        !/^20\\d{2}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(params.domain[3][2])) {
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
