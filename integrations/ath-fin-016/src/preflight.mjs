import { randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto';
import { OdooReadonlyClient } from './odoo-client.mjs';
import { validateManifest, EXPECTED_SCOPE } from './manifest.mjs';
import { movementReference } from './planner.mjs';

const REPORT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAmjnl+0TEdhv9z3GGOEA4\nHVyEO/woCemqmBR3purKC9+byYrYOTAvTI6hK1hVP1e4EFBzJ6jgmS1WgA0kjdwj\nTO1UGFKxPxL94R/mMcUNHc9KRFPhGH4vuuDnEa5oonj4rxRN9yrmNzn8vVojWd3E\noeYEVvC03U6UM6W92wNgBXVRbJ9M8t5ofmaimp9XZ2QMdnCSrQhSB4QQgm/CYt6m\nmF97alYRKI6DEjCXnLT7JeteQCGbmObGUFrtV41N2SeQn+XLNMv/+ImOHNPqcdyt\nCluD4XxRqzCGPIoLPiCha+uGQmcn+zIO2Ld4YuEYrzoEH7N/YTWS6keZyaL/ytRl\ntuFP3qit8cLiP8+P7fHPWxqQu1p0GMDYGBF5b44/p2XdmQ8N2hcpa/t7i7q14p3i\n7z582cx2EaNh2Kd+XlgHFT+dp2NVDNZRwW3J/jwVRz1V9hEUw9oVPGB7SIQst913\njRUnbHgDDW4hhJ3x5nI/JQo7ryZjrxT0sO9qwJZKW7nlAgMBAAE=\n-----END PUBLIC KEY-----';

function pickFields(schema, candidates) {
  return candidates.filter((field) => Object.hasOwn(schema ?? {}, field));
}

async function attempt(report, label, fn) {
  try {
    const value = await fn();
    report.checks[label] = { status: 'OK' };
    return value;
  } catch (error) {
    report.checks[label] = { status: 'ERROR', code: String(error?.code ?? error?.message ?? 'UNKNOWN').slice(0, 80) };
    return null;
  }
}

async function collectAccountCandidates(client, accountSchema) {
  const fields = pickFields(accountSchema, [
    'id', 'code', 'name', 'account_type', 'company_ids', 'deprecated', 'reconcile'
  ]);
  if (!fields.includes('id') || !fields.includes('code') || !fields.includes('name')) {
    return { status: 'SCHEMA_INCOMPLETE', bank111007: [], gmf: [], bankFee: [], interest: [], allCompanyAccounts: [] };
  }
  const bank111007 = await client.searchRead(
    'account.account', [['code', '=', EXPECTED_SCOPE.bankAccountCode]], fields, 20
  );
  const queries = {
    gmf: ['|', '|', '|', '|',
      ['name', 'ilike', 'GMF'], ['name', 'ilike', '4x1000'],
      ['name', 'ilike', 'gravamen'], ['name', 'ilike', 'impuesto'],
      ['name', 'ilike', 'tax']],
    bankFee: ['|', '|', '|', '|', '|',
      ['name', 'ilike', 'comision'], ['name', 'ilike', 'cuota'],
      ['name', 'ilike', 'bancario'], ['name', 'ilike', 'bank'],
      ['name', 'ilike', 'fee'], ['name', 'ilike', 'charge']],
    interest: ['|', '|', '|', '|',
      ['name', 'ilike', 'interes'], ['name', 'ilike', 'rendimiento'],
      ['name', 'ilike', 'financiero'], ['name', 'ilike', 'interest'],
      ['name', 'ilike', 'income']]
  };
  const result = { bank111007 };
  for (const [key, domain] of Object.entries(queries)) {
    result[key] = await client.searchRead('account.account', domain, fields, 200);
  }
  const companyId = bank111007.length === 1 && Array.isArray(bank111007[0].company_ids)
    ? bank111007[0].company_ids[0] : null;
  result.company_id = Number.isInteger(companyId) ? companyId : null;
  result.allCompanyAccounts = Number.isInteger(companyId)
    ? await client.searchRead('account.account', [['company_ids', 'in', [companyId]]], fields, 2000)
    : [];
  return { status: 'OK', ...result };
}

async function collectJournals(client, journalSchema) {
  const fields = pickFields(journalSchema, ['id', 'code', 'name', 'type', 'company_id', 'default_account_id', 'active']);
  const allBank = journalSchema?.type
    ? await client.searchRead('account.journal', [['type', '=', 'bank']], fields, 100)
    : [];
  const codeBC = journalSchema?.code
    ? await client.searchRead('account.journal', [['code', '=', 'BC']], fields, 20)
    : [];
  return { allBank, codeBC };
}

async function duplicateScan(client, manifest, bankAccount, journal) {
  const results = [];
  const bankAccountId = bankAccount?.id;
  const journalId = journal?.id;
  if (!Number.isInteger(bankAccountId)) return { status: 'BLOCKED_BANK_ACCOUNT_NOT_UNIQUE', movements: results };

  for (const movement of manifest.movements) {
    const reference = movementReference(movement.id);
    const exact = await client.searchRead(
      'account.move',
      [['ref', '=', reference]],
      ['id', 'name', 'date', 'journal_id', 'state', 'move_type', 'ref'],
      5
    );
    let possible = [];
    if (exact.length === 0) {
      const amount = Number((movement.amount_cents / 100).toFixed(2));
      const debit = movement.direction === 'credit' ? amount : 0;
      const credit = movement.direction === 'debit' ? amount : 0;
      const domain = [
        ['account_id', '=', bankAccountId],
        ['date', '=', movement.date],
        ['debit', '=', debit],
        ['credit', '=', credit]
      ];
      if (Number.isInteger(journalId)) domain.push(['move_id.journal_id', '=', journalId]);
      possible = await client.searchRead(
        'account.move.line',
        domain,
        ['id', 'move_id', 'account_id', 'debit', 'credit', 'date', 'name'],
        30
      );
    }
    results.push({
      movement_id: movement.id,
      exact_reference_count: exact.length,
      exact_reference_records: exact,
      possible_bank_line_count: possible.length,
      possible_bank_lines: possible,
      classification: exact.length > 1 ? 'DUPLICATE_REFERENCE_CONFLICT'
        : exact.length === 1 ? 'EXACT_REFERENCE_EXISTS_REVIEW'
          : possible.length > 0 ? 'POSSIBLE_DUPLICATE_REVIEW' : 'NO_MATCH_FOUND'
    });
  }
  return { status: 'COMPLETE_READ_ONLY', movements: results };
}

export async function collectPreflight(env = process.env, fetchImpl = globalThis.fetch) {
  const report = {
    project: 'ATH-FIN-016',
    generated_at: new Date().toISOString(),
    target: 'atheron1.odoo.com / atheron1',
    scope: EXPECTED_SCOPE.batchId,
    write_state: 'LOCKED_IN_SOURCE_CODE',
    checks: {},
    credential: null,
    user: null,
    acl: {},
    schemas: {},
    account_candidates: null,
    journals: null,
    manifest: { status: 'NOT_CONFIGURED' },
    duplicates: { status: 'NOT_RUN', movements: [] },
    errors: []
  };

  const baseUrl = String(env.ODOO_BASE_URL ?? '').trim();
  const database = String(env.ODOO_DATABASE ?? '').trim();
  const apiKey = String(env.ODOO_API_KEY ?? '').trim();
  if (!baseUrl || !database || !apiKey) {
    report.checks.credentials = { status: 'BLOCKED_MISSING_CONFIGURATION' };
    return report;
  }

  let client;
  try {
    client = new OdooReadonlyClient({ baseUrl, database, apiKey, fetchImpl });
  } catch (error) {
    report.checks.target = { status: 'BLOCKED', code: String(error?.code ?? error?.message ?? 'TARGET_INVALID') };
    return report;
  }

  const authCount = await attempt(report, 'json2_authentication', () =>
    client.searchCount('res.partner', [])
  );
  report.credential = { status: authCount === null ? 'FAILED' : 'AUTHENTICATED' };

  if (authCount === null) return report;

  const context = await attempt(report, 'user_context', () =>
    client.call('res.users', 'context_get', {})
  );
  if (context && typeof context === 'object') {
    const uid = Number(context.uid ?? context.user_id ?? NaN);
    report.user = {
      uid: Number.isInteger(uid) ? uid : null,
      allowed_company_ids: Array.isArray(context.allowed_company_ids) ? context.allowed_company_ids : [],
      group_membership: {}
    };
    for (const group of ['base.group_system', 'account.group_account_manager', 'account.group_account_user']) {
      const membership = await attempt(report, 'group_' + group.replaceAll('.', '_'), () =>
        client.call('res.users', 'has_group', { group_ext_id: group })
      );
      report.user.group_membership[group] = membership === null ? 'UNKNOWN' : Boolean(membership);
    }
  }

  for (const model of ['account.move', 'account.move.line', 'account.account', 'account.journal']) {
    const schema = await attempt(report, 'fields_' + model.replaceAll('.', '_'), () =>
      client.fieldsGet(model)
    );
    if (schema) report.schemas[model] = schema;
    for (const operation of ['read', 'create', 'write']) {
      const access = await attempt(report, 'acl_' + model.replaceAll('.', '_') + '_' + operation, () =>
        client.accessRight(model, operation)
      );
      report.acl[model] ??= {};
      report.acl[model][operation] = access === null ? 'UNKNOWN' : Boolean(access);
    }
  }

  const accountSchema = report.schemas['account.account'];
  const journalSchema = report.schemas['account.journal'];
  if (accountSchema) {
    report.account_candidates = await attempt(report, 'account_candidate_discovery', () =>
      collectAccountCandidates(client, accountSchema)
    );
  }
  if (journalSchema) {
    report.journals = await attempt(report, 'journal_discovery', () =>
      collectJournals(client, journalSchema)
    );
  }

  if (env.ATH_FIN016_MANIFEST_JSON) {
    try {
      const manifest = validateManifest(env.ATH_FIN016_MANIFEST_JSON);
      report.manifest = {
        status: 'VALIDATED_EXACT_SCOPE',
        count: manifest.movements.length,
        category_counts: manifest.counts,
        digest: manifest.digest
      };
      const bankRows = report.account_candidates?.bank111007 ?? [];
      const bcRows = report.journals?.codeBC ?? [];
      const bank = bankRows.length === 1 && bankRows[0].deprecated !== true ? bankRows[0] : null;
      const journal = bcRows.length === 1 ? bcRows[0] : null;
      report.duplicates = await attempt(report, 'duplicate_scan', () =>
        duplicateScan(client, manifest, bank, journal)
      ) ?? { status: 'ERROR', movements: [] };
    } catch (error) {
      report.manifest = {
        status: 'REJECTED',
        code: String(error?.message ?? 'MANIFEST_INVALID').slice(0, 100)
      };
    }
  }

  report.summary = {
    authentication: report.credential?.status ?? 'UNKNOWN',
    read_preflight: 'COMPLETED_WITH_PER_CHECK_STATUS',
    write_state: 'LOCKED_IN_SOURCE_CODE',
    no_odoo_writes_performed: true
  };
  return report;
}

export function encryptReport(report) {
  const plaintext = Buffer.from(JSON.stringify(report), 'utf8');
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = publicEncrypt({
    key: REPORT_PUBLIC_KEY,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, aesKey);
  return JSON.stringify({
    version: 1,
    algorithm: 'RSA-OAEP-SHA256 + AES-256-GCM',
    encrypted_key: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
}
