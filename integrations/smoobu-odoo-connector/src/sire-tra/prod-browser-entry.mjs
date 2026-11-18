import { assertProductionBrowserTarget } from './guard.mjs';
import { AUTOMATIONS, NS } from './manifest.mjs';
import { applyManifest, disableManifest, snapshotConfig, verifyDeployment } from './applier.mjs';
import { createBrowserOdoo } from './browser-entry.mjs';

/**
 * Procedimiento ESPECIFICO de produccion (atheron1.odoo.com), en la sesion de administrador del navegador.
 * No reutiliza el arranque de la copia (que sigue rechazando produccion) ni su comprobacion de aislamiento
 * (produccion no esta neutralizada a proposito: correos, crons, pagos e integraciones siguen vivos).
 * Reglas:
 *  - frase de aprobacion escrita + host exacto;
 *  - aplicar exige en la MISMA sesion: respaldo de configuracion tomado y simulacion con 0 bloqueos;
 *  - las automatizaciones nacen APAGADAS y repetir no cambia su estado;
 *  - habilitar o apagar solo afecta automatizaciones con xmlid del modulo propio, una a una;
 *  - la reversion suave (disable) no borra nada; aqui no se expone la reversion dura.
 */
export function bootProduction(win, approval) {
  const db = assertProductionBrowserTarget(win.location.hostname, approval);
  const odoo = createBrowserOdoo(win.fetch.bind(win));
  const state = { snapshot: null, plan: null };
  const ownAutomation = async (xmlid) => {
    if (!AUTOMATIONS.some((a) => a.xmlid === xmlid)) throw Object.assign(new Error('NOT_OUR_AUTOMATION'), { code: 'NOT_OUR_AUTOMATION' });
    const r = await odoo.searchRead('ir.model.data', [['module', '=', NS], ['name', '=', xmlid], ['model', '=', 'base.automation']], ['res_id']);
    if (r.length !== 1) throw Object.assign(new Error('AUTOMATION_NOT_INSTALLED'), { code: 'AUTOMATION_NOT_INSTALLED' });
    return r[0].res_id;
  };
  return {
    db,
    odoo,
    /** Respaldo de configuracion sin datos personales + estado de lo que NO se debe tocar. */
    async snapshot() {
      const base = await snapshotConfig(odoo);
      const autos = await odoo.searchRead('base.automation', [['active', '=', true]], ['id', 'name', 'model_name', 'write_date']);
      const counts = {};
      for (const m of ['sale.order', 'x_guests_line', 'survey.user_input', 'account.move', 'account.payment']) counts[m] = await odoo.count(m, []);
      state.snapshot = { ...base, db, allActiveAutomations: autos, counts };
      return state.snapshot;
    },
    async plan() {
      state.plan = await applyManifest(odoo, { apply: false, automationsActive: false });
      return state.plan;
    },
    async apply(log = () => {}) {
      if (!state.snapshot) throw Object.assign(new Error('SNAPSHOT_REQUIRED'), { code: 'SNAPSHOT_REQUIRED' });
      if (!state.plan || state.plan.blocked.length) throw Object.assign(new Error('CLEAN_PLAN_REQUIRED'), { code: 'CLEAN_PLAN_REQUIRED' });
      return applyManifest(odoo, { apply: true, log, automationsActive: false });
    },
    verify: () => verifyDeployment(odoo, { expectActive: false }),
    disable: (opts = {}) => disableManifest(odoo, opts),
    async setAutomation(xmlid, active) {
      const id = await ownAutomation(xmlid);
      await odoo.write('base.automation', [id], { active: !!active });
      const [r] = await odoo.searchRead('base.automation', [['id', '=', id], ['active', 'in', [true, false]]], ['name', 'active']);
      return r;
    },
  };
}
