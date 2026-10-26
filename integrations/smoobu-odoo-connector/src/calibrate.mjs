import { UNITS, unitForOdooRole } from './unit-map.mjs';

/**
 * Calibracion de SOLO LECTURA contra Odoo. La salida esta anonimizada:
 * ids, roles, horas, conteos y la "forma" del texto de los turnos (letras->a,
 * digitos->9), nunca el texto en si. Sin nombres de huespedes.
 */
export const ROLE_IDS = UNITS.map((u) => u.odooRoleId);
export const WANTED_FIELDS = ['name', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'state', 'allocated_hours', 'allocation_type', 'employee_id', 'company_id', 'x_nobeds_id', 'active'];
const HOUR = 3600000;
const BOGOTA = -5 * HOUR;

export const textShape = (v) => (v === false || v == null ? '(vacio)'
  : String(v).replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ]+/g, 'a').replace(/\d+/g, '9').replace(/\s+/g, ' ').slice(0, 40));
const utcMs = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const bump = (m, k) => { m[k] = (m[k] ?? 0) + 1; };
const top = (m, n = 12) => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n));

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) {
    return { name, status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null };
  }
}

export function analyzeSlots(rows) {
  const startUtc = {}; const endUtc = {}; const startBog = {}; const endBog = {}; const durations = {}; const shapes = {}; const perRole = {};
  let withResource = 0;
  for (const r of rows) {
    const s = utcMs(r.start_datetime); const e = utcMs(r.end_datetime);
    bump(startUtc, hhmm(s)); bump(endUtc, hhmm(e)); bump(startBog, hhmm(s + BOGOTA)); bump(endBog, hhmm(e + BOGOTA));
    bump(durations, `${Math.round(((e - s) / HOUR) * 10) / 10}h`);
    bump(shapes, textShape(r.name));
    const role = Array.isArray(r.role_id) ? r.role_id[0] : r.role_id;
    bump(perRole, `${role}:${unitForOdooRole(role)?.unit ?? '?'}`);
    if (Array.isArray(r.resource_id) ? r.resource_id[0] : r.resource_id) withResource += 1;
  }
  return { sampleSize: rows.length, withResource, startHourUtc: top(startUtc), endHourUtc: top(endUtc), startHourBogota: top(startBog),
    endHourBogota: top(endBog), durations: top(durations), nameShapes: top(shapes), perRole };
}

export function pilotView(rows) {
  return rows.map((r) => {
    const role = Array.isArray(r.role_id) ? r.role_id[0] : r.role_id;
    const s = utcMs(r.start_datetime); const e = utcMs(r.end_datetime);
    return { id: r.id, role, unit: unitForOdooRole(role)?.unit ?? null, startUtc: new Date(s).toISOString(), endUtc: new Date(e).toISOString(),
      durationH: Math.round(((e - s) / HOUR) * 10) / 10, nameShape: textShape(r.name), hasResource: Boolean(Array.isArray(r.resource_id) ? r.resource_id[0] : r.resource_id) };
  });
}

/** Rasgos del codigo de una accion sin exponerlo: tamano y palabras clave. */
export function codeTraits(code) {
  const c = typeof code === 'string' ? code : '';
  const has = (re) => (c.match(re) ?? []).length;
  return { chars: c.length, lines: c ? c.split('\n').length : 0, mentionsPlanningSlot: /planning\.slot/.test(c), creates: has(/\.create\(/g), writes: has(/\.write\(/g), unlinks: has(/\.unlink\(/g) };
}

export async function runCalibration({ odoo, from = '2026-07-01 00:00:00', pilotFrom = '2026-10-25 00:00:00', pilotTo = '2026-10-28 00:00:00', limit = 800 }) {
  const steps = [];
  let fields = null;
  steps.push(await step('planning.slot.fields_get', async () => {
    fields = await odoo.fieldsGet('planning.slot', ['string', 'type', 'required', 'readonly', 'relation', 'store']);
    const pick = Object.fromEntries(WANTED_FIELDS.filter((f) => fields[f]).map((f) => [f, { type: fields[f].type, required: Boolean(fields[f].required), readonly: Boolean(fields[f].readonly), relation: fields[f].relation ?? null }]));
    return { wantedPresent: Object.keys(pick), wantedAbsent: WANTED_FIELDS.filter((f) => !fields[f]), selected: pick,
      requiredFields: Object.entries(fields).filter(([, d]) => d.required).map(([k]) => k).sort() };
  }));
  const readable = fields ? ['id', ...WANTED_FIELDS.filter((f) => fields[f] && f !== 'id')] : ['id', 'name', 'role_id', 'resource_id', 'start_datetime', 'end_datetime'];
  steps.push(await step('planning.role.six', async () => ({
    roles: (await odoo.searchRead('planning.role', [['id', 'in', ROLE_IDS]], ['id', 'name'])).map((r) => ({ id: r.id, unit: unitForOdooRole(r.id)?.unit ?? null, name: r.name })) })));
  steps.push(await step('planning.slot.history', async () => analyzeSlots(
    await odoo.searchRead('planning.slot', [['role_id', 'in', ROLE_IDS], ['start_datetime', '>=', from]], readable, { limit, order: 'start_datetime desc' }))));
  steps.push(await step('planning.slot.pilot-window', async () => {
    const rows = await odoo.searchRead('planning.slot', [['role_id', 'in', ROLE_IDS], ['start_datetime', '<', pilotTo], ['end_datetime', '>', pilotFrom]], readable, { order: 'start_datetime' });
    return { window: [pilotFrom, pilotTo], slots: pilotView(rows) };
  }));
  steps.push(await step('resource.timezones', async () => {
    const rows = await odoo.searchRead('resource.resource', [], ['id', 'tz', 'resource_type'], { limit: 200 });
    const tz = {}; rows.forEach((r) => bump(tz, r.tz || '(vacio)'));
    return { resources: rows.length, tz };
  }));
  steps.push(await step('rules.167-169', async () => {
    const out = {};
    for (const model of ['base.automation', 'ir.actions.server']) {
      try {
        const rows = await odoo.searchRead(model, [['id', 'in', [167, 169]]], model === 'base.automation'
          ? ['id', 'name', 'active', 'trigger', 'model_id', 'filter_domain'] : ['id', 'name', 'state', 'model_id', 'code'], {});
        out[model] = rows.map((r) => ({ id: r.id, name: r.name, active: r.active, trigger: r.trigger, state: r.state,
          model: Array.isArray(r.model_id) ? r.model_id[1] : null, hasDomain: Boolean(r.filter_domain && r.filter_domain !== '[]'), ...(r.code !== undefined ? { code: codeTraits(r.code) } : {}) }));
      } catch (e) { out[model] = { status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null }; }
    }
    return out;
  }));
  return { overall: steps.every((s) => s.status === 'OK') ? 'OK' : 'PARTIAL', steps };
}
