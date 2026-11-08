#!/usr/bin/env node
// ATH-PMS-WA-068: SIMULACION del envio unico. Solo lectura: nunca envia. (El envio real exige otro script/autorizacion.)
import { loadOdooConfig, loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooWhatsAppSendOnce } from '../src/whatsapp-agent-sender.mjs';
import { ControlGate } from '../src/control-gate.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { bogotaToday } from '../src/whatsapp-agent-runner.mjs';
if (process.env.WHATSAPP_AGENT_ARM !== 'ATH-PMS-WA-068-SEND-SIMULATION') { console.log(JSON.stringify({ result: 'NOT_ARMED', requests: 0 })); process.exit(2); }
try {
  const odooCfg = loadOdooConfig(); const odoo = new OdooJson2Client(odooCfg);
  const s = new OdooWhatsAppSendOnce(odooCfg, { controlGate: new ControlGate(odoo) }); // simulación protegida por Centro de Control
  const smoobu = new SmoobuClient({ ...loadSmoobuConfig(process.env) });
  const plan = await s.planSend({ smoobu, today: bogotaToday() });
  console.log(JSON.stringify({ result: plan.ok ? 'SIMULATION_OK_NOT_SENT' : 'SIMULATION_CHECKS_FAILED', ...plan, text: plan.text }, null, 1));
} catch (e) { console.log(JSON.stringify({ result: 'SEND_SIM_FAILED', code: e.code || 'UNKNOWN', httpStatus: e.status || null })); process.exit(1); }
