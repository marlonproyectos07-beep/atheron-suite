/**
 * Candidatos a proveedor SOLO COMO CONFIGURACION. Todos DISABLED: sin claves, sin red, sin gasto.
 * Habilitar uno requiere autorizacion explicita de Control Maestro (y una implementacion que hoy no existe).
 * Precios: DATA_GAP hasta tener una tarifa real aportada por Control Maestro; nunca se inventan.
 */
export const PRICING_GAP = Object.freeze({ status: 'DATA_GAP', input_per_mtok: null, output_per_mtok: null, source: null });

const entry = (kind) => Object.freeze({ kind, enabled: false, status: 'DISABLED', credentials_configured: false, pricing: PRICING_GAP });

export const PROVIDER_CONFIG = Object.freeze({
  OPENAI: entry('external'),
  ANTHROPIC: entry('external'),
  GEMINI: entry('external'),
  LOCAL_OLLAMA: entry('local'),
  OTHER: entry('external'),
});

export const PROVIDER_NAMES = Object.freeze(Object.keys(PROVIDER_CONFIG));

/** Por diseno siempre false en esta fase. */
export const isProviderEnabled = (name) => PROVIDER_CONFIG[String(name).toUpperCase()]?.enabled === true;

/** Tarifa valida solo si Control Maestro la aporta con su fuente; en cualquier otro caso el costo es DATA_GAP. */
export function pricingOrGap(p) {
  if (p && Number.isFinite(p.input_per_mtok) && Number.isFinite(p.output_per_mtok) && p.input_per_mtok >= 0 && p.output_per_mtok >= 0 && typeof p.source === 'string' && p.source.trim().length >= 5) return p;
  return PRICING_GAP;
}
