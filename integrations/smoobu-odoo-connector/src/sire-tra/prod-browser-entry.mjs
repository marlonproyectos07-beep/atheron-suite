import { assertProductionBrowserTarget } from './guard.mjs';
import { AUTOMATIONS, NS } from './manifest.mjs';
import { applyManifest, disableManifest, snapshotConfig, verifyDeployment } from './applier.mjs';
import { createBrowserOdoo } from './browser-entry.mjs';
import { applyDelta, planDelta, revertDelta, verifyDelta } from './delta.mjs';
import { applyMotivo, planMotivo, revertMotivo, verifyMotivo } from './delta-motivo-2026-11-26.mjs';

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
 *  - despliegue minimo (delta.mjs): planDelta (solo lecturas + respaldo) -> applyDelta (exige respaldo de
 *    configuracion y plan limpio de la misma sesion) -> verifyDelta; revertDelta(respaldo) devuelve accion y vistas.
 */
export function bootProduction(win, approval) {
  const db = assertProductionBrowserTarget(win.location.hostname, approval);
  const odoo = createBrowserOdoo(win.fetch.bind(win));
  const state = { snapshot: null, plan: null, delta: null, motivo: null };
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
    /** Despliegue minimo: plan de solo lectura con el respaldo exacto de lo que se reemplazaria. */
    async planDelta() { state.delta = await planDelta(odoo); return state.delta; },
    /** Respaldo del plan como texto JSON (guardarlo fuera de Odoo antes de aplicar). */
    deltaBackup() { return state.delta ? JSON.stringify(state.delta.backup) : null; },
    async applyDelta(log = () => {}) {
      if (!state.snapshot) throw Object.assign(new Error('SNAPSHOT_REQUIRED'), { code: 'SNAPSHOT_REQUIRED' });
      if (!state.delta || state.delta.blocked.length || !state.delta.changes.length) throw Object.assign(new Error('CLEAN_DELTA_PLAN_REQUIRED'), { code: 'CLEAN_DELTA_PLAN_REQUIRED' });
      return applyDelta(odoo, state.delta, { log });
    },
    verifyDelta: () => verifyDelta(odoo),
    /** Formulario: opcion 'Trabajo' en "Motivo principal del viaje" (plan de solo lectura con respaldo de las opciones). */
    async planMotivo() { state.motivo = await planMotivo(odoo); return state.motivo; },
    motivoBackup() { return state.motivo ? JSON.stringify(state.motivo.backup) : null; },
    async applyMotivo() {
      if (!state.snapshot) throw Object.assign(new Error('SNAPSHOT_REQUIRED'), { code: 'SNAPSHOT_REQUIRED' });
      if (!state.motivo || state.motivo.blocked || state.motivo.status !== 'pendiente') throw Object.assign(new Error('CLEAN_MOTIVO_PLAN_REQUIRED'), { code: 'CLEAN_MOTIVO_PLAN_REQUIRED' });
      return applyMotivo(odoo, state.motivo);
    },
    verifyMotivo: () => verifyMotivo(odoo, state.motivo?.backup ?? null),
    revertMotivo: (backup) => revertMotivo(odoo, typeof backup === 'string' ? JSON.parse(backup) : backup),
    revertDelta: (backup) => revertDelta(odoo, typeof backup === 'string' ? JSON.parse(backup) : backup),
    disable: (opts = {}) => disableManifest(odoo, opts),
    async setAutomation(xmlid, active) {
      const id = await ownAutomation(xmlid);
      await odoo.write('base.automation', [id], { active: !!active });
      const [r] = await odoo.searchRead('base.automation', [['id', '=', id], ['active', 'in', [true, false]]], ['name', 'active']);
      return r;
    },
  };
}
