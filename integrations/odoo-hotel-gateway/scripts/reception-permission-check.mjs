// ATH-DISP-001 — PRUEBA DE PERMISOS del agente de recepción contra STAGING, por HTTP real.
// - availability debe funcionar (solo lectura en Odoo).
// - hold, quote, status y ota_* deben rechazarse con 403 FORBIDDEN_OPERATION.
// - No crea HOLD ni reservas: la operación no permitida se corta antes de llegar a Odoo.
// - Cuenta pedidos antes y después para demostrar que no se escribió nada.
// No imprime credenciales, ni PIN, ni datos de huéspedes.
import { createServer } from 'node:http';
import { createHotelGatewayServer } from '../src/server.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const STAGING_DB = 'atheron1-hotel-staging-20260923';
const env = process.env;

if (env.ODOO_DATABASE !== STAGING_DB) {
  console.error('ABORT: la base no es la de staging autorizada.');
  process.exit(1);
}
if (!env.HOTEL_RECEPTION_AGENT_ID || !env.HOTEL_RECEPTION_AGENT_KEY) {
  console.error('ABORT: faltan credenciales del agente de recepción.');
  process.exit(1);
}

const built = buildGatewayFromEnv(env);
if (built.dryRun) {
  console.error('ABORT: DRY_RUN debe ser false para una prueba contra staging.');
  process.exit(1);
}

// Conteo de pedidos antes/después (solo lectura, con el mismo usuario técnico)
const transport = new HttpOdooTransport({ baseUrl: env.ODOO_BASE_URL });
const uid = await transport.call('common', 'login', [env.ODOO_DATABASE, env.ODOO_TECHNICAL_USER, env.ODOO_TECHNICAL_SECRET]);
const countOrders = () => transport.call('object', 'execute_kw', [env.ODOO_DATABASE, uid, env.ODOO_TECHNICAL_SECRET, 'sale.order', 'search_count', [[]], { context: { active_test: false } }]);
const ordersBefore = await countOrders();

const server = createHotelGatewayServer({ gateway: built.gateway, readinessCheck: () => true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function call(path, body, { agentId = env.HOTEL_RECEPTION_AGENT_ID, key = env.HOTEL_RECEPTION_AGENT_KEY } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (agentId) headers['x-agent-id'] = agentId;
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, code: json?.error?.code ?? null, ok: json?.ok === true, json };
}

const AVAIL = { check_in: '2026-11-05', check_out: '2026-11-06', guests: 2 };
const results = {};

results.availability = await call('/hotel/availability', AVAIL);
results.hold = await call('/hotel/hold', { quote_id: 'QH-PERMISO-NO-EXISTE', idempotency_key: 'perm-check-hold-1', client_ref: 'perm-check' });
results.quote = await call('/hotel/quote', { ...AVAIL, idempotency_key: 'perm-check-quote-1' });
results.status = await call('/hotel/status', { quote_id: 'QH-PERMISO-NO-EXISTE' });
results.ota = await call('/hotel/ota/blocks/list', { property_id: 1 });
results.wrongKey = await call('/hotel/availability', AVAIL, { key: 'clave-incorrecta-de-prueba' });
results.noCredentials = await call('/hotel/availability', AVAIL, { agentId: null, key: null });

const ordersAfter = await countOrders();
server.close();

const yn = (b) => (b ? 'YES' : 'NO');
const estados = (results.availability.json?.data?.data?.opciones ?? results.availability.json?.data?.opciones ?? [])
  .map((o) => `${o.unit_id}:${o.estado}`);

console.log('RECEPTION_AGENT_ID_USED: ' + env.HOTEL_RECEPTION_AGENT_ID);
console.log('AVAILABILITY_ALLOWED: ' + yn(results.availability.status === 200 && results.availability.ok));
console.log('  availability_status=' + results.availability.status + ' unidades=' + estados.join(' '));
console.log('HOLD_FORBIDDEN: ' + yn(results.hold.status === 403 && results.hold.code === 'FORBIDDEN_OPERATION') + ' (status=' + results.hold.status + ' code=' + results.hold.code + ')');
console.log('QUOTE_FORBIDDEN: ' + yn(results.quote.status === 403 && results.quote.code === 'FORBIDDEN_OPERATION') + ' (status=' + results.quote.status + ' code=' + results.quote.code + ')');
console.log('STATUS_FORBIDDEN: ' + yn(results.status.status === 403 && results.status.code === 'FORBIDDEN_OPERATION') + ' (status=' + results.status.status + ' code=' + results.status.code + ')');
console.log('OTA_FORBIDDEN: ' + yn(results.ota.status === 403 && results.ota.code === 'FORBIDDEN_OPERATION') + ' (status=' + results.ota.status + ' code=' + results.ota.code + ')');
console.log('WRONG_KEY_REJECTED: ' + yn(results.wrongKey.status === 401));
console.log('NO_CREDENTIALS_REJECTED: ' + yn(results.noCredentials.status === 401));
console.log('SALE_ORDERS_BEFORE: ' + ordersBefore + ' AFTER: ' + ordersAfter + ' CREATED_DURING_CHECK: ' + (ordersAfter - ordersBefore));
const allPass = results.availability.ok
  && results.hold.code === 'FORBIDDEN_OPERATION'
  && results.quote.code === 'FORBIDDEN_OPERATION'
  && results.status.code === 'FORBIDDEN_OPERATION'
  && results.ota.code === 'FORBIDDEN_OPERATION'
  && results.wrongKey.status === 401
  && results.noCredentials.status === 401
  && ordersAfter === ordersBefore;
console.log('PERMISSION_CHECK_PASS: ' + yn(allPass));
process.exit(allPass ? 0 : 2);
