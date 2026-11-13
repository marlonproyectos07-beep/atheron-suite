import { assertBrowserTarget } from './guard.mjs';
import { NS } from './manifest.mjs';

/**
 * Transporte del navegador: usa la sesion de la propia copia de pruebas (/web/dataset/call_kw).
 * Solo arranca en hosts atheron1-pruebas-AAAAMMDD.odoo.com; nunca en produccion. Sin credenciales.
 */
export function createBrowserOdoo(fetchImpl) {
  const call = async (model, method, args = [], kwargs = {}) => {
    const r = await fetchImpl(`/web/dataset/call_kw/${model}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }) });
    const j = await r.json();
    if (j.error) { const e = new Error('ODOO_ERROR'); e.code = 'ODOO_ERROR'; e.odooMessage = String(j.error.data?.message || j.error.message || '').slice(0, 400); throw e; }
    return j.result;
  };
  let claimId = null;
  return {
    call,
    searchRead: (m, d, f, o = {}) => call(m, 'search_read', [], { domain: d, fields: f, ...o }),
    count: (m, d) => call(m, 'search_count', [d]),
    create: async (m, v) => { const r = await call(m, 'create', [[v]]); return Array.isArray(r) ? r[0] : r; },
    write: (m, ids, v) => call(m, 'write', [ids, v]),
    unlink: (m, ids) => call(m, 'unlink', [ids]),
    async claim(lineIds, system, runRef) {
      if (!claimId) claimId = (await call('ir.model.data', 'search_read', [], { domain: [['module', '=', NS], ['name', '=', 'sa_claim']], fields: ['res_id'] }))[0]?.res_id;
      const r = await call('ir.actions.server', 'run', [[claimId]], { context: { active_model: 'x_guests_line', active_ids: lineIds, active_id: lineIds[0], ath_system: system, ath_run_ref: runRef } });
      return Array.isArray(r?.claimed) ? r.claimed : [];
    },
  };
}

export function boot(win) {
  const db = assertBrowserTarget(win.location.hostname);
  return { db, odoo: createBrowserOdoo(win.fetch.bind(win)) };
}
