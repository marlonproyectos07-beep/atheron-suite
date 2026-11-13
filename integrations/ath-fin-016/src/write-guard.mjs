import { EXPECTED_SCOPE } from './manifest.mjs';

/**
 * Hard lock for the preparation phase.
 * It is intentionally false in source. The preflight workflow never imports
 * this writer, and every call fails before the first HTTP request.
 * A future release must be a separately reviewed change after account mapping,
 * duplicate scan, security review and fresh explicit authorization.
 */
export const CODE_WRITE_LOCK = false;
const ALLOWED_MOVEMENT_IDS = new Set(EXPECTED_SCOPE.movementIds);

export function assertFinancialWriteGate({ batchId, manifestDigest, releaseToken }) {
  if (CODE_WRITE_LOCK !== true) throw new Error('ATH_FIN016_WRITE_LOCKED');
  if (batchId !== EXPECTED_SCOPE.batchId) throw new Error('ATH_FIN016_BATCH_NOT_AUTHORIZED');
  if (manifestDigest !== EXPECTED_SCOPE.sha256) throw new Error('ATH_FIN016_MANIFEST_NOT_AUTHORIZED');
  if (typeof releaseToken !== 'string' || releaseToken.length < 32) throw new Error('ATH_FIN016_RELEASE_TOKEN_REQUIRED');
  return true;
}

function validateDraft(draft) {
  if (draft?.model !== 'account.move' || draft?.method !== 'create') throw new Error('ATH_FIN016_MOVE_CREATE_ONLY');
  const values = draft.params?.vals_list;
  if (!Array.isArray(values) || values.length !== 1) throw new Error('ATH_FIN016_ONE_MOVE_ONLY');
  const move = values[0];
  const movementId = typeof move.ref === 'string' ? move.ref.split('|').at(-1) : '';
  if (move.ref !== 'ATH-FIN-015|LOTE-A|' + movementId || !ALLOWED_MOVEMENT_IDS.has(movementId)) {
    throw new Error('ATH_FIN016_REFERENCE_OUT_OF_SCOPE');
  }
  if (!Array.isArray(move.line_ids) || move.line_ids.length !== 2) throw new Error('ATH_FIN016_TWO_LINES_REQUIRED');
  const lines = move.line_ids.map((command) => {
    if (!Array.isArray(command) || command.length !== 3 || command[0] !== 0 || command[1] !== 0) {
      throw new Error('ATH_FIN016_LINE_COMMAND_INVALID');
    }
    return command[2];
  });
  const cents = (value) => Math.round(Number(value || 0) * 100);
  const debit = lines.reduce((sum, line) => sum + cents(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + cents(line.credit), 0);
  if (debit <= 0 || debit !== credit) throw new Error('ATH_FIN016_MOVE_NOT_BALANCED');
  for (const line of lines) {
    if (!Number.isInteger(line.account_id) || line.account_id <= 0) throw new Error('ATH_FIN016_ACCOUNT_ID_INVALID');
    if (typeof line.name !== 'string' || !line.name) throw new Error('ATH_FIN016_LINE_NAME_REQUIRED');
  }
}

export class GuardedFinancialWriter {
  constructor({ baseUrl, database, apiKey, fetchImpl = globalThis.fetch }) {
    this.baseUrl = String(baseUrl ?? '').replace(/\/$/, '');
    this.database = database;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.posts = 0;
  }

  async #request(model, method, params) {
    if (!this.baseUrl || !this.database || !this.apiKey) throw new Error('ATH_FIN016_WRITE_CONFIG_MISSING');
    if (this.baseUrl !== 'https://atheron1.odoo.com' || this.database !== 'atheron1') {
      throw new Error('ATH_FIN016_WRITE_TARGET_BLOCKED');
    }
    const response = await this.fetch(this.baseUrl + '/json/2/' + model + '/' + method, {
      method: 'POST',
      headers: {
        authorization: 'bearer ' + this.apiKey,
        'x-odoo-database': this.database,
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('ATH_FIN016_WRITE_HTTP_' + response.status);
    return response.json();
  }

  async createAndPost({ draft, batchId, manifestDigest, releaseToken, duplicateState }) {
    assertFinancialWriteGate({ batchId, manifestDigest, releaseToken });
    if (duplicateState !== 'NO_MATCH_FOUND') throw new Error('ATH_FIN016_DUPLICATE_GATE_BLOCKED');
    validateDraft(draft);
    if (this.posts >= EXPECTED_SCOPE.movementCount) throw new Error('ATH_FIN016_BATCH_LIMIT_REACHED');
    this.posts += 1; // consumir antes de red: un fallo ambiguo no permite reintento ciego
    const created = await this.#request(draft.model, draft.method, draft.params);
    const moveId = Array.isArray(created) ? created[0] : created;
    if (!Number.isInteger(moveId) || moveId <= 0) throw new Error('ATH_FIN016_CREATE_RESULT_INVALID');
    await this.#request('account.move', 'action_post', { ids: [moveId] });
    return { moveId, state: 'POSTED' };
  }
}

/** Compatibility name used by the locked-phase tests. */
export class LockedFinancialWriter extends GuardedFinancialWriter {
  constructor() {
    super({ baseUrl: '', database: '', apiKey: '', fetchImpl: async () => {
      throw new Error('NETWORK_MUST_NOT_BE_CALLED');
    } });
  }
}
