import { EXPECTED_SCOPE } from './manifest.mjs';
import { APPROVED_ODOO_MAPPING } from './accounting-map.mjs';

export const WRITE_ENABLED = true;
export const RELEASE_TOKEN = `ATH-FIN-016-EXECUTE|${EXPECTED_SCOPE.batchId}|${EXPECTED_SCOPE.sha256}`;
const ALLOWED_MOVEMENT_IDS = new Set(EXPECTED_SCOPE.movementIds);
const CONTEXT = Object.freeze({ allowed_company_ids: [APPROVED_ODOO_MAPPING.companyId] });

function idOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cents(value) {
  return Math.round(Number(value ?? 0) * 100);
}

export function assertFinancialWriteGate({ batchId, manifestDigest, releaseToken }) {
  if (WRITE_ENABLED !== true) throw new Error('ATH_FIN016_WRITE_DISABLED');
  if (batchId !== EXPECTED_SCOPE.batchId) throw new Error('ATH_FIN016_BATCH_NOT_AUTHORIZED');
  if (manifestDigest !== EXPECTED_SCOPE.sha256) throw new Error('ATH_FIN016_MANIFEST_NOT_AUTHORIZED');
  if (releaseToken !== RELEASE_TOKEN) throw new Error('ATH_FIN016_RELEASE_MARKER_REQUIRED');
  return true;
}

export function validateDraft(draft, movement) {
  if (draft?.model !== 'account.move' || draft?.method !== 'create') throw new Error('ATH_FIN016_MOVE_CREATE_ONLY');
  if (!movement || !ALLOWED_MOVEMENT_IDS.has(movement.id)) throw new Error('ATH_FIN016_MOVEMENT_OUT_OF_SCOPE');
  const values = draft.params?.vals_list;
  if (!Array.isArray(values) || values.length !== 1) throw new Error('ATH_FIN016_ONE_MOVE_ONLY');
  const move = values[0];
  const expectedRef = 'ATH-FIN-015|LOTE-A|' + movement.id;
  if (move.ref !== expectedRef || move.date !== movement.date ||
      move.journal_id !== APPROVED_ODOO_MAPPING.bankJournal.id) {
    throw new Error('ATH_FIN016_MOVE_HEADER_INVALID');
  }
  if (JSON.stringify(Object.keys(move).sort()) !== JSON.stringify(['date', 'journal_id', 'line_ids', 'ref'])) {
    throw new Error('ATH_FIN016_MOVE_FIELDS_INVALID');
  }
  if (!Array.isArray(move.line_ids) || move.line_ids.length !== 2) throw new Error('ATH_FIN016_TWO_LINES_REQUIRED');
  const lines = move.line_ids.map((command) => {
    if (!Array.isArray(command) || command.length !== 3 || command[0] !== 0 || command[1] !== 0) {
      throw new Error('ATH_FIN016_LINE_COMMAND_INVALID');
    }
    const line = command[2];
    if (JSON.stringify(Object.keys(line).sort()) !== JSON.stringify(['account_id', 'credit', 'debit', 'name'])) {
      throw new Error('ATH_FIN016_LINE_FIELDS_INVALID');
    }
    if (!Number.isInteger(line.account_id) || typeof line.name !== 'string' || !line.name) {
      throw new Error('ATH_FIN016_LINE_INVALID');
    }
    return line;
  });

  const bankId = APPROVED_ODOO_MAPPING.bankAccount.id;
  const offsetId = movement.category === 'INTEREST'
    ? APPROVED_ODOO_MAPPING.interestIncome.id
    : APPROVED_ODOO_MAPPING.gmfExpense.id;
  const byAccount = new Map(lines.map((line) => [line.account_id, line]));
  if (byAccount.size !== 2 || !byAccount.has(bankId) || !byAccount.has(offsetId)) {
    throw new Error('ATH_FIN016_ACCOUNT_SCOPE_INVALID');
  }

  const amount = movement.amount_cents;
  const bank = byAccount.get(bankId);
  const offset = byAccount.get(offsetId);
  const expected = movement.direction === 'debit'
    ? { bankDebit: 0, bankCredit: amount, offsetDebit: amount, offsetCredit: 0 }
    : { bankDebit: amount, bankCredit: 0, offsetDebit: 0, offsetCredit: amount };
  if (cents(bank.debit) !== expected.bankDebit || cents(bank.credit) !== expected.bankCredit ||
      cents(offset.debit) !== expected.offsetDebit || cents(offset.credit) !== expected.offsetCredit) {
    throw new Error('ATH_FIN016_AMOUNT_OR_DIRECTION_INVALID');
  }
  const debit = lines.reduce((sum, line) => sum + cents(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + cents(line.credit), 0);
  if (debit !== credit || debit !== amount) throw new Error('ATH_FIN016_MOVE_NOT_BALANCED');
  return move;
}

export class GuardedFinancialWriter {
  constructor({ baseUrl, database, apiKey, fetchImpl = globalThis.fetch }) {
    this.baseUrl = String(baseUrl ?? '').replace(/\/$/, '');
    this.database = database;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.processed = 0;
  }

  async #request(model, method, params) {
    const allowed = new Set([
      'account.move:create',
      'account.move:read',
      'account.move:action_post',
      'account.move.line:read'
    ]);
    if (!allowed.has(model + ':' + method)) throw new Error('ATH_FIN016_WRITE_METHOD_BLOCKED');
    if (!this.baseUrl || !this.database || !this.apiKey) throw new Error('ATH_FIN016_WRITE_CONFIG_MISSING');
    if (this.baseUrl !== 'https://atheron1.odoo.com' || this.database !== 'atheron1') {
      throw new Error('ATH_FIN016_WRITE_TARGET_BLOCKED');
    }
    const response = await this.fetch(this.baseUrl + '/json/2/' + model + '/' + method, {
      method: 'POST',
      headers: {
        authorization: 'bearer ' + this.apiKey,
        'x-odoo-database': this.database,
        'content-type': 'application/json; charset=utf-8',
        'user-agent': 'ATHERON-ATH-FIN-016/1.0'
      },
      body: JSON.stringify({ ...params, context: CONTEXT }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('ATH_FIN016_WRITE_HTTP_' + response.status);
    return response.json();
  }

  async #snapshot(moveId) {
    const moves = await this.#request('account.move', 'read', {
      ids: [moveId],
      fields: ['id', 'name', 'state', 'date', 'journal_id', 'ref', 'line_ids', 'company_id']
    });
    if (!Array.isArray(moves) || moves.length !== 1) throw new Error('ATH_FIN016_MOVE_READBACK_FAILED');
    const move = moves[0];
    const lineIds = Array.isArray(move.line_ids) ? move.line_ids : [];
    const lines = lineIds.length
      ? await this.#request('account.move.line', 'read', {
          ids: lineIds,
          fields: ['id', 'name', 'account_id', 'debit', 'credit', 'move_id']
        })
      : [];
    return { move, lines };
  }

  #verifySnapshot(snapshot, draft, movement, expectedState) {
    const { move, lines } = snapshot;
    const expectedMove = draft.params.vals_list[0];
    if (move.state !== expectedState || move.date !== movement.date ||
        move.ref !== expectedMove.ref ||
        idOf(move.journal_id) !== APPROVED_ODOO_MAPPING.bankJournal.id ||
        idOf(move.company_id) !== APPROVED_ODOO_MAPPING.companyId) {
      throw new Error('ATH_FIN016_MOVE_READBACK_MISMATCH');
    }
    const expectedLines = expectedMove.line_ids.map((command) => command[2]);
    if (!Array.isArray(lines) || lines.length !== 2) throw new Error('ATH_FIN016_LINE_READBACK_COUNT_MISMATCH');
    const normalize = (line) => ({
      account_id: idOf(line.account_id),
      debit: cents(line.debit),
      credit: cents(line.credit),
      name: line.name
    });
    const sortKey = (line) => String(line.account_id).padStart(12, '0');
    const actual = lines.map(normalize).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const expected = expectedLines.map(normalize).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('ATH_FIN016_LINE_READBACK_MISMATCH');
    if (lines.some((line) => idOf(line.move_id) !== move.id)) throw new Error('ATH_FIN016_LINE_PARENT_MISMATCH');
    return { moveId: move.id, moveName: move.name, state: move.state };
  }

  async createAndPost({ draft, movement, batchId, manifestDigest, releaseToken, duplicateState, existingMove = null }) {
    assertFinancialWriteGate({ batchId, manifestDigest, releaseToken });
    validateDraft(draft, movement);
    if (this.processed >= EXPECTED_SCOPE.movementCount) throw new Error('ATH_FIN016_BATCH_LIMIT_REACHED');
    if (duplicateState === 'POSSIBLE_DUPLICATE_REVIEW' || duplicateState === 'DUPLICATE_REFERENCE_CONFLICT') {
      throw new Error('ATH_FIN016_DUPLICATE_GATE_BLOCKED');
    }
    if (existingMove && duplicateState !== 'EXACT_REFERENCE_EXISTS_REVIEW') {
      throw new Error('ATH_FIN016_EXISTING_MOVE_STATE_INVALID');
    }
    if (!existingMove && duplicateState !== 'NO_MATCH_FOUND') {
      throw new Error('ATH_FIN016_DUPLICATE_GATE_BLOCKED');
    }

    let moveId;
    let action;
    if (existingMove) {
      moveId = Number(existingMove.id);
      if (!Number.isInteger(moveId) || moveId <= 0 || existingMove.ref !== draft.params.vals_list[0].ref) {
        throw new Error('ATH_FIN016_EXISTING_MOVE_INVALID');
      }
      const current = this.#verifySnapshot(await this.#snapshot(moveId), draft, movement, existingMove.state);
      if (current.state === 'posted') {
        this.processed += 1;
        return { ...current, action: 'ALREADY_POSTED' };
      }
      if (current.state !== 'draft') throw new Error('ATH_FIN016_EXISTING_MOVE_STATE_BLOCKED');
      action = 'RESUMED_AND_POSTED';
    } else {
      const created = await this.#request('account.move', 'create', draft.params);
      moveId = Array.isArray(created) && created.length === 1 ? Number(created[0]) : Number(created);
      if (!Number.isInteger(moveId) || moveId <= 0) throw new Error('ATH_FIN016_CREATE_RESULT_INVALID');
      this.#verifySnapshot(await this.#snapshot(moveId), draft, movement, 'draft');
      action = 'CREATED_AND_POSTED';
    }

    await this.#request('account.move', 'action_post', { ids: [moveId] });
    const posted = this.#verifySnapshot(await this.#snapshot(moveId), draft, movement, 'posted');
    this.processed += 1;
    return { ...posted, action };
  }
}
