// ATH-DEV-116 — Odoo JSON-2 SIMULADO en memoria para pruebas del ejecutor. Nada de esto toca la red.
// Reproduce lo relevante de las automatizaciones reales: 151 (turno al confirmar), 161 (precio manual protege de la tarifa 17),
// 141 (CHOQUE DE RESERVA) y 166 (al cancelar se borran los turnos enlazados). Permite inyectar fallos antes/despues de aplicar.
export const ROLE_BY_PRODUCT = { 57846: 29, 57848: 19, 57849: 30, 57845: 37, 57847: 18 };
const M2O = new Set(['partner_id', 'order_id', 'product_id', 'role_id', 'sale_line_id']);
const res = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });

export class FakeOdoo {
  constructor(seed = {}) {
    this.t = { 'res.partner': [], 'sale.order': [], 'sale.order.line': [], 'planning.slot': [], 'account.payment': [], 'account.move': [], notes: [] };
    for (const [k, rows] of Object.entries(seed)) this.t[k] = rows.map((r) => ({ ...r }));
    this.next = 900000; this.clock = 0; this.faults = []; this.calls = []; this.priceOverwriteOnCreate = false;
  }
  stamp() { this.clock += 1; return `2026-10-30 22:00:${String(this.clock).padStart(2, '0')}`; }
  fault(f) { this.faults.push(f); return this; }
  get fetch() { return (url, init) => this.handle(url, init); }

  match(row, [f, op, v]) {
    const val = row[f];
    switch (op) {
      case '=': return val === v || (v === false && (val == null || val === false || val === ''));
      case '!=': return val !== v;
      case 'in': return (Array.isArray(val) ? val.some((x) => v.includes(x)) : v.includes(val));
      case 'not in': return !v.includes(val);
      case 'ilike': return String(val ?? '').toLowerCase().includes(String(v).toLowerCase());
      case '=ilike': return String(val ?? '').toLowerCase() === String(v).toLowerCase();
      case '<': return val < v; case '>': return val > v; case '<=': return val <= v; case '>=': return val >= v;
      default: throw new Error(`operador no simulado ${op}`);
    }
  }
  view(model, row, fields) {
    const derived = { ...row };
    if (model === 'sale.order') {
      derived.order_line = this.t['sale.order.line'].filter((l) => l.order_id === row.id).map((l) => l.id);
      derived.invoice_ids = row.invoice_ids ?? [];
    }
    const out = {};
    for (const f of fields ?? Object.keys(derived)) out[f] = M2O.has(f) && derived[f] != null && derived[f] !== false ? [derived[f], 'x'] : (derived[f] ?? false);
    return out;
  }
  overlap(roleId, start, end, exceptLines = []) {
    return this.t['planning.slot'].some((s) => s.role_id === roleId && s.start_datetime < end && s.end_datetime > start && !exceptLines.includes(s.sale_line_id));
  }

  async handle(url, init) {
    const [, , , model, method] = new URL(url).pathname.split('/');
    const p = JSON.parse(init.body);
    this.calls.push(`${model}/${method}`);
    const f = this.faults.find((x) => x.model === model && x.method === method && !x.used);
    if (f && f.when === 'before') { f.used = true; if (f.kind === 'network') { const e = new TypeError('fetch failed'); throw e; } return res({ message: f.message ?? 'rechazo' }, f.status ?? 400); }
    let out;
    try { out = this.apply(model, method, p); } catch (e) { return res({ message: e.message }, 400); }
    if (f && f.when === 'after') { f.used = true; const e = new TypeError('fetch failed'); throw e; } // aplicado en Odoo, respuesta perdida
    return res(out);
  }

  apply(model, method, p) {
    const T = this.t[model];
    if (method === 'fields_get') return Object.fromEntries(['id', 'name', 'state', 'write_date', 'email', 'phone', 'partner_id', 'x_pms_reference', 'client_order_ref', 'x_booking_source', 'x_checkin', 'x_checkout',
      'rental_start_date', 'rental_return_date', 'invoice_ids', 'order_line', 'order_id', 'product_id', 'price_unit', 'x_precio_manual', 'qty_invoiced', 'tax_ids', 'role_id', 'start_datetime', 'end_datetime', 'sale_line_id', 'move_type'].map((k) => [k, { type: 'char' }]));
    if (method === 'search_read') return T.filter((r) => (p.domain ?? []).every((c) => this.match(r, c))).slice(0, p.limit ?? 1e9).map((r) => this.view(model, r, p.fields));
    if (method === 'search_count') return T.filter((r) => (p.domain ?? []).every((c) => this.match(r, c))).length;
    if (method === 'create') {
      const v = { ...p.vals_list[0] }; const id = (this.next += 1);
      if (model === 'sale.order') {
        const lines = v.order_line ?? []; delete v.order_line;
        T.push({ id, state: 'draft', write_date: this.stamp(), ...v });
        for (const [, , l] of lines) this.t['sale.order.line'].push({ id: (this.next += 1), order_id: id, product_id: l.product_id, product_uom_qty: l.product_uom_qty,
          price_unit: this.priceOverwriteOnCreate ? 50000 : l.price_unit, x_precio_manual: l.x_precio_manual, qty_invoiced: 0, tax_ids: (l.tax_ids?.[0]?.[2] ?? []) });
      } else T.push({ id, ...v });
      return [id];
    }
    if (method === 'write') {
      for (const id of p.ids) { const r = T.find((x) => x.id === id); Object.assign(r, p.vals); if (model === 'sale.order') r.write_date = this.stamp(); else { const o = this.t['sale.order'].find((x) => x.id === r.order_id); if (o) o.write_date = this.stamp(); } }
      return true;
    }
    if (method === 'message_post') { this.t.notes.push({ id: p.ids[0], body: p.body }); return [1]; }
    if (method === 'action_confirm') {
      const o = T.find((x) => x.id === p.ids[0]);
      const lines = this.t['sale.order.line'].filter((l) => l.order_id === o.id);
      const start = o.rental_start_date; const end = o.rental_return_date;
      for (const l of lines) if (this.overlap(ROLE_BY_PRODUCT[l.product_id], start, end, lines.map((x) => x.id))) throw new Error('CHOQUE DE RESERVA');
      for (const l of lines) { if (!(l.x_precio_manual > 0)) l.price_unit = 50000; this.t['planning.slot'].push({ id: (this.next += 1), role_id: ROLE_BY_PRODUCT[l.product_id], start_datetime: start, end_datetime: end, sale_line_id: l.id }); }
      o.state = 'sale'; o.write_date = this.stamp(); return true;
    }
    if (method === 'action_cancel') {
      const o = T.find((x) => x.id === p.ids[0]);
      const lineIds = this.t['sale.order.line'].filter((l) => l.order_id === o.id).map((l) => l.id);
      this.t['planning.slot'] = this.t['planning.slot'].filter((s) => !lineIds.includes(s.sale_line_id));
      o.state = 'cancel'; o.write_date = this.stamp(); return true;
    }
    throw new Error(`metodo no simulado ${model}/${method}`);
  }
}

/** Escritor de pruebas: misma lista blanca que el real, pero contra el Odoo simulado (el real esta desarmado por diseno). */
export function fakeWriter(odoo, validateWrite, { maxWrites = 20 } = {}) {
  return {
    writes: 0, simulated: false,
    async execute(model, method, params) {
      validateWrite(model, method, params);
      if (this.writes >= maxWrites) { const e = new Error('SYNC_WRITE_BUDGET_EXHAUSTED'); e.code = 'SYNC_WRITE_BUDGET_EXHAUSTED'; throw e; }
      this.writes += 1;
      let r;
      try { r = await odoo.handle(`https://odoo.invalid/json/2/${model}/${method}`, { body: JSON.stringify(params) }); } catch (e) { const err = new Error('ODOO_NETWORK_ERROR'); err.code = 'ODOO_NETWORK_ERROR'; err.retryable = true; throw err; }
      if (!r.ok) { const err = new Error('ODOO_HTTP_ERROR'); err.code = 'ODOO_HTTP_ERROR'; err.status = r.status; throw err; }
      return r.json();
    },
  };
}
