#!/usr/bin/env node
// ATH-PMS-WA-068: ENVIO REAL UNICO, autorizado por gerencia. Sin la frase y la huella exactas no hace nada.
// Destinatario, cuenta, mensaje y ventana los fija y verifica src/whatsapp-agent-sender.mjs; aqui no se puede cambiar ninguno.
import { loadOdooConfig, loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooWhatsAppSendOnce, SEND_AUTH_PHRASE } from '../src/whatsapp-agent-sender.mjs';
import { bogotaToday } from '../src/whatsapp-agent-runner.mjs';
if (process.env.WHATSAPP_AGENT_ARM !== 'ATH-PMS-WA-068-SEND-ONCE' || process.env.WHATSAPP_SEND_AUTH !== SEND_AUTH_PHRASE) { console.log(JSON.stringify({ result: 'NOT_AUTHORIZED', sent: false })); process.exit(2); }
try {
  const s = new OdooWhatsAppSendOnce(loadOdooConfig(), { authorization: process.env.WHATSAPP_SEND_AUTH, approvedTextSha256: process.env.WHATSAPP_SEND_TEXT_SHA256 });
  const smoobu = new SmoobuClient({ ...loadSmoobuConfig(process.env) });
  const out = await s.sendOnce({ smoobu, today: bogotaToday() });
  console.log(JSON.stringify({ result: 'SENT_ONCE', sent: true, recipient: out.recipient, textSha256: out.textSha256, odooResult: out.result }));
} catch (e) { console.log(JSON.stringify({ result: 'SEND_ONCE_FAILED', sent: false, code: e.code || 'UNKNOWN', httpStatus: e.status || null })); process.exit(1); }
