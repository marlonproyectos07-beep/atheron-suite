/**
 * Anticipo oficial = 50 % (decision CEO 2026-10-03). El agente NUNCA
 * calcula tarifas: solo aplica el porcentaje oficial sobre el total que
 * devolvio Odoo, y avisa si Odoo todavia exige otro porcentaje.
 */
import { POLICY } from './policy.mjs';

export function depositFor(total, percent = POLICY.deposit.percent) {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null;
  return Math.round(total * percent) / 100;
}

/**
 * Compara el anticipo que exige Odoo (`quote.deposit_required`) con el 50 %
 * oficial. Si difiere es configuracion anterior/inconsistente (p. ej. 30 %):
 * se marca para que un humano la corrija en STAGING; el agente sigue
 * hablando con el 50 %.
 */
export function reconcileWithOdoo(quote) {
  if (!quote || typeof quote.total !== 'number' || typeof quote.deposit_required !== 'number') return { checked: false, mismatch: false };
  const expected = depositFor(quote.total);
  const mismatch = Math.abs(expected - quote.deposit_required) > 1;
  return { checked: true, mismatch, expected, odoo: quote.deposit_required, odoo_percent: Math.round((quote.deposit_required / quote.total) * 1000) / 10 };
}
