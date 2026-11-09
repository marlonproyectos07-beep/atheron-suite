import { atenderConsulta } from '../../smoobu-odoo-connector/src/mobile-readonly.mjs';
import { loadSmoobuConfig, loadOdooConfig } from '../../smoobu-odoo-connector/src/config.mjs';
import { SmoobuClient } from '../../smoobu-odoo-connector/src/smoobu-client.mjs';
import { OdooJson2Client } from '../../smoobu-odoo-connector/src/odoo-json2-client.mjs';
import { runDaily } from '../../smoobu-odoo-connector/src/daily-run.mjs';

// ATHERON MOBILE: GET autenticado y exclusivo de lectura, sin cors ni datos personales.
const headers = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'",
};

function ready(env) {
  return ['ATHERON_MOBILE_READ_TOKEN','SMOOBU_API_KEY','SMOOBU_API_SECRET','ODOO_API_KEY','ODOO_BASE_URL','ODOO_DATABASE']
    .every((key) => typeof env[key] === 'string' && env[key].trim().length > 0);
}

export async function handleStatusRequest(req, env = process.env) {
  if (!ready(env)) return { status: 503, body: { error: 'CONFIGURACION_PENDIENTE' } };
  return atenderConsulta({
    method: req.method, path: '/v1/status', authorization: req.headers?.authorization,
  }, {
    token: env.ATHERON_MOBILE_READ_TOKEN,
    obtenerInforme: async () => {
      const sc = loadSmoobuConfig(env);
      const oc = loadOdooConfig(env);
      return runDaily({
        smoobu: new SmoobuClient({ ...sc, pathPrefix: '/api' }),
        odoo: new OdooJson2Client(oc),
        env: { RECONCILE_DAYS: '2' },
        watchIds: [],
        secrets: [sc.apiKey, sc.apiSecret, oc.apiKey],
      });
    },
  });
}

export default async function handler(req, res) {
  let result;
  try {
    result = await handleStatusRequest(req);
  } catch {
    result = { status: 503, body: { error: 'FUENTE_NO_VERIFICABLE' } };
  }
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return res.status(result.status).json(result.body);
}
