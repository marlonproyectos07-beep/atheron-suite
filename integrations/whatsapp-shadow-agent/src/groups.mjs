/**
 * Grupos grandes / multipropiedad. Nunca excede la capacidad real, nunca
 * inventa descuentos: el precio base es la suma de lo que dice Odoo y el
 * descuento (si lo hay) lo decide un humano via GROUP_PRICING_APPROVAL.
 */

export function groupTier(total) {
  if (!Number.isFinite(total)) return null;
  if (total >= 100) return 'STRATEGIC_GROUP_LEAD';
  if (total >= 30) return 'LARGE_GROUP_FLOW';
  if (total >= 11) return 'GROUP_SALES_FLOW';
  return null;
}

function groupByProperty(options) {
  const map = new Map();
  for (const o of options) {
    if (!o.available || !(o.capacity > 0)) continue;
    if (!map.has(o.property_id)) map.set(o.property_id, { property_id: o.property_id, property_name: o.property_name, units: [] });
    map.get(o.property_id).units.push(o);
  }
  return [...map.values()].map((p) => ({ ...p, capacity: p.units.reduce((s, u) => s + u.capacity, 0) }));
}

function fillProperty(prop, people) {
  const units = [...prop.units].sort((a, b) => b.capacity - a.capacity);
  const used = [];
  let remaining = people;
  for (const u of units) {
    if (remaining <= 0) break;
    const assigned = Math.min(u.capacity, remaining);
    used.push({ unit_id: u.unit_id, unit_label: u.unit_label, capacity: u.capacity, guests_assigned: assigned, base_total: u.base_total ?? null });
    remaining -= assigned;
  }
  const guests = people - remaining;
  const capacityUsed = used.reduce((s, u) => s + u.capacity, 0);
  const priced = used.every((u) => u.base_total != null);
  return {
    property_id: prop.property_id,
    property_name: prop.property_name,
    units: used,
    guests_assigned: guests,
    capacity_used: capacityUsed,
    capacity_remaining: prop.capacity - capacityUsed,
    base_total: priced ? used.reduce((s, u) => s + u.base_total, 0) : null,
  };
}

/**
 * Plan para `people` huespedes sobre las unidades disponibles.
 * 1) Si una sola propiedad alcanza, usa la que menos unidades necesite (y menor precio).
 * 2) Si no, combina propiedades de mayor a menor capacidad disponible.
 * Si no alcanza el inventario total, `covered=false` y `shortfall` dice cuanto falta.
 */
export function planDistribution(options, people) {
  const props = groupByProperty(options);
  const totalCapacity = props.reduce((s, p) => s + p.capacity, 0);
  const single = props.filter((p) => p.capacity >= people).map((p) => fillProperty(p, people));
  if (single.length) {
    single.sort((a, b) => a.units.length - b.units.length || (a.base_total ?? Infinity) - (b.base_total ?? Infinity));
    return { covered: true, mode: 'SINGLE_PROPERTY', assignments: [single[0]], alternatives: single.slice(1), total_capacity: totalCapacity, shortfall: 0 };
  }
  const assignments = [];
  let remaining = people;
  for (const p of [...props].sort((a, b) => b.capacity - a.capacity)) {
    if (remaining <= 0) break;
    const a = fillProperty(p, remaining);
    assignments.push(a);
    remaining -= a.guests_assigned;
  }
  return {
    covered: remaining <= 0,
    mode: assignments.length > 1 ? 'MULTI_PROPERTY' : 'SINGLE_PROPERTY',
    assignments,
    alternatives: [],
    total_capacity: totalCapacity,
    shortfall: Math.max(0, remaining),
  };
}

export function planTotals(plan) {
  const guests = plan.assignments.reduce((s, a) => s + a.guests_assigned, 0);
  const priced = plan.assignments.every((a) => a.base_total != null) && plan.assignments.length > 0;
  return {
    guests_assigned: guests,
    units: plan.assignments.reduce((s, a) => s + a.units.length, 0),
    base_total: priced ? plan.assignments.reduce((s, a) => s + a.base_total, 0) : null,
  };
}
