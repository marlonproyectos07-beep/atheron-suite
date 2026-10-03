/**
 * Punto de entrada con kill switch. Con WHATSAPP_AUTOMATION_ENABLED=false el
 * agente no analiza ni propone nada. No existe ruta de envio: toda salida es
 * `outbound: null` y pasa por `outboundGate`.
 */
import { processMessage } from './agent.mjs';
import { outboundGate, resolveConfig } from './config.mjs';
import { processCallEvent } from './calls.mjs';
import { processAudioMessage } from './audio.mjs';

const suppressed = (config) => ({ suppressed: true, mode: config.mode.toUpperCase(), reason: 'KILL_SWITCH_OFF', escalate: false, reply: null, outbound: null });

export function createRuntime({ env = process.env } = {}) {
  const config = resolveConfig(env);
  const wrap = (d) => (d.suppressed ? d : { ...d, outbound: outboundGate(config, d.reply).outbound });
  return Object.freeze({
    config,
    async handleMessage(session, message, deps) {
      if (!config.enabled) return suppressed(config);
      return wrap(await processMessage(session, message, deps));
    },
    async handleCallEvent(session, event, deps) {
      if (!config.enabled) return suppressed(config);
      return wrap(processCallEvent(session, event, deps));
    },
    async handleAudio(session, message, deps, port) {
      if (!config.enabled) return suppressed(config);
      return wrap(await processAudioMessage(session, message, deps, port));
    },
  });
}
