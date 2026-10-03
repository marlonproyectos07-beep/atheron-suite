/**
 * Grupos grandes. Solo se usa capacidad VERIFICADA contra Odoo (hoy: Hotel
 * Atheron Suite). Las capacidades de la web (Casa Algarra 22, Neusa 8,
 * Apartamentos 41...) son referencia NO verificada: nunca se prometen.
 *
 *   n >= 100  -> STRATEGIC_GROUP_LEAD (lead estrategico, siempre humano)
 *   n >= 11   -> humano (cotizacion a la medida)
 *   n > 22    -> PARTIAL_CAPACITY: lo verificado en Odoo no alcanza solo
 *
 * Nunca crea HOLD y nunca promete que un grupo "cabe".
 */
import { POLICY, PROPERTIES, VERIFIED_ODOO_CAPACITY } from './policy.mjs';

export const GROUP_STATUS = Object.freeze({
  NONE: 'NONE',
  SMALL_GROUP: 'SMALL_GROUP',
  HUMAN_QUOTE: 'HUMAN_QUOTE',
  PARTIAL_CAPACITY: 'PARTIAL_CAPACITY',
  STRATEGIC_GROUP_LEAD: 'STRATEGIC_GROUP_LEAD',
});

/** Flujo comercial por tamano: >=11 GROUP_SALES_FLOW, >=30 LARGE_GROUP_FLOW (alerta humana), >=100 STRATEGIC_GROUP_LEAD. */
export function groupFlowFor(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= POLICY.group.strategic_from) return 'STRATEGIC_GROUP_LEAD';
  if (n >= POLICY.group.large_from) return 'LARGE_GROUP_FLOW';
  if (n >= POLICY.group.human_from) return 'GROUP_SALES_FLOW';
  return null;
}

export function evaluateGroup(n) {
  if (!Number.isFinite(n) || n < 7) return { status: GROUP_STATUS.NONE, guests: n ?? null, can_promise_capacity: false, hold_allowed: false };
  const verified = VERIFIED_ODOO_CAPACITY.casa_completa_AS;
  const unverified = Object.values(PROPERTIES)
    .filter((p) => !p.odoo_mapped && p.capacity_web)
    .map((p) => ({ property: p.name, capacity_web: p.capacity_web, verified: false }));
  const base = {
    guests: n,
    verified_capacity: { source: 'ODOO_STAGING', properties: VERIFIED_ODOO_CAPACITY.properties, single_property_max: verified },
    unverified_reference: unverified,
    can_promise_capacity: false,
    hold_allowed: false, // jamas HOLD masivo ni automatico para grupos
    data_gaps: [],
  };
  if (n >= POLICY.group.strategic_from) {
    return { ...base, status: GROUP_STATUS.STRATEGIC_GROUP_LEAD, escalate: true, data_gaps: ['CAPACIDAD_MULTIPROPIEDAD_NO_VERIFICADA_EN_ODOO'] };
  }
  if (n > verified) {
    return { ...base, status: GROUP_STATUS.PARTIAL_CAPACITY, escalate: true, data_gaps: ['CAPACIDAD_OTRAS_PROPIEDADES_NO_VERIFICADA_EN_ODOO'] };
  }
  if (n >= POLICY.group.human_from) return { ...base, status: GROUP_STATUS.HUMAN_QUOTE, escalate: true };
  return { ...base, status: GROUP_STATUS.SMALL_GROUP, escalate: true }; // 7-10: cotizacion de grupo a la medida (Playbook S6)
}

/** Escenario de venta S1..S8 del Playbook para N personas. */
export function scenarioFor(n) {
  if (!Number.isFinite(n) || n < 1) return null;
  if (n === 1) return 'S1';
  if (n === 2) return 'S2';
  if (n === 3) return 'S3';
  if (n === 4) return 'S4';
  if (n <= 6) return 'S5';
  if (n <= 10) return 'S6';
  if (n <= 15) return 'S7';
  return 'S8';
}
