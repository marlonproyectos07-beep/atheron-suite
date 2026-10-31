#!/usr/bin/env node
// ATH-DEV-137: SIMULACION (solo lectura) de la correccion de COT/2026/03848 al total de Booking. Cero escrituras: no existe
// cliente de escritura en este script. Salida PUBLICA sin IDs completos, nombres ni importes: solo estructura y comprobaciones.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { parseReferences } from '../src/reference-parse.mjs';
import { planTotalCorrection, validateCorrection, CORRECTION_TARGET } from '../src/booking-correction.mjs';
import { assessBookingAmounts } from '../src/booking-amounts.mjs';
import { assertPublicSafe, maskSmoobu } from '../src/public-report.mjs';
import { readSmoobuWindow } from '../src/reconcile-ids-run.mjs';
import { resolveWindow } from '../src/window.mjs';
import { dailyWindowEnv } from '../src/daily-run.mjs';

const out = (o, code = 0) => { console.log(JSON.stringify(o)); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Simulacion correccion ${CORRECTION_TARGET.orderName}\n\n\`\`\`\n${JSON.stringify(o, null, 2)}\n\`\`\`\n`); process.exit(code); };
const label = (e) => (/^\s*(iva|vat|impuesto|impuestos|tax|taxes)\b/i.test(String(e?.name ?? '')) ? 'IMPUESTO' : (e?.type === 'basePrice' ? 'TARIFA' : (e?.type === 'commission' ? 'COMISION' : 'OTRO')));
let sc; let oc;
try { sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env); } catch (e) { out({ result: 'FALLO', code: e.code ?? 'CONFIG_ERROR', writes: 0 }, 2); }
try {
  const odoo = new OdooJson2Client(oc);
  const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
  const [order] = await odoo.searchRead('sale.order', [['id', '=', CORRECTION_TARGET.orderId], ['name', '=', CORRECTION_TARGET.orderName]], ['id', 'name', 'state', 'x_booking_source', 'x_pms_reference', 'invoice_ids', 'amount_total', 'amount_tax'], { limit: 1 });
  if (!order) out({ result: 'PEDIDO_NO_ENCONTRADO', writes: 0 }, 1);
  const lines = await odoo.searchRead('sale.order.line', [['order_id', '=', order.id]], ['id', 'product_id', 'price_unit', 'x_precio_manual', 'tax_ids', 'qty_invoiced'], { limit: 5 });
  const [sid] = parseReferences(order.x_pms_reference).smoobu;
  const booking = await smoobu.getReservation(Number(sid));
  const elements = await smoobu.getPriceElements(Number(sid));
  const a = assessBookingAmounts({ booking, elements });
  const plan = planTotalCorrection({ order, lines, booking, elements });
  const slots = await odoo.searchCount('planning.slot', [['sale_line_id', 'in', lines.map((l) => l.id)]]);
  // ATH-DEV-138: diagnostico de las reservas VIGENTES de Booking de la ventana diaria (solo estructura y codigos)
  const win = resolveWindow(dailyWindowEnv(new Date(), 90));
  const listed = await readSmoobuWindow(smoobu, win);
  const recent = []; const hidden = [];
  for (const b of listed.bookings.filter((x) => Number(x?.channel?.id) === 7208046 && x?.type !== 'cancellation').slice(0, 25)) {
    const els = await smoobu.getPriceElements(Number(b.id));
    const as = assessBookingAmounts({ booking: b, elements: els });
    const baseSum = (els ?? []).filter((e) => e.type === 'basePrice').reduce((acc, e) => acc + (typeof e.amount === 'number' ? e.amount : NaN), 0);
    hidden.push(String(b.id));
    recent.push({ ref: maskSmoobu(b.id), llegada: String(b.arrival).slice(0, 10), fiable: as.ok, motivo: as.block ?? null, modo: as.taxMode ?? null,
      tarifaIgualAPrice: Number.isFinite(baseSum) ? Math.round(baseSum * 100) === Math.round(Number(b.price) * 100) : null,
      elementos: (els ?? []).map((e) => `${e.type}/${label(e)}/${e.currencyCode}/q${e.quantity ?? '-'}${e.priceIncludedInId ? '/incl' : ''}`) });
  }
  const r = {
    reservasBooking: recent,
    result: plan.ok ? (plan.noop ? 'YA_CORREGIDO' : 'CORRECCION_LISTA_SIN_EJECUTAR') : 'BLOQUEADA', block: plan.block ?? null,
    writesSentToOdoo: 0,
    smoobu: { elementos: (elements ?? []).map((e) => ({ tipo: e.type, clase: label(e), moneda: e.currencyCode, cantidad: e.quantity ?? null, incluidoEnOtro: e.priceIncludedInId != null && e.priceIncludedInId !== 0 })),
      totalFiable: a.ok, modoImpuesto: a.taxMode ?? null, impuestoSobreTarifa: a.ok && a.base > 0 ? Math.round((a.tax / a.base) * 10000) / 10000 : null, comisionDisponible: a.ok ? a.commission != null : null, comisionFueraDelTotal: true },
    pedido: { estado: order.state, facturas: (order.invoice_ids ?? []).length, impuestoActual: order.amount_tax, lineas: lines.length, impuestosEnLinea: lines.reduce((n, l) => n + (l.tax_ids ?? []).length, 0), turnos: slots },
    simulacion: plan.ok && !plan.noop ? {
      lineaHoyEnTarifaBase: true, totalNuevoIgualAlTotalDeBooking: plan.after.price_unit === a.total, precioManualIgualAlPrecio: plan.after.x_precio_manual === plan.after.price_unit,
      impuestosDeOdooAnadidos: plan.odooTaxes.length, escrituras: plan.writes.map(([m, f]) => `${m}.${f}`), validadorPropio: validateCorrection(plan, { orderId: order.id, lineId: lines[0].id }),
      facturasQueSeCrearian: 0, pagosQueSeCrearian: 0, turnosQueSeCrearian: 0, confirmaria: false,
    } : null,
  };
  const guard = assertPublicSafe(JSON.stringify(r), { identifiers: [...hidden, String(sid), String(booking?.['guest-name'] ?? 'x-sin-nombre-x'), String(a.base ?? 'x'), String(a.total ?? 'x')], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey] });
  if (!guard.safe) out({ result: 'DETALLE_RETENIDO', code: 'PRIVACY_GUARD_TRIPPED', writesSentToOdoo: 0 }, 3);
  out(r, 0);
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writesSentToOdoo: 0 }, 1); }
