// ATH-DISP-001 — TEST_CASA y TEST_HOLD en STAGING, con ROLLBACK.
// - Identidad de recepción (solo availability) lee la disponibilidad con la MISMA lógica de la pantalla.
// - Identidad de prueba (quote + hold) crea la cotización y el HOLD técnico.
// - Cada pedido de prueba queda marcado x_hotel_is_test = true y con cliente "QA-".
// - Si el estado inicial no está completamente libre, se aborta SIN escribir.
// - Rollback: cancelar el pedido de prueba. Luego se compara el estado final con el inicial.
// No imprime credenciales, PIN ni datos de huéspedes reales.
import { createServer } from 'node:http';
import { createHotelGatewayServer } from '../src/server.mjs';
import { HotelGateway } from '../src/gateway.mjs';
import { IdentityStore, hashKey } from '../src/identity.mjs';
import { RateLimiter } from '../src/rate-limiter.mjs';
import { IdempotencyStore } from '../src/idempotency-store.mjs';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { AuditLog } from '../src/audit-log.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import {
  buildReceptionAvailability,
  dataUnavailableResult,
  RECEPTION_UNITS,
  STATUS,
} from '../src/reception-availability.mjs';

const STAGING_DB = 'atheron1-hotel-staging-20260923';
const STATUS_CASA_KEY = 'CASA_COMPLETA';
const env = process.env;
const log = (line) => console.log(line);

// ---------- guardas ----------
if (env.ODOO_DATABASE !== STAGING_DB) { log('ABORT: base no autorizada.'); process.exit(1); }
for (const v of ['HOTEL_RECEPTION_AGENT_ID', 'HOTEL_RECEPTION_AGENT_KEY', 'HOTEL_QA_AGENT_ID', 'HOTEL_QA_AGENT_KEY', 'GATEWAY_TECHNICAL_IDENTITIES']) {
  if (!env[v]) { log(`ABORT: falta ${v}.`); process.exit(1); }
}

// ---------- identidades y gateway en vivo ----------
const receptionEntries = JSON.parse(env.GATEWAY_TECHNICAL_IDENTITIES);
const identityStore = new IdentityStore([
  ...receptionEntries,
  { agentId: env.HOTEL_QA_AGENT_ID, actor: 'qa', keyHash: hashKey(env.HOTEL_QA_AGENT_KEY), scopes: ['availability', 'quote', 'hold', 'status'] },
]);
const adapter = new OdooHotelAdapter({
  dryRun: false,
  config: {
    baseUrl: env.ODOO_BASE_URL,
    database: env.ODOO_DATABASE,
    technicalUser: env.ODOO_TECHNICAL_USER,
    technicalSecret: env.ODOO_TECHNICAL_SECRET,
    actionId: env.ODOO_ACTION_ID ? Number(env.ODOO_ACTION_ID) : undefined,
  },
});
const gateway = new HotelGateway({
  identityStore,
  rateLimiter: new RateLimiter({ limit: 200, windowMs: 60_000 }),
  idempotencyStore: new IdempotencyStore(),
  adapter,
  auditLog: new AuditLog(),
});
const server = createHotelGatewayServer({ gateway, readinessCheck: () => true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const WHO = {
  reception: () => ({ 'x-agent-id': env.HOTEL_RECEPTION_AGENT_ID, authorization: `Bearer ${env.HOTEL_RECEPTION_AGENT_KEY}` }),
  qa: () => ({ 'x-agent-id': env.HOTEL_QA_AGENT_ID, authorization: `Bearer ${env.HOTEL_QA_AGENT_KEY}` }),
};
async function call(path, body, who) {
  const headers = { 'content-type': 'application/json', ...(who ? WHO[who]() : {}) };
  const res = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: json?.ok === true, code: json?.error?.code ?? null, json };
}

// ---------- Odoo (lectura y escritura de pruebas, usuario técnico de staging) ----------
const odoo = new HttpOdooTransport({ baseUrl: env.ODOO_BASE_URL });
const uid = await odoo.call('common', 'login', [env.ODOO_DATABASE, env.ODOO_TECHNICAL_USER, env.ODOO_TECHNICAL_SECRET]);
const ex = (model, method, args, kwargs = {}) => odoo.call('object', 'execute_kw', [env.ODOO_DATABASE, uid, env.ODOO_TECHNICAL_SECRET, model, method, args, kwargs]);

// ---------- disponibilidad: MISMA lógica que la pantalla de recepción ----------
const todayIso = new Date().toISOString().slice(0, 10);
async function receptionView(checkin, checkout, guests = 2) {
  const query = { checkin, checkout, guests };
  const res = await call('/hotel/availability', { check_in: checkin, check_out: checkout, guests }, 'reception');
  if (res.json?.ok === false || res.status !== 200) return { ...dataUnavailableResult(query), _http: res.status };
  return buildReceptionAvailability(res.json, query);
}
const statusMap = (view) => Object.fromEntries(view.units.map((u) => [u.key, u.status]));
const snapshot = async (checkin, checkout) => {
  const v = await receptionView(checkin, checkout);
  const s = statusMap(v);
  const range = { checkin, checkout };
  const orders = await ex('sale.order', 'search_count', [[['x_order_involves_room', '=', true], ['x_checkin', '<', checkout], ['x_checkout', '>', checkin], ['x_reservation_status', 'not in', ['cancelled', 'draft']]]], { context: { active_test: false } });
  const slots = await ex('planning.slot', 'search_count', [[['start_datetime', '<', checkout + ' 16:00:00'], ['end_datetime', '>', checkin + ' 20:00:00']]], { context: { active_test: false } });
  return { ...range, statuses: s, activeOrders: orders, slots };
};
const sameState = (a, b) => JSON.stringify(a.statuses) === JSON.stringify(b.statuses) && a.activeOrders === b.activeOrders && a.slots === b.slots;
const showStatuses = (s) => RECEPTION_UNITS.map((u) => `${u.label}=${s.statuses[u.key]}`).join(' | ');

// ---------- cotización + HOLD técnico con la identidad de prueba ----------
// Clave única por ejecución: una clave repetida devuelve la respuesta anterior (replay) y no crea nada nuevo.
const RUN = Date.now().toString(36);
async function quoteAndHold({ checkin, checkout, unitId, label, tag }) {
  // El contrato solo admite idempotency_key en quote y hold (sin client_ref ni client_name).
  const q = await call('/hotel/quote', { check_in: checkin, check_out: checkout, guests: 2, idempotency_key: `${tag}-${RUN}-quote` }, 'qa');
  if (!q.ok) return { error: 'QUOTE_FAILED', code: q.code, status: q.status };
  const body = q.json.data?.opciones ? q.json.data : (q.json.data?.data ?? q.json.data ?? {});
  const lista = Array.isArray(body.opciones) ? body.opciones : [];
  const opcion = lista.find((o) => String(o.unit_id) === String(unitId));
  if (!opcion || opcion.pricing_status !== 'quoted' || opcion.approval_level !== 'approved') {
    // Diagnóstico sin valores de precio ni datos de cliente: solo forma de la respuesta.
    log(`  DIAG cotización: claves=${Object.keys(q.json.data || {}).join(',')} opciones=${lista.length} unidades=${lista.map((o) => o.unit_id).join(',')} unidadBuscada=${unitId}`);
    if (opcion) log(`  DIAG opción: pricing=${opcion.pricing_status} aprobacion=${opcion.approval_level} disponibilidad=${opcion.inventory_status}`);
    return { error: 'NOT_QUOTED_APPROVED', pricing: opcion?.pricing_status ?? null, approval: opcion?.approval_level ?? null };
  }
  const qid = body.quote_id ?? null;
  const h = await call('/hotel/hold', { quote_id: qid, unit_id: unitId, idempotency_key: `${tag}-${RUN}-hold` }, 'qa');
  if (!h.ok) return { error: 'HOLD_FAILED', code: h.code, status: h.status };
  const hd = h.json.data?.hold_id ? h.json.data : (h.json.data?.data ?? h.json.data);
  pendingOrders.add(hd.hold_id);
  return { quoteId: qid, orderId: hd.hold_id, orderRef: hd.hold_ref, holdStatus: hd.status, tag, label, unitId };
}
// Pedidos de prueba creados y aún no revertidos: se cancelan siempre, incluso ante un error.
const pendingOrders = new Set();
async function markTest(orderId) {
  try {
    await ex('sale.order', 'write', [[orderId], { x_hotel_is_test: true }]);
  } catch (e) {
    log('  AVISO: no se pudo marcar x_hotel_is_test: ' + String(e?.message || e).slice(0, 160));
  }
  const [o] = await ex('sale.order', 'read', [[orderId]], { fields: ['x_hotel_is_test', 'x_reservation_status', 'partner_id'] });
  return o;
}
async function rollbackOrder(orderId) {
  try { await ex('sale.order', 'action_cancel', [[orderId]]); } catch (e) { log('  action_cancel aviso: ' + String(e?.message || e).slice(0, 160)); }
  const [o] = await ex('sale.order', 'read', [[orderId]], { fields: ['state', 'x_reservation_status'] });
  if (o.x_reservation_status !== 'cancelled') {
    await ex('sale.order', 'write', [[orderId], { x_reservation_status: 'cancelled' }]);
  }
  const [after] = await ex('sale.order', 'read', [[orderId]], { fields: ['state', 'x_reservation_status'] });
  pendingOrders.delete(orderId);
  return after;
}
async function rollbackPending() {
  for (const id of [...pendingOrders]) {
    try { const a = await rollbackOrder(id); log(`ROLLBACK DE SEGURIDAD pedido ${id}: estado=${a.state} comercial=${a.x_reservation_status}`); }
    catch (e) { log(`ERROR en rollback de seguridad pedido ${id}: ${String(e?.message || e).slice(0, 160)}`); }
  }
}

const report = {};

try {
// ================= TEST_CASA =================
log('== TEST_CASA ==');
var CASA_IN = '2026-11-05', CASA_OUT = '2026-11-06';
var casaPre = await snapshot(CASA_IN, CASA_OUT);
log('PRE ' + CASA_IN + ' :: ' + showStatuses(casaPre) + ' | pedidos activos=' + casaPre.activeOrders + ' bloques=' + casaPre.slots);
report.casaDate = `${CASA_IN} 15:00 -> ${CASA_OUT} 11:00`;
report.casaPre = casaPre.statuses;
if (Object.values(casaPre.statuses).some((s) => s !== STATUS.DISPONIBLE) || casaPre.activeOrders || casaPre.slots) {
  log('ABORT TEST_CASA: estado inicial no completamente libre. No se escribe nada.');
  report.casaAborted = true;
} else {
  const casa = await quoteAndHold({ checkin: CASA_IN, checkout: CASA_OUT, unitId: 6, label: 'TEST CASA', tag: 'QA-ATH-DISP-001-CASA' });
  if (casa.error) {
    log('ABORT TEST_CASA tras cotización: ' + JSON.stringify(casa));
    report.casaCreated = false; report.casaError = casa;
  } else {
    const marked = await markTest(casa.orderId);
    log(`CREADO pedido ${casa.orderRef} (id ${casa.orderId}) x_hotel_is_test=${marked.x_hotel_is_test} estado=${marked.x_reservation_status}`);
    const casaDuring = await receptionView(CASA_IN, CASA_OUT);
    log('DURANTE ' + showStatuses({ statuses: statusMap(casaDuring) }));
    report.casaCreated = true;
    report.casaDuring = statusMap(casaDuring);
    const after = await rollbackOrder(casa.orderId);
    log(`ROLLBACK pedido ${casa.orderRef}: estado=${after.state} comercial=${after.x_reservation_status}`);
    const casaPost = await snapshot(CASA_IN, CASA_OUT);
    log('POST ' + CASA_IN + ' :: ' + showStatuses(casaPost) + ' | pedidos activos=' + casaPost.activeOrders + ' bloques=' + casaPost.slots);
    report.casaPost = casaPost.statuses;
    report.casaPostEqualsPre = sameState(casaPre, casaPost);
    report.casaOrderId = casa.orderId; report.casaOrderRef = casa.orderRef; report.casaQuoteId = casa.quoteId;
    report.casaPartnerId = marked.partner_id ? marked.partner_id[0] : null;
  }
}

// ================= TEST_HOLD =================
log('== TEST_HOLD ==');
var HOLD_IN = '2026-12-05', HOLD_OUT = '2026-12-06';
var HOLD_UNIT = { key: '202', odooUnitId: '2', label: '202' };
var holdPre = await snapshot(HOLD_IN, HOLD_OUT);
log('PRE ' + HOLD_IN + ' :: ' + showStatuses(holdPre) + ' | pedidos activos=' + holdPre.activeOrders + ' bloques=' + holdPre.slots);
report.holdDate = `${HOLD_IN} 15:00 -> ${HOLD_OUT} 11:00`;
report.holdRoom = HOLD_UNIT.label;
report.holdPre = holdPre.statuses;
if (holdPre.statuses[HOLD_UNIT.key] !== STATUS.DISPONIBLE || holdPre.activeOrders || holdPre.slots) {
  log('ABORT TEST_HOLD: la habitación no está libre. No se escribe nada.');
  report.holdAborted = true;
} else {
  const hold = await quoteAndHold({ checkin: HOLD_IN, checkout: HOLD_OUT, unitId: HOLD_UNIT.odooUnitId, label: 'TEST HOLD 202', tag: 'QA-ATH-DISP-001-HOLD' });
  if (hold.error) {
    log('ABORT TEST_HOLD tras cotización: ' + JSON.stringify(hold));
    report.holdCreated = false; report.holdError = hold;
  } else {
    const marked = await markTest(hold.orderId);
    log(`CREADO HOLD ${hold.orderRef} (id ${hold.orderId}) x_hotel_is_test=${marked.x_hotel_is_test} estado=${marked.x_reservation_status}`);
    report.holdCreated = true;
    const holdDuring = await receptionView(HOLD_IN, HOLD_OUT);
    report.holdDuring = statusMap(holdDuring);
    log('DURANTE ' + showStatuses({ statuses: statusMap(holdDuring) }));
    // Recepción NO debe poder crear HOLD (y se rechaza antes de tocar Odoo)
    const forbidden = await call('/hotel/hold', { quote_id: hold.quoteId, unit_id: HOLD_UNIT.odooUnitId, client_ref: 'x', idempotency_key: 'rec-try-1' }, 'reception');
    report.receptionHoldForbidden = forbidden.status === 403 && forbidden.code === 'FORBIDDEN_OPERATION';
    report.receptionCanRead = holdDuring.units.length === 6 && !holdDuring._http;
    const after = await rollbackOrder(hold.orderId);
    log(`ROLLBACK HOLD ${hold.orderRef}: estado=${after.state} comercial=${after.x_reservation_status}`);
    const holdPost = await snapshot(HOLD_IN, HOLD_OUT);
    log('POST ' + HOLD_IN + ' :: ' + showStatuses(holdPost) + ' | pedidos activos=' + holdPost.activeOrders + ' bloques=' + holdPost.slots);
    report.holdPost = holdPost.statuses;
    report.holdPostEqualsPre = sameState(holdPre, holdPost);
    report.holdOrderId = hold.orderId; report.holdOrderRef = hold.orderRef; report.holdQuoteId = hold.quoteId;
    report.holdPartnerId = marked.partner_id ? marked.partner_id[0] : null;
  }
}

} catch (error) {
  log('ERROR durante las pruebas: ' + String(error?.message || error).slice(0, 200));
  report.unexpectedError = String(error?.message || error).slice(0, 200);
  await rollbackPending();
}
// Cualquier pedido que siga abierto se cancela aquí, pase lo que pase.
await rollbackPending();

// ================= FAIL-CLOSED en vivo =================
log('== FAIL-CLOSED ==');
// (a) el gateway devuelve error (rango de 75 noches supera el límite de 60): debe ser DATOS NO CONFIABLES
const errView = await receptionView('2027-06-01', '2027-08-15');
const errStatuses = statusMap(errView);
report.failGatewayError = Object.values(errStatuses);
log('gateway error -> ' + [...new Set(Object.values(errStatuses))].join(', '));
// (b) Odoo no responde: segundo gateway con URL inalcanzable, misma identidad de recepción
const deadAdapter = new OdooHotelAdapter({ dryRun: false, config: { baseUrl: 'http://127.0.0.1:9', database: env.ODOO_DATABASE, technicalUser: env.ODOO_TECHNICAL_USER, technicalSecret: env.ODOO_TECHNICAL_SECRET, actionId: 1967 } });
const deadGateway = new HotelGateway({ identityStore, rateLimiter: new RateLimiter({ limit: 50, windowMs: 60_000 }), idempotencyStore: new IdempotencyStore(), adapter: deadAdapter, auditLog: new AuditLog() });
const deadServer = createHotelGatewayServer({ gateway: deadGateway, readinessCheck: () => true });
await new Promise((r) => deadServer.listen(0, '127.0.0.1', r));
const deadRes = await fetch(`http://127.0.0.1:${deadServer.address().port}/hotel/availability`, { method: 'POST', headers: { 'content-type': 'application/json', ...WHO.reception() }, body: JSON.stringify({ check_in: '2026-11-05', check_out: '2026-11-06', guests: 2 }) });
const deadJson = await deadRes.json().catch(() => ({}));
const deadView = deadJson?.ok === true ? buildReceptionAvailability(deadJson, { checkin: '2026-11-05', checkout: '2026-11-06', guests: 2 }) : dataUnavailableResult({ checkin: '2026-11-05', checkout: '2026-11-06', guests: 2 });
report.failOdooDown = Object.values(statusMap(deadView));
log('Odoo caído -> ' + [...new Set(report.failOdooDown)].join(', ') + ' (http ' + deadRes.status + ')');
deadServer.close();

// Estado final de los dos rangos, para comprobar que nada quedó abierto
const finalCasa = await snapshot(CASA_IN, CASA_OUT);
const finalHold = await snapshot(HOLD_IN, HOLD_OUT);
report.finalCasaEqualsPre = sameState(casaPre, finalCasa);
report.finalHoldEqualsPre = sameState(holdPre, finalHold);

const ordersAfter = await ex('sale.order', 'search_count', [[['x_hotel_is_test', '=', true]]], { context: { active_test: false } });
report.testOrdersFlagged = ordersAfter;

server.close();
log('== REPORTE ==');
log(JSON.stringify(report, null, 2));
// Criterio de aprobación: el estado DURANTE la prueba debe ser el esperado (no solo que se creó algo).
const NO = STATUS.NO_DISPONIBLE;
const casaDuringOk = report.casaDuring && Object.values(report.casaDuring).every((s) => s === NO);
const holdDuringOk = report.holdDuring
  && report.holdDuring[HOLD_UNIT.key] === NO
  && report.holdDuring[STATUS_CASA_KEY] === NO
  && ['201', '203', '301', '302'].every((k) => report.holdDuring[k] === STATUS.DISPONIBLE);
const pass = Boolean(report.casaCreated && casaDuringOk && report.casaPostEqualsPre
  && report.holdCreated && holdDuringOk && report.holdPostEqualsPre
  && report.receptionHoldForbidden && report.receptionCanRead
  && report.failGatewayError.every((s) => s === STATUS.VERIFICAR)
  && report.failOdooDown.every((s) => s === STATUS.VERIFICAR));
report.casaDuringOk = Boolean(casaDuringOk);
report.holdDuringOk = Boolean(holdDuringOk);
log('ATH_DISP_001_TESTS_PASS: ' + (pass ? 'YES' : 'NO'));
process.exit(pass ? 0 : 2);
