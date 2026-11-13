import { EXPECTED_SCOPE } from './manifest.mjs';

/**
 * Hard lock for the preparation phase. It is intentionally false in source,
 * and the preflight workflow never imports a write-capable transport.
 * Opening it requires a separate reviewed change and a new explicit release.
 */
export const CODE_WRITE_LOCK = false;

export function assertFinancialWriteGate({ batchId, manifestDigest, releaseToken }) {
  if (CODE_WRITE_LOCK !== true) throw new Error('ATH_FIN016_WRITE_LOCKED');
  if (batchId !== EXPECTED_SCOPE.batchId) throw new Error('ATH_FIN016_BATCH_NOT_AUTHORIZED');
  if (manifestDigest !== EXPECTED_SCOPE.sha256) throw new Error('ATH_FIN016_MANIFEST_NOT_AUTHORIZED');
  if (typeof releaseToken !== 'string' || releaseToken.length < 32) throw new Error('ATH_FIN016_RELEASE_TOKEN_REQUIRED');
  return true;
}

/**
 * Future adapter deliberately refuses all requests in this branch.
 * There is no network transport here and no route to account.move.create/action_post.
 */
export class LockedFinancialWriter {
  async createAndPost() {
    throw new Error('ATH_FIN016_WRITE_LOCKED');
  }
}
