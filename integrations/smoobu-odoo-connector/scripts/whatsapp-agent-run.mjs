#!/usr/bin/env node
// ATH-PMS-WA-064: ejecuta el agente en sombra. Sin armado explicito no hace nada. NUNCA envia WhatsApp.
import { loadOdooConfig, loadSmoobuConfig } from '../src/config.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooDraftWriter, runAgent, bogotaToday } from '../src/whatsapp-agent-runner.mjs';
import { ControlGate } from '../src/control-gate.mjs';
if (process.env.WHATSAPP_AGENT_ARM !== 'ATH-PMS-WA-064-DRAFT-ONLY') { console.log(JSON.stringify({ result: 'NOT_ARMED', requests: 0 })); process.exit(2); }
try {
  const o = loadOdooConfig(); const odoo = new OdooJson2Client(o);
  const post = process.env.WHATSAPP_AGENT_POST === '1';
  const writer = post ? new OdooDraftWriter(o, process.env.DRAFT_CHANNEL_ID) : null;
  const smoobu = new SmoobuClient({ ...loadSmoobuConfig(process.env) });
  const controlGate = new ControlGate(odoo);
  const report = await runAgent({ odoo, writer, smoobu, controlGate, today: bogotaToday() });
  // el registro del runner es publico: solo telefono enmascarado, tipos y conteos
  console.log(JSON.stringify({ result: post ? 'DRAFTS_POSTED' : 'DRY_RUN', ...report, drafts: report.drafts.map(({ sender, kind, reason, covers, draft }) => ({ sender, kind, reason, covers, draft })) }));
} catch (e) { console.log(JSON.stringify({ result: 'AGENT_RUN_FAILED', code: e.code || 'UNKNOWN', httpStatus: e.status || null })); process.exit(1); }
