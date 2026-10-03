/**
 * ATH-ODOO-HOTEL-012 V2 -- lectura (SOLO LECTURA) de todo lo que necesita
 * el Control Center, con el mismo patron "opcion D" de HOTEL-009: el
 * llamador de confianza (scripts locales de Marlon) pasa un transporte ya
 * autenticado; aqui solo se usa `search_read`. Nunca `create`, `write`,
 * `unlink` ni `execute` de acciones. Nunca se expone como operacion HTTP
 * del Gateway.
 */
import { fetchAllHotelReservations, fetchHotelPayments, fetchOpenHousekeepingTasks } from './odoo-reporting-reader.mjs';

export const UNIT_FIELDS = Object.freeze(['id', 'x_name', 'x_resource_id', 'x_property_id']);

async function fetchUnitResourceMap(transport, { database, uid, technicalSecret }) {
  const rows = await transport.call('object', 'execute_kw', [database, uid, technicalSecret, 'x_hotel_unit', 'search_read', [[]], { fields: UNIT_FIELDS, limit: 100 }]);
  const unitByResourceId = {};
  for (const r of rows) {
    const rid = Array.isArray(r.x_resource_id) ? r.x_resource_id[0] : r.x_resource_id;
    if (rid) unitByResourceId[rid] = { name: r.x_name, property: Array.isArray(r.x_property_id) ? r.x_property_id[1] : null };
  }
  return unitByResourceId;
}

/**
 * @returns {{reservations, truncated, payments, housekeepingTasks, gaps: string[]}}
 * Cada fuente que falla se degrada a `null` + un gap explicito; nunca a datos inventados.
 */
export async function readControlCenterInputs(transport, auth) {
  const gaps = [];
  const { reservations, truncated } = await fetchAllHotelReservations(transport, auth);

  let payments = null;
  try {
    payments = await fetchHotelPayments(transport, { ...auth, limit: 2000 });
  } catch {
    gaps.push('account.payment no legible: cobrado por fecha real = null');
  }

  let housekeepingTasks = null;
  try {
    const map = await fetchUnitResourceMap(transport, auth);
    const flat = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.name]));
    const tasks = await fetchOpenHousekeepingTasks(transport, auth, { unitByResourceId: flat });
    housekeepingTasks = tasks.filter((t) => t.unit);
  } catch {
    gaps.push('project.task / x_hotel_unit no legibles: housekeeping = SIN DATO');
  }
  return { reservations, truncated, payments, housekeepingTasks, gaps };
}
