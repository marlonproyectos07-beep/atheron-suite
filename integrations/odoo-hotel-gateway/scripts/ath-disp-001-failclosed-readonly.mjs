// ATH-DISP-001 — FAIL-CLOSED EN VIVO, SOLO LECTURA: error del gateway y Odoo caído.
// No escribe nada. Verifica que ninguna unidad aparezca como DISPONIBLE.
import { createServer } from 'node:http';
import { createHotelGatewayServer } from '../src/server.mjs';
import { HotelGateway } from '../src/gateway.mjs';
import { IdentityStore, hashKey } from '../src/identity.mjs';
import { RateLimiter } from '../src/rate-limiter.mjs';
import { IdempotencyStore } from '../src/idempotency-store.mjs';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { AuditLog } from '../src/audit-log.mjs';
import { buildReceptionAvailability, dataUnavailableResult, STATUS } from '../src/reception-availability.mjs';

const env = process.env;
if (env.ODOO_DATABASE !== 'atheron1-hotel-staging-20260923') { console.log('ABORT: base no autorizada.'); process.exit(1); }

const identityStore = new IdentityStore(JSON.parse(env.GATEWAY_TECHNICAL_IDENTITIES));
const auth = { 'x-agent-id': env.HOTEL_RECEPTION_AGENT_ID, authorization: `Bearer ${env.HOTEL_RECEPTION_AGENT_KEY}` };

async function viaGateway(config, query) {
  const adapter = new OdooHotelAdapter({ dryRun: false, config });
  const gateway = new HotelGateway({ identityStore, rateLimiter: new RateLimiter({ limit: 50, windowMs: 60_000 }), idempotencyStore: new IdempotencyStore(), adapter, auditLog: new AuditLog() });
  const server = createHotelGatewayServer({ gateway, readinessCheck: () => true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/hotel/availability`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ check_in: query.checkin, check_out: query.checkout, guests: query.guests }) });
    const json = await res.json().catch(() => ({}));
    // Misma regla que la ruta interna: respuesta de error => no confiable
    const view = res.status === 200 && json.ok === true ? buildReceptionAvailability(json, query) : dataUnavailableResult(query);
    return { http: res.status, statuses: view.units.map((u) => u.status) };
  } finally { server.close(); server.closeAllConnections?.(); }
}

const base = { baseUrl: env.ODOO_BASE_URL, database: env.ODOO_DATABASE, technicalUser: env.ODOO_TECHNICAL_USER, technicalSecret: env.ODOO_TECHNICAL_SECRET, actionId: 1967 };
const q1 = { checkin: '2027-06-01', checkout: '2027-08-15', guests: 2 };   // 75 noches: el gateway devuelve error
const q2 = { checkin: '2026-11-05', checkout: '2026-11-06', guests: 2 };   // Odoo inalcanzable
const errorCase = await viaGateway(base, q1);
const downCase = await viaGateway({ ...base, baseUrl: 'http://127.0.0.1:9' }, q2);
const onlyVerificar = (r) => r.statuses.every((s) => s === STATUS.VERIFICAR);
console.log('GATEWAY_ERROR_HTTP: ' + errorCase.http + ' -> ' + [...new Set(errorCase.statuses)].join(', '));
console.log('ODOO_DOWN_HTTP: ' + downCase.http + ' -> ' + [...new Set(downCase.statuses)].join(', '));
const pass = onlyVerificar(errorCase) && onlyVerificar(downCase);
console.log('FAIL_CLOSED_PASS: ' + (pass ? 'YES' : 'NO'));
process.exitCode = pass ? 0 : 2;
