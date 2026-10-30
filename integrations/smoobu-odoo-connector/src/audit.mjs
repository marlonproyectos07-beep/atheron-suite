import { codeTraits } from './calibrate.mjs';

/**
 * AUDITORIA DE SOLO LECTURA de las automatizaciones que se disparan sobre planning.slot (ATH-DEV-016).
 * Lee base.automation, sus ir.actions.server REALES (action_server_ids), el Booking Engine y metadatos de
 * entorno. No ejecuta ni modifica nada. No lee `url`/`webhook_uuid` (son secretos de los webhooks).
 * El codigo se publica REDACTADO (lineas con palabras de credencial omitidas, URLs reducidas al host).
 */
export const AUTOMATION_IDS = [12, 22, 23, 51, 55, 157, 158, 164, 167, 168, 169, 170, 171];
export const EXTRA_ACTION_IDS = [1495, 1493, 1815, 1823, 1825, 1839, 1840, 1841, 1843, 1844, 1854, 1875, 1654, 1649, 1648];
const CRON_NAME_RE = /nobeds|planning|hotel|disponib|ical|booking|airbnb|smoobu|reserva|webhook|sync/i;
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const nameOf = (v) => (Array.isArray(v) ? v[1] : null);

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) {
    return { name, status: 'FAIL', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null };
  }
}

const CRED_LINE = /token|secret|passw|api[_-]?key|authorization|bearer|credential|x-api/i;
export function redactAuditCode(code, max = 4500) {
  const lines = String(code ?? '').split('\n').map((l) => (CRED_LINE.test(l) ? '[linea omitida: posible credencial]' : l));
  return lines.join('\n')
    .replace(/https?:\/\/([^\s'"/)]+)[^\s'")]*/g, '[url:$1]')
    .replace(/[A-Za-z0-9_\-]{24,}/g, '[long-token]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .slice(0, max);
}

/** Analisis estatico de efectos de una accion de servidor (sobre el codigo original, no el redactado). */
export function analyzeActionCode(code) {
  const c = String(code ?? '');
  const count = (re) => (c.match(re) ?? []).length;
  const models = [...new Set([...c.matchAll(/env\[\s*['"]([a-z0-9_.]+)['"]\s*\]/g)].map((m) => m[1]))].sort();
  const hosts = [...new Set([...c.matchAll(/https?:\/\/([^\s'"/)]+)/g)].map((m) => m[1]))].sort();
  return {
    models, hosts,
    create: count(/\.create\(/g), write: count(/\.write\(/g), unlink: count(/\.unlink\(/g),
    http: /requests\.|urllib|http\.client|urlopen|\bhttpx\b/.test(c) || hosts.length > 0,
    mail: /send_mail|message_post|mail\.mail|mail\.template|mail\.thread|\.notify|activity_schedule/.test(c),
    saleOrder: /sale\.order/.test(c),
    cronOrQueue: /ir\.cron|_trigger\(|\.trigger\(|with_delay|queue_job/.test(c),
    ical: /ical|\.ics|VCALENDAR|BEGIN:VEVENT/i.test(c),
    webhook: /webhook/i.test(c),
    configParam: /ir\.config_parameter/.test(c),
    touchesSlotTimes: /(start_datetime|end_datetime)/.test(c) && /(\.write\(|\.create\(|\b(start|end)_datetime\s*=)/.test(c),
    raises: /UserError|ValidationError|raise /.test(c),
    sudo: /\.sudo\(\)/.test(c),
  };
}

export async function runAudit({ odoo, automationIds = AUTOMATION_IDS, extraActionIds = EXTRA_ACTION_IDS }) {
  const steps = [];
  let autoFields = []; let actFields = [];
  steps.push(await step('fields.presence', async () => {
    const fa = await odoo.fieldsGet('base.automation', ['type']);
    const fs = await odoo.fieldsGet('ir.actions.server', ['type']);
    autoFields = ['id', 'name', 'active', 'trigger', 'model_id', 'filter_domain', 'filter_pre_domain', 'trigger_field_ids', 'action_server_ids', 'action_server_id', 'on_change_field_ids'].filter((k) => fa[k]);
    actFields = ['id', 'name', 'state', 'model_id', 'code', 'child_ids', 'usage', 'sequence'].filter((k) => fs[k]);
    return { automationFields: autoFields, actionFields: actFields, webhookSecretFieldsExcluded: ['url', 'webhook_uuid', 'webhook_url'] };
  }));

  const actionIds = new Set(extraActionIds);
  const automations = [];
  steps.push(await step('base.automation.selected', async () => {
    const rows = await odoo.searchRead('base.automation', [['id', 'in', automationIds]], autoFields);
    for (const a of rows) {
      const linked = [].concat(a.action_server_ids ?? a.action_server_id ?? []).map(idOf).filter(Boolean);
      linked.forEach((i) => actionIds.add(i));
      automations.push({ id: a.id, name: a.name, active: a.active, trigger: a.trigger, model: nameOf(a.model_id), filterDomain: a.filter_domain ?? null,
        filterPreDomain: a.filter_pre_domain ?? null, triggerFieldCount: (a.trigger_field_ids ?? []).length, linkedActionIds: linked });
    }
    return { requested: automationIds, found: rows.map((r) => r.id), missing: automationIds.filter((i) => !rows.some((r) => r.id === i)), automations };
  }));

  const actions = new Map();
  steps.push(await step('ir.actions.server.linked-and-dependencies', async () => {
    let pending = [...actionIds];
    for (let depth = 0; depth < 3 && pending.length; depth += 1) {
      const rows = await odoo.searchRead('ir.actions.server', [['id', 'in', pending]], actFields);
      const next = [];
      for (const r of rows) {
        actions.set(r.id, r);
        for (const ch of (r.child_ids ?? [])) if (!actions.has(ch)) next.push(ch);
      }
      pending = next;
    }
    const out = [...actions.values()].sort((a, b) => a.id - b.id).map((r) => ({
      id: r.id, name: r.name, state: r.state, model: nameOf(r.model_id), usage: r.usage ?? null, children: r.child_ids ?? [],
      traits: codeTraits(r.code), analysis: analyzeActionCode(r.code), code: redactAuditCode(r.code),
    }));
    return { count: out.length, notFound: [...actionIds].filter((i) => !actions.has(i)), actions: out };
  }));

  steps.push(await step('crons.active-hotel-related', async () => {
    const crons = await odoo.searchRead('ir.cron', [['active', '=', true]], ['id', 'cron_name', 'interval_number', 'interval_type', 'ir_actions_server_id'], { limit: 300 });
    const hotel = crons.filter((c) => CRON_NAME_RE.test(String(c.cron_name ?? '')));
    const ids = hotel.map((c) => idOf(c.ir_actions_server_id)).filter(Boolean);
    const acts = ids.length ? await odoo.searchRead('ir.actions.server', [['id', 'in', ids]], ['id', 'name', 'state', 'model_id', 'code']) : [];
    return { activeTotal: crons.length, hotelRelated: hotel.map((c) => {
      const a = acts.find((x) => x.id === idOf(c.ir_actions_server_id));
      return { id: c.id, name: c.cron_name, every: `${c.interval_number} ${c.interval_type}`, actionId: idOf(c.ir_actions_server_id),
        analysis: a ? analyzeActionCode(a.code) : null, code: a ? redactAuditCode(a.code, 2500) : null };
    }) };
  }));

  steps.push(await step('planning.slot.dependencies', async () => {
    const pointing = await odoo.searchRead('ir.model.fields', [['relation', '=', 'planning.slot']], ['model', 'name', 'ttype', 'store'], { limit: 200 });
    const custom = await odoo.searchRead('ir.model.fields', [['model', '=', 'planning.slot'], ['state', '=', 'manual']], ['name', 'ttype', 'relation'], { limit: 200 });
    return { modelsPointingToSlot: pointing.map((p) => ({ model: p.model, field: p.name, type: p.ttype, stored: p.store })),
      customFieldsOnSlot: custom.map((p) => ({ name: p.name, type: p.ttype, relation: p.relation || null })) };
  }));

  steps.push(await step('environment.neutralization-and-modules', async () => {
    const params = await odoo.searchRead('ir.config_parameter', [['key', 'in', ['database.is_neutralized', 'database.expiration_date', 'database.expiration_reason']]], ['key', 'value']);
    const mail = await odoo.searchRead('ir.mail_server', [['active', '=', true]], ['id']);
    const fetchmail = await odoo.searchRead('fetchmail.server', [['state', '=', 'done']], ['id']).catch(() => null);
    const pay = await odoo.searchRead('payment.provider', [['state', '!=', 'disabled']], ['id', 'state']).catch(() => null);
    const mods = await odoo.searchRead('ir.module.module', [['state', '=', 'installed']], ['name', 'author', 'latest_version'], { limit: 600 });
    const custom = mods.filter((m) => !/odoo/i.test(String(m.author ?? '')));
    const base = mods.find((m) => m.name === 'base');
    return { baseVersion: base?.latest_version ?? null, installedModules: mods.length,
      neutralizationParams: Object.fromEntries(params.map((p) => [p.key, p.value])),
      outgoingMailServersActive: mail.length, incomingMailServersActive: fetchmail ? fetchmail.length : 'NO_LEGIBLE',
      paymentProvidersEnabled: pay ? pay.map((p) => ({ id: p.id, state: p.state })) : 'NO_LEGIBLE',
      nonOdooAuthorModules: custom.map((m) => ({ name: m.name, author: m.author })) };
  }));
  return { overall: steps.every((s) => s.status === 'OK') ? 'OK' : 'PARTIAL', steps };
}
