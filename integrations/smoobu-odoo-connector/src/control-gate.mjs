// ATH-PMS-WA-070 CP-04 — fail-closed gate for the Atheron WhatsApp agent.
// Reads only x_ath_state and x_ath_node. No Odoo writes.
import { ConnectorError } from './errors.mjs';

export const CONTROL_GATE_DEFAULTS = Object.freeze({
  stateId: 1, waAccountId: 7, maxReadMs: 3000,
});
export class ControlGate {
  constructor(odoo, { stateId = 1, waAccountId = 7, maxReadMs = 3000, now = () => Date.now() } = {}) {
    if (!odoo || typeof odoo.searchRead !== 'function') throw new ConnectorError('CONTROL_GATE_CLIENT_INVALID');
    Object.assign(this, { odoo, stateId, waAccountId, maxReadMs, now });
  }
  async check({ requireReply = true, requireBooking = false } = {}) {
    const started = this.now();
    try {
      const [states, nodes] = await Promise.all([
        this.odoo.searchRead('x_ath_state', [['id', '=', this.stateId]], ['id','x_epoch','x_emergency']),
        this.odoo.searchRead('x_ath_node', [['x_level','=','cuenta'],['x_wa_account_id','=',this.waAccountId]], ['id','x_eff_auto_reply','x_eff_auto_booking','x_eff_status'])
      ]);
      const elapsed = this.now() - started;
      if (elapsed > this.maxReadMs) return this.block('CONTROL_READ_TOO_SLOW', { elapsedMs: elapsed });
      if (!Array.isArray(states) || states.length !== 1 || !Array.isArray(nodes) || nodes.length !== 1) return this.block('CONTROL_STATE_MISSING_OR_AMBIGUOUS');
      const state = states[0], node = nodes[0];
      if (!Number.isSafeInteger(Number(state.x_epoch)) || Number(state.x_epoch) < 1 || typeof state.x_emergency !== 'boolean') return this.block('CONTROL_STATE_INVALID');
      if (state.x_emergency) return this.block('EMERGENCY_ACTIVE', { epoch: state.x_epoch });
      if (node.x_eff_status !== 'ACTIVO' && node.x_eff_status !== 'ACTIVE') return this.block('ACCOUNT_NOT_ACTIVE', { epoch: state.x_epoch, status: node.x_eff_status ?? null });
      if (requireReply && node.x_eff_auto_reply !== true) return this.block('AUTO_REPLY_DISABLED', { epoch: state.x_epoch });
      if (requireBooking && node.x_eff_auto_booking !== true) return this.block('AUTO_BOOKING_DISABLED', { epoch: state.x_epoch });
      return { allowed: true, epoch: Number(state.x_epoch), accountNodeId: node.id, checkedAt: new Date(this.now()).toISOString() };
    } catch (e) {
      if (e instanceof ConnectorError) return this.block(e.code || 'CONTROL_READ_FAILED');
      return this.block('CONTROL_READ_FAILED');
    }
  }
  async assertAllowed(options) {
    const result = await this.check(options);
    if (!result.allowed) throw new ConnectorError(result.code, result);
    return result;
  }
  block(code, detail = {}) { return { allowed: false, code, ...detail }; }
}
