#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Prioridad 4 -- SOLO LECTURA: investiga si existe una
 * fuente transaccional real para "COBROS HOY" (pago -> reserva ->
 * fecha/hora -> valor -> metodo). Revisa account.payment (pagos) y el
 * campo real ya confirmado x_hotel_payment_ids (One2many en sale.order).
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const config = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: config.baseUrl });
const uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);

async function tryReadFields(model, fieldNames) {
  try {
    const fields = await transport.call('object', 'execute_kw', [
      config.database, uid, config.technicalSecret,
      model, 'fields_get', [fieldNames], { attributes: ['string', 'type'] },
    ]);
    return { model, overall: 'ALLOWED', fields };
  } catch (error) {
    return { model, overall: 'DENIED_OR_ERROR', error_message: error?.message ?? String(error) };
  }
}

// 1. x_hotel_payment_ids: a que modelo apunta? (comodel_name via fields_get de sale.order)
const saleOrderField = await transport.call('object', 'execute_kw', [
  config.database, uid, config.technicalSecret,
  'sale.order', 'fields_get', [['x_hotel_payment_ids']], { attributes: ['string', 'type', 'relation'] },
]);

// 2. Intenta leer ese modelo relacionado (si existe) con sus campos.
const relatedModel = saleOrderField?.x_hotel_payment_ids?.relation ?? null;
const relatedFields = relatedModel
  ? await tryReadFields(relatedModel, [])
  : { model: null, overall: 'NO_RELATION_FOUND' };

// 3. account.payment estandar de Odoo, por si aplica en paralelo.
const accountPayment = await tryReadFields('account.payment', ['payment_date', 'amount', 'partner_id', 'journal_id', 'payment_method_line_id', 'ref']);

console.log(JSON.stringify({
  overall: 'DONE',
  x_hotel_payment_ids: saleOrderField?.x_hotel_payment_ids,
  related_model_detected: relatedModel,
  related_model_read: relatedFields,
  account_payment_read: accountPayment,
}, null, 2));
