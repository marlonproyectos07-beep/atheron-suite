// Odoo simulado en memoria para probar el piloto P0 SIN red. Habla el protocolo JSON-2 (fetch) para ejercitar los clientes reales.
export const GOOD_AUTOMATIONS = [
  [12, 'Fix Slot Times', 'on_create_or_write', false, [1481]], [22, 'BE change', 'on_create_or_write', false, [1500]], [23, 'BE delete', 'on_unlink', false, [1496]],
  [51, 'NOBEDS webhook', 'on_webhook', false, [1648]], [55, 'iCal 55', 'on_create_or_write', "[('state','=','published')]", []], [157, 'iCal 157', 'on_create_or_write', false, []],
  [158, 'iCal borrar', 'on_unlink', false, [1654]], [164, 'Anti-dup', 'on_create', "[('x_nobeds_id', '!=', False)]", [1841]],
  [167, 'Casa bloquea', 'on_create_or_write', "[('x_bloqueo_ref','=',False),('state','=','published')]", [1853]], [168, 'Limpiar', 'on_unlink', false, [1854]],
  [169, 'Hab bloquea', 'on_create_or_write', "[('x_bloqueo_ref','=',False),('state','=','published')]", [1855]],
  [170, 'Orden OTA', 'on_create', "[('x_nobeds_id','!=',False),('x_bloqueo_ref','=',False)]", [1857]], [171, 'Cancelar OTA', 'on_create_or_write', "[('state','=','draft'),('x_nobeds_id','!=',False),('sale_line_id','!=',False)]", [1858]],
];
const CODE = {
  1481: "for record in records:\n    if not record.start_datetime: continue", 1500: "records.x_availability_ids.write({'x_to_recompute': True})", 1495: "new.write({'x_to_recompute': True})",
  1493: "avail.write({'x_booked': 1})", 1496: "records.x_availability_ids.write({'x_to_recompute': True})\nenv.ref('booking_engine.x')._trigger()",
  1654: "lines = ['BEGIN:VCALENDAR']\nattach.write({'datas': b})", 1854: "for slot in records:\n    blocks = env['planning.slot'].search([('x_bloqueo_ref','=',str(slot.id))])\n    if blocks:\n        blocks.unlink()",
  1648: "payload.get('order_id')", 1841: "slot.unlink()", 1853: "x", 1855: "x", 1857: "env['sale.order'].create({})", 1858: "order.message_post(body='x')",
};

export function makeFake(opts = {}) {
  const st = {
    uid: 7, nextId: 5000, slots: [], saleOrders: 100, partners: 50, mailMail: 10, mailMessages: [], slotTotalBase: 166,
    availability: [{ id: 1, date: '2026-10-15', offer: 12136, total: 1, booked: 0, pending: false }, { id: 2, date: '2026-10-16', offer: 12136, total: 1, booked: 0, pending: false }, { id: 3, date: '2026-10-15', offer: 58223, total: 1, booked: 0, pending: false }],
    calls: [], automations: opts.automations ?? GOOD_AUTOMATIONS, codes: { ...CODE, ...(opts.codes ?? {}) },
  };
  const wasCreated = () => st.slots.filter((s) => s.created);
  const applyCreate = (v) => {
    const id = st.nextId++; st.slots.push({ id, ...v, created: true });
    if (!opts.noAvailabilityEffect) for (const a of st.availability) if (a.offer === 12136 && a.date === '2026-10-15') a.booked += 1;
    if (opts.createsMirror) st.slots.push({ id: st.nextId++, role_id: 69, start_datetime: v.start_datetime, end_datetime: v.end_datetime, state: 'published', x_bloqueo_ref: String(id), name: false, created: true });
    if (opts.createsSaleOrder) st.saleOrders += 1;
    st.mailMessages.push({ id: st.mailMessages.length + 1, res_id: id });
    return id;
  };
  const applyUnlink = (id) => {
    st.slots = st.slots.filter((s) => s.id !== id && s.x_bloqueo_ref !== String(id));
    st.mailMessages = st.mailMessages.filter((m) => m.res_id !== id);
    if (!opts.deleteLeavesAvailability) for (const a of st.availability) if (a.offer === 12136 && a.date === '2026-10-15') a.booked = Math.max(0, a.booked - 1);
  };
  const slotRow = (s) => ({ id: s.id, role_id: [s.role_id, 'r'], resource_id: s.resource_id ? [s.resource_id, 'x'] : false, company_id: s.company_id ? [s.company_id, 'c'] : false, state: s.state,
    start_datetime: s.start_datetime, end_datetime: s.end_datetime, name: s.name ?? false, x_guest_id: false, x_nobeds_id: false, x_bloqueo_ref: s.x_bloqueo_ref ?? false, sale_line_id: false, x_channel: false });
  const inWin = (s, d) => { const lt = d.find((t) => t[0] === 'start_datetime' && t[1] === '<'); const gt = d.find((t) => t[0] === 'end_datetime' && t[1] === '>'); return s.start_datetime < lt[2] && s.end_datetime > gt[2]; };
  const handle = (model, method, p) => {
    st.calls.push(`${model}/${method}`);
    const d = p.domain ?? [];
    const has = (f) => d.some((t) => Array.isArray(t) && t[0] === f);
    if (method === 'context_get') return { uid: st.uid };
    if (method === 'fields_get') {
      if (model === 'planning.slot') {
        const f = (type, extra = {}) => ({ type, required: false, readonly: false, ...extra });
        return { access_token: f('char', { required: true }), company_id: f('many2one', { required: true, relation: 'res.company' }), repeat_unit: f('selection', { required: true }), role_id: f('many2one', { relation: 'planning.role' }),
          resource_id: f('many2one', { relation: 'resource.resource' }), start_datetime: f('datetime'), end_datetime: f('datetime'), state: f('selection', { selection: [['draft', 'D'], ['published', 'P']] }), name: f('text'),
          x_bloqueo_ref: f('char'), x_nobeds_id: f('char'), x_guest_id: f('many2one', { relation: 'res.partner' }), sale_line_id: f('many2one', { relation: 'sale.order.line' }), ...(opts.schemaExtraRequired ? { x_new: f('char', { required: true }) } : {}) };
      }
      return {};
    }
    if (method === 'search_count') {
      if (model === 'planning.slot') {
        if (has('name')) return st.slots.filter((s) => s.name === d.find((t) => t[0] === 'name')[2]).length;
        if (has('x_bloqueo_ref')) return st.slots.filter((s) => s.x_bloqueo_ref === d.find((t) => t[0] === 'x_bloqueo_ref')[2]).length;
        if (has('role_id') && d.find((t) => t[0] === 'role_id')[1] === '=') return st.slots.filter((s) => s.role_id === 37).length + (opts.role37Base ?? 22);
        return st.slotTotalBase + st.slots.length;
      }
      if (model === 'sale.order') return st.saleOrders; if (model === 'res.partner') return st.partners + (opts.createsPartner && wasCreated().length ? 1 : 0);
      if (model === 'mail.mail') return st.mailMail + (opts.createsMail && wasCreated().length ? 1 : 0);
      if (model === 'mail.message') return has('res_id') ? st.mailMessages.filter((m) => m.res_id === d.find((t) => t[0] === 'res_id')[2]).length : st.mailMessages.length + 400;
      if (model === 'x_availability') return st.availability.filter((a) => a.pending).length;
      if (model === 'sale.order.line') return opts.activeOrderLines ?? 0;
      if (model === 'resource.calendar.leaves') return opts.leaves ?? 0;
      return 0;
    }
    if (method === 'search_read') {
      switch (model) {
        case 'res.users': return [{ id: st.uid, active: true, share: false, login: 'tecnico-api' }];
        case 'ir.config_parameter': return [{ key: 'web.base.url', value: 'https://atheron1.odoo.com' }];
        case 'res.company': return [{ id: 5, name: 'ATHERON' }];
        case 'planning.role': return [{ id: 37, name: '301 Habitacion Suite', x_casa: 'c', x_is_a_room_offer: true, resource_ids: [31], active: true }];
        case 'resource.resource': return [{ id: 31, resource_type: 'material', company_id: [5, 'c'], active: true }];
        case 'planning.slot': {
          if (has('id')) { const id = d.find((t) => t[0] === 'id')[2]; return st.slots.filter((s) => s.id === id).map(slotRow); }
          if (has('name')) return st.slots.filter((s) => s.name === d.find((t) => t[0] === 'name')[2]).map(slotRow);
          const base = (opts.windowSlots ?? []).map((s) => slotRow(s)); const mine = st.slots.filter((s) => inWin(s, d)).map(slotRow);
          return [...base, ...mine];
        }
        case 'product.template': return [{ id: 12136, x_resource_ids: [31] }, { id: 58223, x_resource_ids: [79] }];
        case 'x_availability': return st.availability.map((a) => ({ id: a.id, x_date: a.date, x_stay_offer_id: [a.offer, 'o'], x_total_units: a.total, x_booked: a.booked, x_to_recompute: a.pending }));
        case 'ir.attachment': return [{ id: 1, res_id: 37, file_size: 110, write_date: '2026-10-26 21:50:00' }, { id: 2, res_id: 69, file_size: 101008 + (opts.feedGrows && wasCreated().length ? 400 : 0), write_date: '2026-10-26 21:50:00' }];
        case 'base.automation': return d.some((t) => t[0] === 'model_id.model' && t[2] === 'x_availability') ? (opts.xAvailabilityAutomations ?? []) : st.automations.map(([id, name, trigger, filter_domain, ids]) => ({ id, name, trigger, filter_domain, action_server_ids: ids }));
        case 'ir.actions.server': { const ids = d.find((t) => t[0] === 'id')[2]; return ids.filter((i) => st.codes[i] !== undefined).map((i) => ({ id: i, name: `a${i}`, state: 'code', code: st.codes[i] })); }
        default: return [];
      }
    }
    if (method === 'create') { if (opts.createFails) { const e = new Error('boom'); e.status = 500; throw e; } const id = applyCreate(p.vals_list[0]); if (opts.createReturnsGarbage) return { weird: true }; return [id]; }
    if (method === 'unlink') { applyUnlink(p.ids[0]); return true; }
    throw new Error(`fake: ${model}/${method}`);
  };
  const fetchImpl = async (url, init) => {
    const [, model, method] = new URL(url).pathname.match(/\/json\/2\/([^/]+)\/([^/]+)$/);
    try {
      const out = handle(model, method, JSON.parse(init.body));
      if (opts.networkFailAfterCreate && method === 'create') { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }
      return { ok: true, status: 200, json: async () => out };
    } catch (e) { if (e instanceof TypeError) throw e; return { ok: false, status: e.status ?? 500, json: async () => ({}), text: async () => '' }; }
  };
  return { st, fetchImpl, wasCreated };
}
