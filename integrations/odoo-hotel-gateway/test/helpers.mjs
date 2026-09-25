import { IdentityStore } from '../src/identity.mjs';
import { RateLimiter } from '../src/rate-limiter.mjs';
import { IdempotencyStore } from '../src/idempotency-store.mjs';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { AuditLog } from '../src/audit-log.mjs';
import { HotelGateway } from '../src/gateway.mjs';
import { createHotelGatewayServer } from '../src/server.mjs';
import { FakeOdooTransport } from './fakes/odoo-transport.fake.mjs';

export { FakeOdooTransport };

/**
 * Identidades de prueba SOLO en memoria. No son secretos reales: existen
 * unicamente dentro del proceso de test y nunca se persisten ni se loguean.
 */
export const TEST_IDENTITIES = {
  claude: { agentId: 'claude-hotel-007', actor: 'claude', rawKey: 'test-claude-key' },
  chatgpt: { agentId: 'chatgpt-hotel-007', actor: 'chatgpt', rawKey: 'test-chatgpt-key' },
};

export function buildTestGateway({ rateLimit = 60 } = {}) {
  const identityStore = new IdentityStore();
  for (const identity of Object.values(TEST_IDENTITIES)) {
    identityStore.register(identity);
  }

  const rateLimiter = new RateLimiter({ limit: rateLimit, windowMs: 60_000 });
  const idempotencyStore = new IdempotencyStore();
  const adapter = new OdooHotelAdapter({ dryRun: true });
  const auditLog = new AuditLog();

  const gateway = new HotelGateway({ identityStore, rateLimiter, idempotencyStore, adapter, auditLog });

  return { gateway, identityStore, rateLimiter, idempotencyStore, adapter, auditLog };
}

/**
 * Igual que buildTestGateway, pero con el adapter en modo LIVE
 * (dryRun: false) apuntando a un transporte Odoo simulado/injectable en vez
 * de red real. `database`/`technicalUser`/`technicalSecret` son cadenas de
 * prueba sin ningun valor real: solo existen para que el adapter considere
 * la configuracion "completa" y llame al transporte inyectado, que es quien
 * de verdad responde (en memoria, sin red).
 */
export function buildLiveTestGateway({ rateLimit = 60, transport = new FakeOdooTransport() } = {}) {
  const identityStore = new IdentityStore();
  for (const identity of Object.values(TEST_IDENTITIES)) {
    identityStore.register(identity);
  }

  const rateLimiter = new RateLimiter({ limit: rateLimit, windowMs: 60_000 });
  const idempotencyStore = new IdempotencyStore();
  const adapter = new OdooHotelAdapter({
    dryRun: false,
    config: {
      database: 'test-db-not-real',
      technicalUser: 'test-user-not-real',
      technicalSecret: 'test-secret-not-real',
      actionId: 1967,
    },
    transport,
  });
  const auditLog = new AuditLog();

  const gateway = new HotelGateway({ identityStore, rateLimiter, idempotencyStore, adapter, auditLog });

  return { gateway, identityStore, rateLimiter, idempotencyStore, adapter, auditLog, transport };
}

export function withIdentity(identity, overrides = {}) {
  return { agentId: identity.agentId, rawKey: identity.rawKey, ...overrides };
}

export async function buildTestServer(options = {}) {
  const built = buildTestGateway(options);
  const server = createHotelGatewayServer({ gateway: built.gateway, readinessCheck: () => true });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    ...built,
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

