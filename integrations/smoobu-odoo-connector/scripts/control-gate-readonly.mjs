#!/usr/bin/env node
// ATH-PMS-WA-070 CP-04: lectura real y manual del Centro de Control. Nunca escribe en Odoo.
import { loadOdooConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { ControlGate } from '../src/control-gate.mjs';

try {
  const odoo = new OdooJson2Client(loadOdooConfig());
  // Solo valida lectura, estructura, emergencia y valores efectivos. No requiere encender respuestas ni reservas.
  const result = await new ControlGate(odoo).check({ requireReply: false, requireBooking: false });
  if (!result.allowed) {
    console.log(JSON.stringify({ result: 'CONTROL_READ_BLOCKED', code: result.code, epoch: result.epoch ?? null }));
    process.exit(1);
  }
  console.log(JSON.stringify({
    result: 'CONTROL_READ_OK',
    epoch: result.epoch,
    accountNodeId: result.accountNodeId,
    emergency: false,
    autoReplyEnabled: result.autoReplyEnabled,
    autoBookingEnabled: result.autoBookingEnabled,
    checkedAt: result.checkedAt,
    writes: 0,
  }));
} catch (e) {
  console.log(JSON.stringify({ result: 'CONTROL_READ_FAILED', code: e.code || 'UNKNOWN', writes: 0 }));
  process.exit(1);
}
