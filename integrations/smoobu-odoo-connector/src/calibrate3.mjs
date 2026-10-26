import { unitForOdooRole } from './unit-map.mjs';
import { codeTraits } from './calibrate.mjs';
import { redactCode, ROLE_IDS } from './calibrate2.mjs';

/**
 * Tercera lectura de SOLO LECTURA (ATH-DEV-015, fase 1): tipo y valores de
 * x_hotel_block_kind, x_channel, x_bloqueo_ref (+ x_bloqueo_src_id) y lectura de la accion 1914
 * (motor de disponibilidad). Salida anonimizada: solo conteos y la forma del texto de las referencias.
 */
export const FIELDS = ['x_hotel_block_kind', 'x_channel', 'x_bloqueo_ref', 'x_bloqueo_src_id'];
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const bump = (m, k) => { m[k] = (m[k] ?? 0) + 1; };
const shape = (v) => (v === false || v == null ? '(vacio)' : String(v).replace(/[A-Za-z]+/g, 'a').replace(/\d+/g, '9').slice(0, 24));

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) {
    return { name, status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null };
  }
}

export function analyzeBlockFields(rows) {
  const profile = {}; const kinds = {}; const channels = {}; const refShapes = {}; const checkin = {}; const perRoleKinds = {};
  const ids = new Set(rows.map((r) => r.id));
  let refCount = 0; let refNumeric = 0; let refTargetsExist = 0; let srcEqualsRef = 0; let srcWithoutRef = 0;
  for (const r of rows) {
    const kind = r.x_hotel_block_kind || '(vacio)'; const ch = r.x_channel || '(vacio)';
    const hasRef = Boolean(r.x_bloqueo_ref); const src = idOf(r.x_bloqueo_src_id);
    bump(kinds, kind); bump(channels, ch); bump(checkin, String(r.x_checkin_state ?? '(sin campo)'));
    bump(profile, `${kind}|canal:${ch}|ref:${hasRef ? 'si' : 'no'}|src:${src ? 'si' : 'no'}`);
    const rk = `${idOf(r.role_id)}:${unitForOdooRole(idOf(r.role_id))?.unit ?? '?'}`;
    perRoleKinds[rk] ??= {}; bump(perRoleKinds[rk], kind);
    if (hasRef) {
      refCount += 1; bump(refShapes, shape(r.x_bloqueo_ref));
      if (/^\d+$/.test(String(r.x_bloqueo_ref))) { refNumeric += 1; if (ids.has(Number(r.x_bloqueo_ref))) refTargetsExist += 1; if (src && src === Number(r.x_bloqueo_ref)) srcEqualsRef += 1; }
    } else if (src) srcWithoutRef += 1;
  }
  return { sampleSize: rows.length, kinds, channels, checkinStates: checkin, profile, perRoleKinds,
    refs: { withRef: refCount, numeric: refNumeric, targetInSample: refTargetsExist, srcEqualsRef, srcWithoutRef, shapes: refShapes } };
}

export async function runCalibration3({ odoo, actionId = 1914, limit = 3000 }) {
  const steps = [];
  steps.push(await step('fields_get.block-fields', async () => {
    const f = await odoo.fieldsGet('planning.slot', ['string', 'type', 'required', 'readonly', 'selection', 'relation', 'store', 'help']);
    return { fields: Object.fromEntries(FIELDS.map((k) => [k, f[k] ? { type: f[k].type, required: Boolean(f[k].required), readonly: Boolean(f[k].readonly), store: f[k].store !== false,
      relation: f[k].relation ?? null, selection: f[k].selection ? f[k].selection.map((x) => x[0]) : null, label: f[k].string ?? null } : null])) };
  }));
  steps.push(await step('values.block-fields', async () => analyzeBlockFields(
    await odoo.searchRead('planning.slot', [['role_id', 'in', ROLE_IDS]], ['id', 'role_id', 'x_checkin_state', ...FIELDS], { limit, order: 'id desc' }))));
  steps.push(await step(`action.${actionId}`, async () => {
    const rows = await odoo.searchRead('ir.actions.server', [['id', '=', actionId]], ['id', 'name', 'state', 'model_id', 'code']);
    const a = rows[0];
    if (!a) return { found: false };
    return { found: true, id: a.id, actionName: a.name, state: a.state, model: Array.isArray(a.model_id) ? a.model_id[1] : null, traits: codeTraits(a.code), code: redactCode(a.code, 24000) };
  }));
  steps.push(await step('actions.related-search', async () => {
    const byCode = await odoo.searchRead('ir.actions.server', [['code', 'ilike', 'x_hotel_block_kind']], ['id', 'name', 'state', 'model_id'], { limit: 40 });
    const byName = await odoo.searchRead('ir.actions.server', [['name', 'ilike', 'dispon']], ['id', 'name', 'state', 'model_id'], { limit: 40 });
    const slim = (r) => ({ id: r.id, name: r.name, state: r.state, model: Array.isArray(r.model_id) ? r.model_id[1] : null });
    return { referencingBlockKind: byCode.map(slim), nameMentionsAvailability: byName.map(slim) };
  }));
  return { overall: steps.every((s) => s.status === 'OK') ? 'OK' : 'PARTIAL', steps };
}
