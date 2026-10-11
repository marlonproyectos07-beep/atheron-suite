import { addDays } from './dates.mjs';
import { PAYMENT_CONFIRMED, PAYMENT_REPORTED } from './master-stay.mjs';

/**
 * CIERRE DIARIO (modelo de STAGING, puro: no escribe en Odoo, Beds24 ni producción).
 * Entrada: estadías ya consolidadas (consolidateStays) + egresos + totales de Odoo para comparar.
 *
 * Reglas:
 *  - Solo PAYMENT_CONFIRMED cuenta como dinero recibido, caja, banco o reducción de saldo. PAYMENT_REPORTED se lista aparte.
 *  - Efectivo confirmado va al diario Efectivo_Atheron_Suite; otro diario para efectivo se reporta como aviso (no se corrige solo).
 *  - Booking/Airbnb por cobrar = venta bruta de esas estadías − lo confirmado (sin descontar comisión: la comisión real
 *    la fija el pago de la OTA; nada se supone).
 *  - Lo que falta no se inventa: sin totales de Odoo la diferencia es SIN_DATOS_ODOO.
 *
 * Reconocimiento de la venta (HIPÓTESIS a decidir por dirección): ACCRUAL_NIGHT (defecto) reparte la venta por noche
 * (el resto de la división, en la última noche); CHECKIN la reconoce entera el día de llegada. DAY_USE se reconoce el día de uso.
 */
export const JOURNAL_EFECTIVO = 'Efectivo_Atheron_Suite';
export const METHODS = Object.freeze(['cash', 'bank', 'ota_payout', 'other']);
const OTA = Object.freeze({ BOOKING: 'booking_por_cobrar', AIRBNB: 'airbnb_por_cobrar' });

export function salesOn(stay, date, recognition = 'ACCRUAL_NIGHT') {
  if (stay.status !== 'CONFIRMED') return 0;
  if (stay.day_use || stay.total_nights === 0) return stay.check_in_global === date ? stay.total_sale : 0;
  if (recognition === 'CHECKIN') return stay.check_in_global === date ? stay.total_sale : 0;
  if (date < stay.check_in_global || date >= stay.check_out_global) return 0;
  const per = Math.floor(stay.total_sale / stay.total_nights);
  return date === addDays(stay.check_out_global, -1) ? stay.total_sale - per * (stay.total_nights - 1) : per;
}

/**
 * @param {object} p
 * @param {object[]} p.stays        de consolidateStays
 * @param {string}   p.date         AAAA-MM-DD
 * @param {object[]} [p.expenses]   {id, date, amount, method, status, concept}; solo status CONFIRMED resta
 * @param {object}   [p.odoo]       {sales, received, cash, bank, expenses} ya calculados en Odoo, para comparar
 */
export function dailyCloseStaging({ stays, date, expenses = [], odoo = null, recognition = 'ACCRUAL_NIGHT' }) {
  const warnings = [];
  const live = stays.filter((s) => s.status === 'CONFIRMED');
  const sales = live.reduce((a, s) => a + salesOn(s, date, recognition), 0);

  const payments = live.flatMap((s) => s.payments.map((p) => ({ ...p, stay_id: s.stay_id, source: s.source })));
  const todayConfirmed = payments.filter((p) => p.status === PAYMENT_CONFIRMED && p.date === date);
  const todayReported = payments.filter((p) => p.status === PAYMENT_REPORTED && (p.date === date || p.date == null));
  const undated = payments.filter((p) => p.status === PAYMENT_CONFIRMED && !p.date).map((p) => p.id);
  if (undated.length) warnings.push({ code: 'PAGO_CONFIRMADO_SIN_FECHA', detail: undated.join(',') });

  const sum = (xs) => xs.reduce((a, p) => a + p.amount, 0);
  const cashIn = todayConfirmed.filter((p) => p.method === 'cash');
  const bankIn = todayConfirmed.filter((p) => p.method === 'bank' || p.method === 'ota_payout');
  const unclassified = todayConfirmed.filter((p) => !METHODS.includes(p.method) || p.method === 'other');
  if (unclassified.length) warnings.push({ code: 'PAGO_SIN_MEDIO', detail: unclassified.map((p) => p.id).join(',') });
  for (const p of cashIn) if (p.journal !== JOURNAL_EFECTIVO) warnings.push({ code: 'EFECTIVO_FUERA_DEL_DIARIO', detail: `${p.id}: ${p.journal ?? 'sin diario'} (esperado ${JOURNAL_EFECTIVO})` });

  const out = expenses.filter((e) => e.date === date && e.status === PAYMENT_CONFIRMED);
  const cashOut = out.filter((e) => e.method === 'cash'); const bankOut = out.filter((e) => e.method !== 'cash');
  const pendingExpenses = expenses.filter((e) => e.date === date && e.status !== PAYMENT_CONFIRMED);

  const receivable = (src) => live.filter((s) => s.source === src).reduce((a, s) => a + s.balance, 0);
  const guestBalances = live.filter((s) => s.source !== 'BOOKING' && s.source !== 'AIRBNB' && s.balance > 0)
    .map((s) => ({ stay_id: s.stay_id, guest: s.guest, balance: s.balance }));

  const received = sum(todayConfirmed);
  const close = {
    date, recognition,
    ventas_del_dia: sales,
    dinero_recibido: received,
    caja: { entradas: sum(cashIn), salidas: sum(cashOut), neto: sum(cashIn) - sum(cashOut), diario: JOURNAL_EFECTIVO },
    banco: { entradas: sum(bankIn), salidas: sum(bankOut), neto: sum(bankIn) - sum(bankOut) },
    saldos_huesped: { total: guestBalances.reduce((a, g) => a + g.balance, 0), detalle: guestBalances },
    booking_por_cobrar: receivable('BOOKING'),
    airbnb_por_cobrar: receivable('AIRBNB'),
    egresos: sum(out),
    // lo que NO entra en ningún total anterior y debe verse
    reportado_sin_confirmar: { total: sum(todayReported), pagos: todayReported.map((p) => ({ id: p.id, stay_id: p.stay_id, amount: p.amount })) },
    egresos_sin_confirmar: pendingExpenses.reduce((a, e) => a + (Number(e.amount) || 0), 0),
    advertencias: warnings,
  };
  const cmp = (mine, theirs) => (theirs == null ? 'SIN_DATOS_ODOO' : mine - theirs);
  close.diferencia_vs_odoo = odoo == null ? 'SIN_DATOS_ODOO' : {
    ventas: cmp(sales, odoo.sales), recibido: cmp(received, odoo.received),
    caja: cmp(close.caja.entradas, odoo.cash), banco: cmp(close.banco.entradas, odoo.bank), egresos: cmp(close.egresos, odoo.expenses),
  };
  close.cuadra = typeof close.diferencia_vs_odoo === 'object' && Object.values(close.diferencia_vs_odoo).every((v) => v === 0);
  return close;
}
