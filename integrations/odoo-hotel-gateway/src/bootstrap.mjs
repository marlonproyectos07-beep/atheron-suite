import { IdentityStore } from './identity.mjs';
import { RateLimiter } from './rate-limiter.mjs';
import { IdempotencyStore } from './idempotency-store.mjs';
import { OdooHotelAdapter } from './odoo-adapter.mjs';
import { AuditLog } from './audit-log.mjs';
import { HotelGateway } from './gateway.mjs';
import { createHotelGatewayServer } from './server.mjs';

/**
 * Construye el gateway completo a partir de variables de entorno.
 * DRY_RUN=true (default) es el unico modo usado/probado en este repositorio;
 * DRY_RUN=false requiere credenciales reales fuera del repo y no ha sido
 * ejercitado contra un Odoo real en esta sesion (PENDIENTE_CREDENCIAL_SEGURA).
 */
export function buildGatewayFromEnv(env = process.env) {
  const dryRun = env.DRY_RUN !== 'false';

  const identityStore = IdentityStore.fromEnv(env.GATEWAY_TECHNICAL_IDENTITIES);
  const rateLimiter = new RateLimiter({
    limit: env.GATEWAY_RATE_LIMIT ? Number(env.GATEWAY_RATE_LIMIT) : 60,
    windowMs: env.GATEWAY_RATE_WINDOW_MS ? Number(env.GATEWAY_RATE_WINDOW_MS) : 60_000,
  });
  const idempotencyStore = new IdempotencyStore();
  const adapter = new OdooHotelAdapter({
    dryRun,
    config: {
      baseUrl: env.ODOO_BASE_URL,
      database: env.ODOO_DATABASE,
      technicalUser: env.ODOO_TECHNICAL_USER,
      technicalSecret: env.ODOO_TECHNICAL_SECRET,
      actionId: env.ODOO_ACTION_ID ? Number(env.ODOO_ACTION_ID) : 1967,
    },
  });
  const auditLog = new AuditLog();

  const gateway = new HotelGateway({ identityStore, rateLimiter, idempotencyStore, adapter, auditLog });

  return { gateway, identityStore, rateLimiter, idempotencyStore, adapter, auditLog, dryRun };
}

export function startServerFromEnv(env = process.env) {
  const built = buildGatewayFromEnv(env);
  const server = createHotelGatewayServer({
    gateway: built.gateway,
    readinessCheck: () => built.dryRun || Boolean(env.ODOO_BASE_URL),
  });
  const port = env.PORT ? Number(env.PORT) : 8787;
  server.listen(port);
  return { server, port, ...built };
}
