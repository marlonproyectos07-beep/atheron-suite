/**
 * Punto de entrada con kill switch. Con WHATSAPP_AUTOMATION_ENABLED=false el
 * agente no analiza ni propone nada. No existe ruta de envio: toda salida es
 * `outbound: null` y pasa por `outboundGate`.
 */
import { processMessage } from './agent.mjs';
import { processHybrid } from './hybrid/pipeline.mjs';
import { assertProvider } from './hybrid/provider.mjs';
import { outboundGate, resolveConfig, ConfigError } from './config.mjs';
import { processCallEvent } from './calls.mjs';
import { processAudioMessage } from './audio.mjs';

const suppressed = (config) => ({ suppressed: true, mode: config.mode.toUpperCase(), reason: 'KILL_SWITCH_OFF', escalate: false, reply: null, outbound: null });

export function createRuntime({ env = process.env, provider = null, hybridOptions = {} } = {}) {
  const config = resolveConfig(env);
  if (config.understanding === 'hybrid_shadow') {
    if (!provider) throw new ConfigError('UNDERSTANDING_PROVIDER_REQUIRED', 'hybrid_shadow requiere un proveedor inyectado (hoy solo el mock; los reales estan DISABLED)');
    assertProvider(provider);
  }
  const wrap = (d) => (d.suppressed ? d : { ...d, outbound: outboundGate(config, d.reply).outbound });
  return Object.freeze({
    config,
    async handleMessage(session, message, deps) {
      if (!config.enabled) return suppressed(config);
      return wrap(config.understanding === 'hybrid_shadow'
        ? await processHybrid(session, message, deps, { provider, ...hybridOptions })
        : await processMessage(session, message, deps));
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
