import { UNITS, unitForOdooRole } from './unit-map.mjs';
import { codeTraits } from './calibrate.mjs';

/**
 * Segunda calibracion de SOLO LECTURA (ATH-DEV-012): mapa rol->recurso, company_id real,
 * mecanismos de estado en planning.slot, reglas 167/169 con las acciones REALMENTE
 * enlazadas (action_server_ids) y prueba empirica de espejos para turnos de varias noches.
 * Nunca escribe. Los nombres de recursos que no sean de tipo material se reducen a su forma.
 */
export const ROLE_IDS = UNITS.map((u) => u.odooRoleId);
const HOUR = 3600000;
const ms = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const bump = (m, k) => { m[k] = (m[k] ?? 0) + 1; };
const shape = (v) => String(v ?? '').replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ]+/g, 'a').replace(/\d+/g, '9').slice(0, 30);

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) {
    return { name, status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null };
  }
}

/** Oculta literales que parecen credenciales y correos antes de mostrar codigo de una accion. */
export function redactCode(code, max = 6000) {
  return String(code ?? '')
    .replace(/[A-Za-z0-9_\-]{24,}/g, '[long-token]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .slice(0, max);
}

/** Para cada turno de habitacion de varias noches: existe un turno de Casa que lo cubra (espejo)? */
export function mirrorEvidence(rows) {
  const casa = unitForOdooRole;
  const slots = rows.map((r) => ({ id: r.id, role: idOf(r.role_id), s: ms(r.start_datetime), e: ms(r.end_datetime) }));
  const casaSlots = slots.filter((x) => casa(x.role)?.unit === 'CASA');
  const out = { rooms: {}, casaToRooms: { total: 0, withAnyRoomCovering: 0 } };
  for (const x of slots) {
    const unit = casa(x.role)?.unit;
    if (!unit || unit === 'CASA') continue;
    const nights = Math.round((x.e - x.s + 4 * HOUR) / (24 * HOUR));
    const cls = nights <= 1 ? '1_noche' : '2+_noches';
    const exact = casaSlots.some((c) => c.s === x.s && c.e === x.e);
    const covered = casaSlots.some((c) => c.s <= x.s && c.e >= x.e);
    const bucket = (out.rooms[cls] ??= { total: 0, casaExactMirror: 0, casaCovers: 0 });
    bucket.total += 1; if (exact) bucket.casaExactMirror += 1; if (covered) bucket.casaCovers += 1;
  }
  for (const c of casaSlots) {
    out.casaToRooms.total += 1;
    if (slots.some((x) => x.role !== c.role && casa(x.role)?.unit && casa(x.role).unit !== 'CASA' && x.s <= c.s && x.e >= c.e)) out.casaToRooms.withAnyRoomCovering += 1;
  }
  return out;
}

export async function runCalibration2({ odoo, from = '2026-07-01 00:00:00', limit = 800 }) {
  const steps = [];
  let slotFields = null; let rows = [];
  steps.push(await step('planning.slot.fields', async () => {
    slotFields = await odoo.fieldsGet('planning.slot', ['string', 'type', 'required', 'readonly', 'selection', 'relation']);
    const mech = Object.keys(slotFields).filter((k) => /state|active|publish|cancel|archiv|status|conflict|overlap|is_/.test(k)).sort();
    return { totalFields: Object.keys(slotFields).length, mechanismCandidates: Object.fromEntries(mech.map((k) => [k,
      { type: slotFields[k].type, required: Boolean(slotFields[k].required), readonly: Boolean(slotFields[k].readonly), ...(slotFields[k].selection ? { selection: slotFields[k].selection.map((s) => s[0]) } : {}) }])),
      hasActive: Boolean(slotFields.active), hasState: Boolean(slotFields.state) };
  }));
  const rf = ['id', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'company_id', ...(slotFields?.state ? ['state'] : [])];
  steps.push(await step('planning.slot.history-resources-company', async () => {
    rows = await odoo.searchRead('planning.slot', [['role_id', 'in', ROLE_IDS], ['start_datetime', '>=', from]], rf, { limit, order: 'start_datetime desc' });
    const roleResources = {}; const roleCompany = {}; const states = {};
    for (const r of rows) {
      const role = idOf(r.role_id); const res = idOf(r.resource_id); const co = idOf(r.company_id);
      if (role && res) { roleResources[role] ??= {}; bump(roleResources[role], String(res)); }
      if (role && co) { roleCompany[role] ??= {}; bump(roleCompany[role], String(co)); }
      if (r.state !== undefined) bump(states, String(r.state));
    }
    return { sampleSize: rows.length, roleResources, roleCompany, stateCounts: states };
  }));
  steps.push(await step('planning.role.fields-and-six', async () => {
    const f = await odoo.fieldsGet('planning.role', ['string', 'type', 'relation']);
    const want = ['id', 'name', 'resource_ids', 'company_id', 'active', 'color'].filter((k) => k === 'id' || f[k]);
    const six = await odoo.searchRead('planning.role', [['id', 'in', ROLE_IDS]], want);
    return { fieldsPresent: want, roles: six.map((r) => ({ id: r.id, unit: unitForOdooRole(r.id)?.unit ?? null,
      resourceIds: r.resource_ids ?? null, company: idOf(r.company_id) })) };
  }));
  steps.push(await step('resource.resource.used', async () => {
    const ids = [...new Set(rows.map((r) => idOf(r.resource_id)).filter(Boolean))];
    const f = await odoo.fieldsGet('resource.resource', ['string', 'type']);
    const want = ['id', 'name', 'resource_type', 'company_id', 'tz', 'active', 'user_id', 'calendar_id'].filter((k) => k === 'id' || f[k]);
    const res = ids.length ? await odoo.searchRead('resource.resource', [['id', 'in', ids]], want) : [];
    return { fieldsPresent: want, resources: res.map((r) => ({ id: r.id, type: r.resource_type ?? null,
      name: r.resource_type === 'material' ? r.name : shape(r.name), company: idOf(r.company_id), tz: r.tz ?? null, active: r.active ?? null, hasUser: Boolean(idOf(r.user_id)) })) };
  }));
  steps.push(await step('res.company.used', async () => {
    const ids = [...new Set(rows.map((r) => idOf(r.company_id)).filter(Boolean))];
    const cs = ids.length ? await odoo.searchRead('res.company', [['id', 'in', ids]], ['id', 'name']) : [];
    return { companies: cs.map((c) => ({ id: c.id, name: c.name })) };
  }));
  steps.push(await step('rules.167-169.linked-actions', async () => {
    const f = await odoo.fieldsGet('base.automation', ['string', 'type', 'relation']);
    const actionField = f.action_server_ids ? 'action_server_ids' : (f.action_server_id ? 'action_server_id' : null);
    const want = ['id', 'name', 'active', 'trigger', 'model_id', 'filter_domain', 'filter_pre_domain', 'trigger_field_ids', ...(actionField ? [actionField] : [])].filter((k) => k === 'id' || f[k]);
    const autos = await odoo.searchRead('base.automation', [['id', 'in', [167, 169]]], want);
    const out = { actionField, automations: [] };
    for (const a of autos) {
      const actionIds = actionField ? [].concat(a[actionField] || []).map(idOf) : [];
      const actions = actionIds.length ? await odoo.searchRead('ir.actions.server', [['id', 'in', actionIds]], ['id', 'name', 'state', 'model_id', 'code']) : [];
      out.automations.push({ automationId: a.id, name: a.name, active: a.active, trigger: a.trigger, model: Array.isArray(a.model_id) ? a.model_id[1] : null,
        filterDomain: a.filter_domain ?? null, filterPreDomain: a.filter_pre_domain ?? null, triggerFieldIds: a.trigger_field_ids ?? null,
        linkedActionIds: actionIds, actions: actions.map((x) => ({ id: x.id, name: x.name, state: x.state, model: Array.isArray(x.model_id) ? x.model_id[1] : null,
          traits: codeTraits(x.code), code: redactCode(x.code) })) });
    }
    return out;
  }));
  steps.push(await step('mirror-evidence', async () => mirrorEvidence(rows)));
  return { overall: steps.every((s) => s.status === 'OK') ? 'OK' : 'PARTIAL', steps };
}
