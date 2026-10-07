import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityStore, hashKey, normalizeScopes } from '../src/identity.mjs';
import { HotelGateway } from '../src/gateway.mjs';
import { RateLimiter } from '../src/rate-limiter.mjs';
import { IdempotencyStore } from '../src/idempotency-store.mjs';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { AuditLog } from '../src/audit-log.mjs';

const RECEPTION = { agentId: 'recepcion-hotel-018', actor: 'recepcion', rawKey: 'test-recepcion-key-no-real' };

function buildGateway(identities) {
  const identityStore = new IdentityStore(identities);
  const adapter = new OdooHotelAdapter({ dryRun: true });
  const calls = [];
  const original = adapter.hold.bind(adapter);
  adapter.hold = (req) => { calls.push('hold'); return original(req); };
  const auditLog = new AuditLog();
  const gateway = new HotelGateway({
    identityStore,
    rateLimiter: new RateLimiter({ limit: 60, windowMs: 60_000 }),
    idempotencyStore: new IdempotencyStore(),
    adapter,
    auditLog,
  });
  return { gateway, auditLog, calls };
}

const receptionEntry = () => ({ agentId: RECEPTION.agentId, actor: RECEPTION.actor, keyHash: hashKey(RECEPTION.rawKey), scopes: ['availability'] });

test('normalizeScopes: sin declarar concede el conjunto completo (compatibilidad)', () => {
  assert.deepEqual([...normalizeScopes(undefined)], ['availability', 'quote', 'hold', 'status']);
});

test('normalizeScopes: acepta subconjuntos y rechaza vacío, duplicados y alcances desconocidos', () => {
  assert.deepEqual([...normalizeScopes(['availability'])], ['availability']);
  assert.throws(() => normalizeScopes([]), /SCOPES_INVALID/);
  assert.throws(() => normalizeScopes(['availability', 'availability']), /SCOPES_INVALID/);
  assert.throws(() => normalizeScopes(['admin']), /SCOPES_INVALID/);
  assert.throws(() => normalizeScopes('availability'), /SCOPES_INVALID/);
});

test('GATEWAY_TECHNICAL_IDENTITIES: la identidad de recepción queda solo con availability', () => {
  const store = IdentityStore.fromEnv(JSON.stringify([receptionEntry()]));
  const identity = store.authenticate(RECEPTION.agentId, RECEPTION.rawKey);
  assert.deepEqual([...identity.scopes], ['availability']);
  assert.equal(store.isAuthorizedFor(identity, 'availability'), true);
  assert.equal(store.isAuthorizedFor(identity, 'hold'), false);
  assert.equal(store.isAuthorizedFor(identity, 'quote'), false);
  assert.equal(store.isAuthorizedFor(identity, 'status'), false);
});

test('GATEWAY_TECHNICAL_IDENTITIES: un alcance inválido en la configuración falla al arrancar', () => {
  const bad = { ...receptionEntry(), scopes: ['availability', 'confirm'] };
  assert.throws(() => IdentityStore.fromEnv(JSON.stringify([bad])), /SCOPES_INVALID/);
});

test('gateway: la identidad de recepción SÍ puede consultar disponibilidad', async () => {
  const { gateway } = buildGateway([receptionEntry()]);
  const { status, envelope } = await gateway.handle({
    operation: 'availability',
    agentId: RECEPTION.agentId,
    rawKey: RECEPTION.rawKey,
    body: { check_in: '2026-11-05', check_out: '2026-11-06', guests: 2 },
  });
  assert.equal(status, 200);
  assert.equal(envelope.ok, true);
});

test('gateway: la identidad de recepción NO puede crear cotización ni HOLD, y no llega al adaptador', async () => {
  const { gateway, auditLog, calls } = buildGateway([receptionEntry()]);
  for (const operation of ['hold', 'quote', 'status']) {
    const { envelope, code } = await gateway.handle({
      operation,
      agentId: RECEPTION.agentId,
      rawKey: RECEPTION.rawKey,
      body: { quote_id: 'Q-1', idempotency_key: 'k-1', check_in: '2026-11-05', check_out: '2026-11-06', guests: 2, client_ref: 'x' },
    });
    assert.equal(envelope.ok, false);
    assert.equal(code, 'FORBIDDEN_OPERATION');
  }
  assert.deepEqual(calls, []);
  const entries = auditLog.list();
  assert.equal(entries.length, 3);
  assert.ok(entries.every((e) => e.result === 'error' && e.error_code === 'FORBIDDEN_OPERATION'));
});

test('gateway: identidades existentes conservan sus cuatro alcances', async () => {
  const existing = { agentId: 'claude-hotel-007', actor: 'claude', keyHash: hashKey('k-claude'), revoked: false };
  const { gateway } = buildGateway([existing]);
  const { envelope } = await gateway.handle({
    operation: 'availability',
    agentId: 'claude-hotel-007',
    rawKey: 'k-claude',
    body: { check_in: '2026-11-05', check_out: '2026-11-06', guests: 2 },
  });
  assert.equal(envelope.ok, true);
});
