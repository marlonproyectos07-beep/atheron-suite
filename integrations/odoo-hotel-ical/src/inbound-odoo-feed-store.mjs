/** Read/write only x_hotel_ota_feed configuration and sync status in STAGING.
 * The private reference is held in memory for the download and never returned
 * from run summaries. The HOTEL-017 Gateway remains the sole inventory writer.
 */
const STAGING_ORIGIN = 'https://atheron1-hotel-staging-20260923.odoo.com';
const STAGING_DB = 'atheron1-hotel-staging-20260923';

export function createOdooInboundFeedStore({ transport, config }) {
  if (config?.baseUrl !== STAGING_ORIGIN || config?.database !== STAGING_DB
      || !config.technicalUser || !config.technicalSecret || !transport?.call) {
    throw new Error('STAGING_CONFIG_REQUIRED');
  }
  let uid;
  const rpc = async (model, method, args, kwargs = {}) => {
    if (!uid) {
      uid = await transport.call('common', 'login', [config.database, config.technicalUser, config.technicalSecret]);
      if (!uid) throw new Error('ODOO_LOGIN_FAILED');
    }
    try {
      return await transport.call('object', 'execute_kw', [
        config.database, uid, config.technicalSecret, model, method, args, kwargs,
      ]);
    } catch {
      throw new Error('ODOO_FEED_RPC_FAILED');
    }
  };
  return Object.freeze({
    listConfigured: async () => rpc('x_hotel_ota_feed', 'search_read', [
      [['x_inbound_feed_reference', '!=', false]],
    ], {
      fields: ['id', 'x_source', 'x_canonical_unit_id', 'x_odoo_unit_id',
        'x_external_property_id', 'x_external_listing_id', 'x_inbound_feed_reference'],
      limit: 100, order: 'id asc',
    }),
    updateStatus: async (feedId, { status, error, last_sync_at }) => {
      if (!Number.isSafeInteger(feedId) || feedId < 1 || !/^[A-Z_]{2,40}$/.test(status)) {
        throw new Error('FEED_STATUS_INVALID');
      }
      const vals = { x_last_sync_status: status, x_last_error: error || false };
      if (last_sync_at) {
        const date = new Date(last_sync_at);
        if (Number.isNaN(date.getTime())) throw new Error('SYNC_TIME_INVALID');
        vals.x_last_sync_at = date.toISOString().slice(0, 19).replace('T', ' ');
      }
      const written = await rpc('x_hotel_ota_feed', 'write', [[feedId], vals]);
      if (written !== true) throw new Error('FEED_STATUS_WRITE_FAILED');
    },
  });
}
