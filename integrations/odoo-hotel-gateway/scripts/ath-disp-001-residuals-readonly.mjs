// ATH-DISP-001 — SOLO LECTURA: residuos de TEST_CASA / TEST_HOLD y ausencia de pagos o facturas.
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

const ids = [22240, 22241];
const orders = await ex('sale.order', 'read', [ids], { fields: ['name', 'state', 'x_reservation_status', 'x_hotel_is_test', 'x_hotel_unit_id', 'x_checkin', 'x_checkout', 'partner_id', 'x_hotel_quote_id', 'invoice_ids', 'x_hold_origin'] });
for (const o of orders) {
  console.log('ORDER ' + JSON.stringify({ id: o.id, name: o.name, state: o.state, comercial: o.x_reservation_status, test: o.x_hotel_is_test, unit: o.x_hotel_unit_id && o.x_hotel_unit_id[1], checkin: o.x_checkin, checkout: o.x_checkout, partner: o.partner_id && o.partner_id[0], quote: o.x_hotel_quote_id && o.x_hotel_quote_id[0], invoices: o.invoice_ids.length, origin: o.x_hold_origin }));
}
const payments = await ex('account.payment', 'search_count', [[['x_hotel_sale_order_id', 'in', ids]]], { context: { active_test: false } });
const moves = await ex('account.move', 'search_count', [[['invoice_origin', 'in', orders.map((o) => o.name)]]], { context: { active_test: false } });
console.log('PAYMENTS_LINKED ' + payments + ' INVOICES_LINKED ' + moves);
const partnerIds = orders.map((o) => o.partner_id && o.partner_id[0]).filter(Boolean);
const partners = await ex('res.partner', 'read', [partnerIds], { fields: ['name', 'ref', 'create_date', 'active'] });
console.log('PARTNERS ' + JSON.stringify(partners.map((p) => ({ id: p.id, name: p.name, ref: p.ref, created: p.create_date, active: p.active }))));
const quoteCount = await ex('x_hotel_quote', 'search_count', [[['x_checked_at', '>=', '2026-10-06 00:00:00']]], { context: { active_test: false } });
console.log('QUOTES_TODAY ' + quoteCount);
