/**
 * Puerto hacia el Gateway/Odoo STAGING. El agente solo conoce este contrato;
 * NO reconstruye el Gateway: `fromHotel016Tools` adapta el objeto `tools`
 * que ya produce `buildWhatsAppQuoteOnlyTools` (HOTEL-016, rama
 * feature/ath-odoo-hotel-016-whatsapp-natural-media), que solo expone
 * availability + quote. HOLD/status/cancel NO estan en el puerto: en
 * shadow no se crea nada.
 *
 *   searchOptions({checkIn, checkOut, guests?}) ->
 *     { ok, options: [{ property_id, property_name, unit_id, unit_label,
 *                       capacity, available, base_total|null }] }
 *   quote({checkIn, checkOut, guests, unit_ids}) ->
 *     { ok, total|null, quote_id|null, requires_manual_confirmation }
 *
 * `base_total` y `total` SIEMPRE vienen de Odoo; si Odoo no los da, son null
 * y el agente no cotiza.
 */

export const GATEWAY_PORT_METHODS = Object.freeze(['searchOptions', 'quote']);
export const FORBIDDEN_GATEWAY_METHODS = Object.freeze(['createHold', 'hold', 'cancel', 'confirm', 'write', 'createBooking']);

export function assertGatewayPort(gateway) {
  for (const m of GATEWAY_PORT_METHODS) {
    if (typeof gateway?.[m] !== 'function') throw new Error(`GATEWAY_PORT_MISSING_METHOD: ${m}`);
  }
  for (const m of FORBIDDEN_GATEWAY_METHODS) {
    if (typeof gateway?.[m] === 'function') throw new Error(`GATEWAY_PORT_FORBIDDEN_METHOD: ${m} (shadow no escribe en Odoo)`);
  }
  return true;
}

/**
 * Catalogo de propiedades/unidades desde el formato del respaldo de Odoo staging
 * (AI/staging-backup/master-data-x_hotel_*.json). Capacidad = x_cap_comercial
 * (nunca la extra). Las unidades compuestas (con hijas, p. ej. CASA_COMPLETA)
 * se excluyen del reparto de grupos para no contar dos veces la misma cama.
 */
export function catalogFromOdooMasterData({ properties, units, aliases = {} }) {
  const props = new Map();
  for (const p of properties) {
    if (p.x_active === false) continue;
    props.set(p.id, { id: p.id, name: p.x_name, aliases: aliases[p.id] ?? [], units: [] });
  }
  for (const u of units) {
    if (u.x_active === false) continue;
    const pid = Array.isArray(u.x_property_id) ? u.x_property_id[0] : u.x_property_id;
    const prop = props.get(pid);
    if (!prop) continue;
    prop.units.push({
      unit_id: u.id,
      unit_label: u.x_name,
      capacity: Number(u.x_cap_comercial ?? 0),
      composite: Array.isArray(u.x_child_ids) && u.x_child_ids.length > 0,
    });
  }
  return { properties: [...props.values()] };
}

/**
 * Adaptador sobre las `tools` de HOTEL-016 ({checkAvailability, quote}).
 * LIMITACION CONOCIDA: HOTEL-016 solo mapea unidades de Hotel Atheron Suite
 * (UNIT_ID_MAP). Para las demas propiedades hay que extender ese mapa desde
 * Odoo antes de usarlo en vivo; aqui NO se inventa.
 * @param {{tools:{checkAvailability:Function, quote:Function}, catalog:object, unitKey?:(u)=>string}} cfg
 */
export function fromHotel016Tools({ tools, catalog, unitKey = (u) => u.unit_label }) {
  return {
    async searchOptions({ checkIn, checkOut, guests }) {
      const options = [];
      try {
        for (const p of catalog.properties) {
          for (const u of p.units) {
            if (u.composite) continue;
            const unit = unitKey(u);
            const available = await tools.checkAvailability({ unit, checkIn, checkOut, guests: Math.min(guests ?? u.capacity, u.capacity) });
            if (available !== true) continue;
            const q = await tools.quote({ unit, checkIn, checkOut, guests: Math.min(guests ?? u.capacity, u.capacity) });
            options.push({
              property_id: p.id, property_name: p.name, unit_id: u.unit_id, unit_label: u.unit_label,
              capacity: u.capacity, available: true, base_total: q?.total ?? null,
            });
          }
        }
      } catch (err) {
        return { ok: false, error_code: String(err?.message ?? 'GATEWAY_ERROR').slice(0, 60), options: [] };
      }
      return { ok: true, options };
    },
    async quote({ checkIn, checkOut, guests, unit_ids }) {
      try {
        let total = 0;
        let manual = false;
        let quoteId = null;
        for (const id of unit_ids) {
          const u = catalog.properties.flatMap((p) => p.units).find((x) => x.unit_id === id);
          const q = await tools.quote({ unit: unitKey(u), checkIn, checkOut, guests });
          if (q?.total == null) return { ok: true, total: null, quote_id: null, requires_manual_confirmation: true };
          total += Number(q.total);
          manual ||= q.requires_manual_confirmation === true;
          quoteId ??= q.quote_id ?? null;
        }
        return { ok: true, total, quote_id: quoteId, requires_manual_confirmation: manual };
      } catch (err) {
        return { ok: false, error_code: String(err?.message ?? 'GATEWAY_ERROR').slice(0, 60) };
      }
    },
  };
}
