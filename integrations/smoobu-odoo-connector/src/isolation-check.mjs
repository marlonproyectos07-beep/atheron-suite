/**
 * Comprobacion de aislamiento de staging (SOLO LECTURA). Falla cerrado: cualquier dato que no se pueda
 * leer cuenta como NO aprobado. Debe ejecutarse con la credencial de STAGING, nunca con la de produccion.
 */
const EXTERNAL_WORDS = /smoobu|beds24|nobeds|booking|airbnb|ical|channel|webhook|whatsapp|sync|ota/i;

async function check(name, fn) {
  try { return { name, ...(await fn()) }; } catch (e) {
    return { name, passed: false, reason: 'NOT_READABLE', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null };
  }
}

export async function runIsolationCheck({ odoo, database, expectedDatabase }) {
  const checks = [];
  checks.push(await check('database-is-staging', async () => ({ passed: database === expectedDatabase && database !== 'atheron1' })));
  checks.push(await check('outgoing-mail-servers-inactive', async () => {
    const rows = await odoo.searchRead('ir.mail_server', [['active', '=', true]], ['id']);
    return { passed: rows.length === 0, activeCount: rows.length };
  }));
  checks.push(await check('active-crons-without-external-names', async () => {
    const rows = await odoo.searchRead('ir.cron', [['active', '=', true]], ['id', 'cron_name', 'ir_actions_server_id']);
    const flagged = rows.filter((r) => EXTERNAL_WORDS.test(String(r.cron_name ?? '')));
    return { passed: flagged.length === 0, activeCrons: rows.length, flagged: flagged.map((r) => ({ id: r.id, name: r.cron_name })) };
  }));
  checks.push(await check('no-webhook-server-actions', async () => {
    const rows = await odoo.searchRead('ir.actions.server', [['state', '=', 'webhook']], ['id', 'name']);
    return { passed: rows.length === 0, count: rows.length, ids: rows.map((r) => r.id) };
  }));
  checks.push(await check('no-external-names-in-automations', async () => {
    const rows = await odoo.searchRead('base.automation', [['active', '=', true]], ['id', 'name']);
    const flagged = rows.filter((r) => EXTERNAL_WORDS.test(String(r.name ?? '')));
    return { passed: flagged.length === 0, activeAutomations: rows.length, flagged: flagged.map((r) => ({ id: r.id, name: r.name })) };
  }));
  checks.push(await check('payment-providers-disabled', async () => {
    const rows = await odoo.searchRead('payment.provider', [['state', '!=', 'disabled']], ['id', 'state']);
    return { passed: rows.length === 0, enabled: rows.map((r) => ({ id: r.id, state: r.state })) };
  }));
  const passed = checks.every((c) => c.passed === true);
  return { passed, database, checks, verdict: passed ? 'STAGING_AISLADO' : 'STAGING_NO_AISLADO_DETENER_ESCRITURAS' };
}
