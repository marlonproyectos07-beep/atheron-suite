// ATH-STAGING-RECOVERY-007 — Odoo FALSO en memoria, SOLO para pruebas locales de lógica (idempotencia, rollback, guardas).
// NO es Odoo Enterprise 19: no valida compute, ACL, automatizaciones ni vistas. Todo lo que dependa de eso queda en
// REMOTE_VERIFY_REQUIRED. Sí hace falla ruidosa cuando se usa un modelo/campo que no existe (como Odoo real).
export class FakeOdoo {
  constructor({ db = 'atheron1-hotel-staging-20261009', groupsField = 'groups_id', neutralized = true, baseUrl = null, modules = ['sale_management', 'planning', 'sale_renting', 'base_automation', 'project'] } = {}) {
    this.db = db; this.models = new Map(); this.calls = []; this.hooks = { create: null, unlink: null, write: null };
    const std = {
      'ir.model': { model: 'char', name: 'char', state: 'char', transient: 'boolean' },
      'ir.model.fields': { name: 'char', model: 'char', model_id: 'many2one:ir.model', ttype: 'char', field_description: 'char', relation: 'char', relation_field: 'char', required: 'boolean', readonly: 'boolean', help: 'char', state: 'char', selection_ids: 'one2many', store: 'boolean', copied: 'boolean', index: 'char', size: 'integer', translate: 'boolean', compute: 'char', depends: 'char', domain: 'char', on_delete: 'char', currency_field: 'char', related: 'char', relation_table: 'char', column1: 'char', column2: 'char' },
      'ir.actions.server': { name: 'char', model_id: 'many2one:ir.model', state: 'char', code: 'text', binding_type: 'char', binding_model_id: 'many2one:ir.model' },
      'base.automation': { name: 'char', model_id: 'many2one:ir.model', trigger: 'char', active: 'boolean', filter_domain: 'char', filter_pre_domain: 'char', action_server_ids: 'many2many:ir.actions.server', trigger_field_ids: 'many2many:ir.model.fields', on_change_field_ids: 'many2many:ir.model.fields' },
      'ir.cron': { cron_name: 'char', ir_actions_server_id: 'many2one:ir.actions.server', interval_number: 'integer', interval_type: 'char', active: 'boolean' },
      'ir.ui.view': { name: 'char', model: 'char', inherit_id: 'many2one:ir.ui.view', mode: 'char', priority: 'integer', arch: 'text', active: 'boolean', type: 'char' },
      'ir.ui.menu': { name: 'char', parent_id: 'many2one:ir.ui.menu', sequence: 'integer', action: 'char', active: 'boolean' },
      'ir.filters': { name: 'char', model_id: 'char', domain: 'char', context: 'char', is_default: 'boolean', user_ids: 'many2many:res.users', action_id: 'many2one:ir.actions.act_window' },
      'ir.actions.act_window': { name: 'char', res_model: 'char', domain: 'char', context: 'char', view_mode: 'char' },
      'ir.model.data': { module: 'char', name: 'char', model: 'char', res_id: 'integer' },
      'ir.module.module': { name: 'char', state: 'char' },
      'ir.config_parameter': { key: 'char', value: 'char' },
      'resource.resource': { name: 'char', active: 'boolean' },
      'planning.role': { name: 'char' },
      'planning.slot': { name: 'char', resource_id: 'many2one:resource.resource', role_id: 'many2one:planning.role', start_datetime: 'datetime', end_datetime: 'datetime', state: 'char' },
      'product.template': { name: 'char', default_code: 'char' },
      'sale.order': { name: 'char', partner_id: 'many2one:res.partner', state: 'char', order_line: 'one2many:sale.order.line' },
      'res.partner': { name: 'char' },
      'res.country': { name: 'char' }, 'res.company': { name: 'char' }, 'project.project': { name: 'char' }, 'project.task.type': { name: 'char' }, 'sale.order.line': { name: 'char', order_id: 'many2one:sale.order' }, 'project.task': { name: 'char' },
      'res.users': { name: 'char', login: 'char', email: 'char', active: 'boolean', [groupsField]: 'many2many:res.groups' },
      'res.groups': { name: 'char' },
      'account.payment': { amount: 'float', state: 'char' },
      'res.city': { name: 'char' }, 'res.country.state': { name: 'char' }, 'hr.employee': { name: 'char' }, 'product.tag': { name: 'char' },
      'l10n_co_edi.type_code': { name: 'char' }, 'l10n_latam.identification.type': { name: 'char' },
    };
    for (const [m, f] of Object.entries(std)) this.#reg(m, f);
    this.#reg('ir.model', {});
    // modelos estándar visibles en ir.model
    for (const m of Object.keys(std)) this.#addRow('ir.model', { model: m, name: m, state: 'base' });
    for (const n of modules) this.#addRow('ir.module.module', { name: n, state: 'installed' });
    this.#addRow('ir.config_parameter', { key: 'database.is_neutralized', value: neutralized ? 'True' : 'False' });
    this.#addRow('ir.config_parameter', { key: 'web.base.url', value: baseUrl ?? `https://${db}.odoo.com` });
    for (const [mod, name, label] of [['base', 'group_user', 'Internal User'], ['sales_team', 'group_sale_salesman_all_leads', 'User: All Documents'], ['base', 'group_system', 'Administrator'], ['base', 'group_no_one', 'Technical Features']]) {
      const id = this.#addRow('res.groups', { name: label });
      this.#addRow('ir.model.data', { module: mod, name, model: 'res.groups', res_id: id });
    }
  }
  #reg(model, fields) {
    const m = this.models.get(model) ?? { rows: new Map(), next: 1, fields: new Map() };
    for (const [n, t] of Object.entries(fields)) { const [type, rel] = t.split(':'); m.fields.set(n, { type, relation: rel ?? null }); }
    m.fields.set('id', { type: 'integer' }); m.fields.set('display_name', { type: 'char' });
    this.models.set(model, m);
  }
  #addRow(model, vals) { const m = this.models.get(model); const id = m.next++; m.rows.set(id, { id, ...vals }); return id; }
  seed(model, vals) { return this.#addRow(model, vals); }
  /** ATH-020: crea una fila de ir.model.fields (state «base») por cada campo estándar del fake, como tiene Odoo real; así R4 puede resolver campos disparadores por nombre. */
  syncStdFieldRows() {
    for (const [model, m] of this.models) {
      if (model === 'ir.model' || model === 'ir.model.fields') continue;
      const mid = this.rows('ir.model').find((r) => r.model === model)?.id;
      for (const [name, d] of m.fields) if (name !== 'id' && name !== 'display_name' && !this.rows('ir.model.fields').some((r) => r.model === model && r.name === name)) this.#addRow('ir.model.fields', { name, model, model_id: mid, ttype: d.type, relation: d.relation ?? false, state: 'base' });
    }
  }
  /** ATH-020: declara un campo PREEXISTENTE del destino (estándar o de módulo): queda en fields_get y como fila de ir.model.fields. */
  defineField(model, name, type = 'char', relation = null) {
    const m = this.models.get(model); if (!m) throw new Error(`fake: modelo ${model} no existe`);
    m.fields.set(name, { type, relation });
    const mid = this.rows('ir.model').find((r) => r.model === model)?.id;
    return this.#addRow('ir.model.fields', { name, model, model_id: mid, ttype: type, relation: relation ?? false, state: 'base' });
  }
  rows(model) { return [...(this.models.get(model)?.rows.values() ?? [])]; }
  get writeCalls() { return this.calls.filter((c) => ['create', 'write', 'unlink'].includes(c.method)); }

  transport() {
    return {
      call: async (service, method, args) => {
        if (service === 'common' && method === 'login') { if (args[0] !== this.db) throw new Error('db inexistente'); return 7; }
        if (service === 'common' && method === 'version') return { server_version: 'FAKE-LOCAL-NOT-ODOO' };
        if (service === 'object' && method === 'execute_kw') { const [, , , model, m, a, kw] = args; return this.#exec(model, m, a, kw ?? {}); }
        throw new Error(`fake: ${service}.${method}`);
      },
    };
  }

  #model(model) { const m = this.models.get(model); if (!m) throw this.#err(`Object ${model} doesn't exist`); return m; }
  #err(msg) { const e = new Error(msg); e.diagnostic = { message: msg }; return e; }
  #fieldOk(model, m, key) { if (!m.fields.has(key)) throw this.#err(`Invalid field '${key}' on model '${model}'`); }

  #val(model, row, path, ctx) { // soporta 'a.b' siguiendo many2one
    const [head, ...rest] = path.split('.');
    let v = row[head];
    if (!rest.length) return v;
    const def = this.#model(model).fields.get(head);
    if (!def?.relation || v == null || v === false) return null;
    const target = this.models.get(def.relation)?.rows.get(Array.isArray(v) ? v[0] : v);
    return target ? this.#val(def.relation, target, rest.join('.'), ctx) : null;
  }
  #match(model, row, dom, ctx) {
    const stack = [...dom]; // notación polaca
    const ev = () => {
      const t = stack.shift();
      if (t === '&') return ev() && ev();
      if (t === '|') { const a = ev(); const b = ev(); return a || b; }
      if (t === '!') return !ev();
      const [f, op, want] = t;
      if (f !== 'id') this.#fieldOk(model, this.#model(model), f.split('.')[0]);
      let v = this.#val(model, row, f, ctx); if (v === undefined) v = false;
      const norm = (x) => (Array.isArray(x) ? x[0] : x);
      switch (op) {
        case '=': return norm(v) === want || (want === false && (v === false || v == null || v === ''));
        case '!=': return !(norm(v) === want || (want === false && (v === false || v == null || v === '')));
        case 'in': return want.includes(norm(v));
        case 'not in': return !want.includes(norm(v));
        case 'like': return String(v ?? '').includes(String(want).replace(/%/g, ''));
        case 'ilike': return String(v ?? '').toLowerCase().includes(String(want).replace(/%/g, '').toLowerCase());
        case '>': return v > want; case '<': return v < want; case '>=': return v >= want; case '<=': return v <= want;
        default: throw this.#err(`operador no soportado por el fake: ${op}`);
      }
    };
    if (!stack.length) return true;
    let ok = true; while (stack.length) { const r = ev(); ok = ok && r; } return ok;
  }
  #search(model, dom, kw) {
    const m = this.#model(model); const ctx = kw.context ?? {};
    let rows = [...m.rows.values()].filter((r) => (ctx.active_test === false || r.active !== false) && this.#match(model, r, dom, ctx));
    if (kw.limit) rows = rows.slice(0, kw.limit);
    return rows;
  }
  #out(model, row, fields) {
    const m = this.#model(model); const out = { id: row.id };
    for (const f of fields ?? [...m.fields.keys()]) {
      this.#fieldOk(model, m, f);
      const def = m.fields.get(f); let v = f === 'display_name' ? (row.name ?? row.x_name ?? row.model ?? String(row.id)) : row[f];
      if (v === undefined) v = def.type === 'boolean' ? false : (def.type === 'many2many' || def.type === 'one2many') ? [] : false;
      if (def.type === 'many2one' && v) { const t = this.models.get(def.relation)?.rows.get(v); v = [v, t?.name ?? t?.x_name ?? t?.model ?? String(v)]; }
      out[f] = v;
    }
    return out;
  }
  #prep(model, vals, creating) {
    const m = this.#model(model); const o = {};
    for (const [k, v] of Object.entries(vals)) {
      this.#fieldOk(model, m, k);
      const def = m.fields.get(k);
      if ((def.type === 'many2many' || def.type === 'one2many') && !(Array.isArray(v) && v.every((c) => Array.isArray(c) && typeof c[0] === 'number'))) throw this.#err(`x2many '${k}' exige comandos ORM, no una lista cruda`);
      if (def.type === 'many2many' && Array.isArray(v) && v[0]?.[0] === 6) o[k] = [...v[0][2]];
      else if (def.type === 'many2many' && Array.isArray(v) && v.length === 0) o[k] = [];
      else if (def.type === 'one2many') { /* se ignora en el fake */ } else o[k] = v;
    }
    return o;
  }
  #exec(model, method, a, kw) {
    this.calls.push({ model, method });
    switch (method) {
      case 'search': return this.#search(model, a[0], kw).map((r) => r.id);
      case 'search_count': return this.#search(model, a[0], kw).length;
      case 'search_read': return this.#search(model, a[0], kw).map((r) => this.#out(model, r, kw.fields));
      case 'read': return a[0].map((id) => { const r = this.#model(model).rows.get(id); if (!r) throw this.#err(`Record does not exist or has been deleted: ${model}(${id})`); return this.#out(model, r, a[1]); });
      case 'fields_get': return Object.fromEntries([...this.#model(model).fields].map(([n, d]) => [n, { type: d.type, ...(d.relation ? { relation: d.relation } : {}) }]));
      case 'create': return this.#create(model, a[0]);
      case 'write': {
        if (this.hooks.write) this.hooks.write(model, a[0], a[1]);
        const m = this.#model(model); const vals = this.#prep(model, a[1]);
        for (const id of a[0]) { const r = m.rows.get(id); if (!r) throw this.#err('Record does not exist'); Object.assign(r, vals); }
        return true;
      }
      case 'unlink': {
        const m = this.#model(model);
        for (const id of a[0]) {
          if (this.hooks.unlink) this.hooks.unlink(model, id);
          const r = m.rows.get(id); if (!r) continue;
          if (model === 'ir.model' && [...this.#model(r.model)?.rows ?? []].length) throw this.#err(`no se puede borrar el modelo ${r.model}: tiene registros`);
          if (model === 'ir.model.fields') this.models.get(r.model)?.fields.delete(r.name);
          if (model === 'ir.model') this.models.delete(r.model);
          m.rows.delete(id);
        }
        return true;
      }
      default: throw this.#err(`método no soportado por el fake: ${method}`);
    }
  }
  #create(model, vals) {
    if (this.hooks.create) this.hooks.create(model, vals);
    const m = this.#model(model);
    const row = this.#prep(model, vals, true);
    if (model === 'ir.model') {
      if (!/^x_/.test(vals.model)) throw this.#err('Los modelos manuales deben empezar por x_');
      this.#reg(vals.model, { x_name: 'char', active: 'boolean' }); row.state = 'manual';
    }
    if (model === 'ir.model.fields') {
      const owner = this.models.get('ir.model').rows.get(vals.model_id); if (!owner) throw this.#err('model_id inválido');
      if (!/^x_/.test(vals.name)) throw this.#err('Los campos manuales deben empezar por x_');
      if (['many2one', 'one2many', 'many2many'].includes(vals.ttype) && !this.models.has(vals.relation)) throw this.#err(`Unknown model ${vals.relation}`);
      if (vals.ttype === 'one2many' && !this.models.get(vals.relation)?.fields.has(vals.relation_field)) throw this.#err(`Unknown relation_field ${vals.relation_field}`);
      if (vals.ttype === 'selection' && !vals.related && !vals.selection_ids?.length) throw this.#err('selection sin opciones');
      row.model = owner.model; this.models.get(owner.model).fields.set(vals.name, { type: vals.ttype, relation: vals.relation ?? null });
    }
    if (model === 'ir.cron' && !vals.ir_actions_server_id) throw this.#err('cron sin acción');
    if (m.fields.has('active') && !('active' in row)) row.active = true; // como Odoo: active=True por defecto
    const id = m.next++; m.rows.set(id, { id, ...row });
    return id;
  }
}
