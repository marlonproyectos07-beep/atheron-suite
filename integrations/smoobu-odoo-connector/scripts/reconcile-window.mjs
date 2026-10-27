#!/usr/bin/env node
// ATH-DEV-029 fase 2-4: lectura real Smoobu (UNA solicitud) + lectura Odoo (solo search_read/fields_get) y conciliacion EN MEMORIA.
// No ejecuta create/write/unlink, acciones de servidor ni crons. Salida sin datos personales.
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { buildLiveReport } from '../src/live-reconcile.mjs';
import { ODOO_FACTS } from '../src/odoo-facts.mjs';
import { UNITS } from '../src/unit-map.mjs';

const WINDOW = { from: '2026-10-26', to: '2026-10-27' };
let sc; let oc;
try { sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env); } catch (e) { console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, smoobuRequests: 0 })); process.exit(2); }
const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
const odoo = new OdooJson2Client(oc);

let data;
try { data = await smoobu.listReservationsPage({ ...WINDOW, page: 1, pageSize: 100, includeCancelled: true }); } catch (e) {
  console.log(JSON.stringify({ result: 'SMOOBU_ERROR', httpStatus: e.status ?? null, code: e.code ?? 'UNKNOWN', smoobuRequests: 1 })); process.exit(1);
}
const have = async (model, wanted) => { const f = await odoo.fieldsGet(model, ['type']); return wanted.filter((k) => f[k]); };
const roleIds = UNITS.map((u) => u.odooRoleId);
const slotFields = await have('planning.slot', ['id', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'state', 'x_bloqueo_ref', 'x_nobeds_id', 'sale_line_id', 'x_guest_id', 'x_checkin_state', 'x_channel']);
const rawSlots = await odoo.searchRead('planning.slot', [['role_id', 'in', roleIds], ['end_datetime', '>=', '2026-10-17 00:00:00'], ['start_datetime', '<=', '2026-11-02 00:00:00']], slotFields, { limit: 2000, order: 'start_datetime' });
const roleFields = await have('planning.role', ['id', 'name', 'x_casa']);
const rawRoles = await odoo.searchRead('planning.role', [['id', 'in', roleIds]], roleFields);
const res301 = ODOO_FACTS.roleResources[37]; const resCasa = ODOO_FACTS.roleResources[69];
const offers = await odoo.searchRead('product.template', [['x_resource_ids', 'in', [res301, resCasa]]], ['id', 'x_resource_ids']);
const unitOfOffer = (o) => (o.x_resource_ids ?? []).includes(res301) ? '301' : ((o.x_resource_ids ?? []).includes(resCasa) ? 'CASA' : null);
const avRows = offers.length ? await odoo.searchRead('x_availability', [['x_date', '>=', '2026-10-25'], ['x_date', '<=', '2026-10-28'], ['x_stay_offer_id', 'in', offers.map((o) => o.id)]], ['id', 'x_date', 'x_stay_offer_id', 'x_total_units', 'x_booked', 'x_to_recompute'], { order: 'x_date' }) : [];
const availability = avRows.map((a) => ({ unit: unitOfOffer(offers.find((o) => o.id === (Array.isArray(a.x_stay_offer_id) ? a.x_stay_offer_id[0] : a.x_stay_offer_id))), date: a.x_date, total: a.x_total_units, booked: a.x_booked, pending: Boolean(a.x_to_recompute) }));

const report = buildLiveReport({ bookings: data.bookings ?? [], rawSlots, rawRoles, availability });
console.log(JSON.stringify({ at: new Date().toISOString(), result: 'CONCILIACION_EN_MEMORIA', smoobuRequests: 1, smoobuEndpoint: 'GET /api/reservations', window: WINDOW, smoobuPage: { page: data.page ?? null, pageCount: data.page_count ?? null, totalItems: data.total_items ?? null },
  odooReads: { slotsRead: rawSlots.length, rolesRead: rawRoles.length, availabilityRows: availability.length, writes: 0 }, ...report }));
