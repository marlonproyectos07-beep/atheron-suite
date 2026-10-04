/**
 * GOAL-WHATSAPP-CANONICAL-002 -- configuracion y kill switch.
 *
 * Portado a mano (solo el concepto) desde la implementacion de referencia
 * 4935d59; no es un cherry-pick. Los cuatro modos existen en la arquitectura,
 * pero SOLO `shadow` esta autorizado. Cualquier otro valor falla cerrado.
 *
 *   WHATSAPP_AUTOMATION_ENABLED  kill switch; por defecto `false`.
 *   WHATSAPP_AUTOMATION_MODE     por defecto `shadow`; solo `shadow` habilitado.
 *   WHATSAPP_COMMERCIAL_CAPTURE  por defecto `off`; `shadow` adjunta `decision.commercial` (sin escribir en Odoo).
 *   WHATSAPP_UNDERSTANDING_MODE  por defecto `rules`; `hybrid_shadow` requiere un proveedor inyectado (hoy solo mock).
 *
 * Sin secretos: aqui solo hay banderas.
 */

export const MODES = Object.freeze(['shadow', 'supervised', 'auto_offhours', 'auto']);
export const ENABLED_MODES = Object.freeze(['shadow']);
/** Motor de comprension. `rules` por defecto; `hybrid_shadow` existe pero NO se activa por defecto. */
export const UNDERSTANDING_MODES = Object.freeze(['rules', 'hybrid_shadow']);
/** Captura comercial (lead estructurado + payload Odoo DRY_RUN). `off` por defecto; `shadow` solo adjunta el objeto, nunca escribe ni envia. */
export const COMMERCIAL_CAPTURE_MODES = Object.freeze(['off', 'shadow']);

export class ConfigError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export function resolveConfig(env = process.env) {
  const mode = (env.WHATSAPP_AUTOMATION_MODE ?? 'shadow').trim();
  if (!MODES.includes(mode)) throw new ConfigError('UNKNOWN_MODE', `WHATSAPP_AUTOMATION_MODE desconocido: ${mode}`);
  if (!ENABLED_MODES.includes(mode)) {
    throw new ConfigError('MODE_NOT_ENABLED', `el modo "${mode}" existe pero NO esta autorizado en esta version (solo shadow)`);
  }
  const enabled = String(env.WHATSAPP_AUTOMATION_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  const understanding = (env.WHATSAPP_UNDERSTANDING_MODE ?? 'rules').trim();
  if (!UNDERSTANDING_MODES.includes(understanding)) throw new ConfigError('UNKNOWN_UNDERSTANDING_MODE', `WHATSAPP_UNDERSTANDING_MODE desconocido: ${understanding}`);
  const commercial_capture = (env.WHATSAPP_COMMERCIAL_CAPTURE ?? 'off').trim();
  if (!COMMERCIAL_CAPTURE_MODES.includes(commercial_capture)) throw new ConfigError('UNKNOWN_COMMERCIAL_CAPTURE', `WHATSAPP_COMMERCIAL_CAPTURE desconocido: ${commercial_capture}`);
  return Object.freeze({ mode, enabled, understanding, commercial_capture });
}

/**
 * Compuerta unica de salida. En shadow NUNCA sale nada, este o no activado el
 * kill switch; con el kill switch en `false` tampoco hay analisis.
 */
export function outboundGate(config, _proposal = null) {
  if (!config?.enabled) return Object.freeze({ allowed: false, reason: 'KILL_SWITCH_OFF', outbound: null });
  if (config.mode !== 'shadow') return Object.freeze({ allowed: false, reason: 'MODE_NOT_AUTHORIZED', outbound: null });
  return Object.freeze({ allowed: false, reason: 'SHADOW_NEVER_SENDS', outbound: null });
}
