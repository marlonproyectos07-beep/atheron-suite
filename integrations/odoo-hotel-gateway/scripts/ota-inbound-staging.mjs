#!/usr/bin/env node
/** Manual P0 pilot for one Odoo STAGING feed. Never print feed references. */
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { GuardError, loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { createGatewayOdooPort } from '../../odoo-hotel-ical/src/gateway-odoo-port.mjs';
import { createOdooInboundFeedStore } from '../../odoo-hotel-ical/src/inbound-odoo-feed-store.mjs';
import { runConfiguredInbound } from '../../odoo-hotel-ical/src/inbound-importer.mjs';

export async function runStagingFeed(feedId, env = process.env) {
  if (!Number.isSafeInteger(feedId) || feedId < 1) throw new Error('FEED_ID_REQUIRED');
  const config = loadGuardedConfig(env);
  const feedStore = createOdooInboundFeedStore({
    config, transport: new HttpOdooTransport({ baseUrl: config.baseUrl }),
  });
  const configured = await feedStore.listConfigured();
  const selected = configured.find((row) => row.id === feedId);
  if (!selected) throw new Error('FEED_NOT_FOUND');
  if (selected.x_source !== 'booking' || selected.x_canonical_unit_id !== 'AHS-302'
      || Number(Array.isArray(selected.x_odoo_unit_id)
        ? selected.x_odoo_unit_id[0] : selected.x_odoo_unit_id) !== 5) {
    throw new Error('PILOT_SCOPE_VIOLATION');
  }
  const built = buildGatewayFromEnv({ ...env, DRY_RUN: 'false' });
  const rawKey = randomUUID();
  const agentId = 'ota-inbound-staging-local';
  built.identityStore.register({ agentId, actor: 'codex', rawKey });
  const operations = ['ota_blocks_list', 'ota_block_apply', 'ota_snapshot_list', 'ota_snapshot_put'];
  const client = Object.fromEntries(operations.map((operation) => [operation, async (body) => {
    const result = await built.gateway.handle({ operation, agentId, rawKey, body });
    return result.envelope;
  }]));
  const odoo = createGatewayOdooPort({ client });
  const scopedStore = { ...feedStore, listConfigured: async () => [selected] };
  return runConfiguredInbound({ feedStore: scopedStore, odoo, onlyFeedId: feedId });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStagingFeed(Number(process.argv[2])).then((result) => {
    console.log(JSON.stringify(result));
    if (result.results.some((r) => r.status === 'ERROR' || r.status === 'REVIEW')) process.exitCode = 1;
  }).catch((error) => {
    const code = error instanceof GuardError ? 'STAGING_CONFIG_REQUIRED'
      : /^[A-Z][A-Z0-9_]{2,64}$/.test(error?.message ?? '') ? error.message : 'INBOUND_RUN_FAILED';
    console.error(code);
    process.exitCode = 2;
  });
}
