#!/usr/bin/env node
// ATH-MOBILE-001: prototipo LOCAL read-only. No publicar directamente en Internet.
import { createServer } from 'node:http';
import { atenderConsulta } from '../src/mobile-readonly.mjs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { runDaily } from '../src/daily-run.mjs';

const token = process.env.ATHERON_MOBILE_READ_TOKEN;
const port = Number(process.env.ATHERON_MOBILE_PORT || 4317);
const days = Number(process.env.ATHERON_MOBILE_DAYS || 2);
if (typeof token !== 'string' || token.length < 32 || !Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(days) || days < 1 || days > 7) {
  console.error('MOBILE_READONLY_CONFIG_INVALID');
  process.exit(2);
}

// La instancia usa exclusivamente los clientes de LECTURA del conector existente.
const sc = loadSmoobuConfig(process.env);
const oc = loadOdooConfig(process.env);
const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
const odoo = new OdooJson2Client(oc);
let cache = null;
let pending = null;
const obtenerInforme = async () => {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache.data;
  if (!pending) pending = runDaily({ smoobu, odoo, env: { RECONCILE_DAYS: String(days) }, watchIds: [], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey] })
    .then(data => { if (data.exitCode === 0) cache = { at: Date.now(), data }; return data; })
    .finally(() => { pending = null; });
  return pending;
};

const server = createServer(async (req, res) => {
  const result = await atenderConsulta({ method: req.method, path: req.url, authorization: req.headers.authorization }, { token, obtenerInforme });
  res.writeHead(result.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.end(JSON.stringify(result.body));
});
server.requestTimeout = 30_000;
server.listen(port, '127.0.0.1', () => console.log('ATHERON_MOBILE_READONLY_LOCAL_READY'));
