import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityStore, hashKey } from '../src/identity.mjs';
import { ContractError } from '../src/contract.mjs';

test('valid identity authenticates and gets minimum-privilege scopes', () => {
  const store = new IdentityStore();
  store.register({ agentId: 'claude-hotel-007', actor: 'claude', rawKey: 'k1' });

  const identity = store.authenticate('claude-hotel-007', 'k1');
  assert.equal(identity.agentId, 'claude-hotel-007');
  assert.deepEqual([...identity.scopes], ['availability', 'quote', 'hold', 'status']);
});

test('no admin scope is ever granted (no grupo 148 equivalent)', () => {
  const store = new IdentityStore();
  store.register({ agentId: 'claude-hotel-007', actor: 'claude', rawKey: 'k1' });
  const identity = store.authenticate('claude-hotel-007', 'k1');
  assert.equal(store.isAuthorizedFor(identity, 'admin'), false);
  assert.equal(store.isAuthorizedFor(identity, 'confirm'), false);
});

test('missing credentials -> UNAUTHORIZED', () => {
  const store = new IdentityStore();
  assert.throws(
    () => store.authenticate(undefined, undefined),
    (error) => error instanceof ContractError && error.code === 'UNAUTHORIZED'
  );
});

test('unknown agent_id -> UNAUTHORIZED', () => {
  const store = new IdentityStore();
  store.register({ agentId: 'claude-hotel-007', actor: 'claude', rawKey: 'k1' });
  assert.throws(
    () => store.authenticate('someone-else', 'k1'),
    (error) => error instanceof ContractError && error.code === 'UNAUTHORIZED'
  );
});

test('wrong key -> UNAUTHORIZED', () => {
  const store = new IdentityStore();
  store.register({ agentId: 'claude-hotel-007', actor: 'claude', rawKey: 'k1' });
  assert.throws(
    () => store.authenticate('claude-hotel-007', 'wrong-key'),
    (error) => error instanceof ContractError && error.code === 'UNAUTHORIZED'
  );
});

test('revoked identity -> UNAUTHORIZED, no code change needed (Fase 15)', () => {
  const store = new IdentityStore();
  store.register({ agentId: 'codex-hotel-007', actor: 'codex', rawKey: 'k1' });
  assert.equal(store.authenticate('codex-hotel-007', 'k1').agentId, 'codex-hotel-007');

  const revoked = store.revoke('codex-hotel-007');
  assert.equal(revoked, true);

  assert.throws(
    () => store.authenticate('codex-hotel-007', 'k1'),
    (error) => error instanceof ContractError && error.code === 'UNAUTHORIZED'
  );
});

test('rotating a key invalidates the old one immediately', () => {
  const store = new IdentityStore();
  store.register({ agentId: 'chatgpt-hotel-007', actor: 'chatgpt', rawKey: 'old-key' });

  store.rotate('chatgpt-hotel-007', 'new-key');

  assert.throws(
    () => store.authenticate('chatgpt-hotel-007', 'old-key'),
    (error) => error instanceof ContractError && error.code === 'UNAUTHORIZED'
  );
  assert.equal(store.authenticate('chatgpt-hotel-007', 'new-key').agentId, 'chatgpt-hotel-007');
});

test('fromEnv loads identities without ever storing raw keys', () => {
  const rawKey = 'super-secret-key';
  const env = JSON.stringify([
    { agentId: 'sofia-hotel-007', actor: 'sofia', keyHash: hashKey(rawKey) },
  ]);
  const store = IdentityStore.fromEnv(env);
  const identity = store.authenticate('sofia-hotel-007', rawKey);
  assert.equal(identity.actor, 'sofia');
});
