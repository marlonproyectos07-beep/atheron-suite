/** HOTEL-017: puerto Odoo sobre el Hotel Gateway existente.
 * Sin credenciales Odoo propias: toda llamada pasa por el cliente del Gateway inyectado.
 * El Gateway HOTEL-007 expone hoy solo availability/quote/hold/status; las operaciones
 * OTA de abajo NO existen todavia (ver AI/ATH-ODOO-HOTEL-017_GATEWAY_GAPS.md). Mientras
 * falten, este puerto falla cerrado con GATEWAY_OPERATION_UNSUPPORTED: nunca simula.
 */
export const REQUIRED_GATEWAY_OPERATIONS = Object.freeze([
  'ota_blocks_list', 'ota_block_apply', 'ota_block_release', 'ota_snapshot_list', 'ota_snapshot_put',
]);

export class GatewayPortError extends Error {
  constructor(code, message) { super(message ?? code); this.code = code; }
}

function unwrap(response, operation) {
  if (!response || response.ok === false) {
    throw new GatewayPortError(response?.error?.code ?? 'GATEWAY_ERROR', `${operation} failed`);
  }
  const data = response.data ?? response;
  // En LIVE, la acción Odoo 1967 devuelve su propio sobre dentro del sobre HTTP.
  if (data?.ok === false) {
    throw new GatewayPortError(data.error_code ?? 'ODOO_OPERATION_FAILED', `${operation} failed in Odoo`);
  }
  if (data?.ok === true) {
    if (!data.data || typeof data.data !== 'object') {
      throw new GatewayPortError('ODOO_RESPONSE_INVALID', `${operation} returned no data`);
    }
    return data.data;
  }
  return data;
}

export function createGatewayOdooPort({ client, property_id } = {}) {
  const call = async (operation, payload) => {
    if (typeof client?.[operation] !== 'function') {
      throw new GatewayPortError('GATEWAY_OPERATION_UNSUPPORTED', `Gateway client lacks ${operation}`);
    }
    return unwrap(await client[operation]({ ...payload, property_id }), operation);
  };
  const toBlock = (b) => ({
    canonical_unit_id: b.canonical_unit_id, check_in: b.check_in, check_out: b.check_out,
    status: b.status ?? 'blocked', source: b.source ?? 'odoo', idempotency_key: b.idempotency_key,
  });
  return Object.freeze({
    /** Bloques NO derivados de las 6 unidades; el efecto CASA lo calcula inventory-model. */
    listBlocks: async () => (await call('ota_blocks_list', {})).blocks.map(toBlock),
    applyBlock: async (r) => call('ota_block_apply', {
      idempotency_key: r.idempotency_key, source: r.source, canonical_unit_id: r.canonical_unit_id,
      odoo_unit_id: r.odoo_unit_id, external_uid: r.external_reservation_id,
      check_in: r.check_in, check_out: r.check_out, correlation_id: r.correlation_id,
    }),
    releaseBlock: async (idempotency_key) => call('ota_block_release', { idempotency_key }),
    snapshotStore: Object.freeze({
      list: async (source, canonical_unit_id) => (await call('ota_snapshot_list', { source, canonical_unit_id })).entries,
      put: async (entry) => { await call('ota_snapshot_put', { entry }); },
    }),
  });
}
