/**
 * Memoria conversacional. Regla fundamental: lo que el huesped ya dijo no se
 * vuelve a preguntar. Los valores nuevos reemplazan a los viejos y el cambio
 * queda registrado (para re-consultar Odoo).
 */
import { addDays, diffDays } from './nlu.mjs';

export const CONTEXT_FIELDS = Object.freeze([
  'fecha_in', 'fecha_out', 'noches', 'adultos', 'ninos', 'edades_ninos', 'total_personas', 'propiedad', 'unidad',
  'bano_preferencia', 'vehiculo', 'mascota', 'presupuesto', 'canal', 'nombre', 'reserva_existente',
  'precio_cotizado', 'anticipo', 'saldo', 'idioma', 'ultima_intencion', 'datos_faltantes',
]);

export function createContext() {
  const ctx = Object.fromEntries(CONTEXT_FIELDS.map((f) => [f, null]));
  ctx.idioma = 'es';
  ctx.datos_faltantes = [];
  return { ...ctx, classification: null, greeted: false, noches_assumed: false, group_tier: null };
}

/** Campos que, al cambiar, invalidan la cotizacion/disponibilidad previa. */
const QUOTE_FIELDS = ['fecha_in', 'fecha_out', 'noches', 'total_personas', 'propiedad'];

export function mergeEntities(ctx, entities) {
  const next = { ...ctx };
  const changes = [];
  for (const [field, value] of Object.entries(entities)) {
    if (value === undefined || value === null || !(field in next)) continue;
    const before = next[field];
    if (JSON.stringify(before) === JSON.stringify(value)) continue;
    next[field] = value;
    if (before !== null) changes.push({ field, from: before, to: value });
  }
  // coherencia fechas/noches: lo ultimo que dijo el huesped manda
  if ('fecha_out' in entities && entities.fecha_out && next.fecha_in && !('noches' in entities)) {
    next.noches = diffDays(next.fecha_in, next.fecha_out);
  } else if (next.fecha_in && next.noches && !(entities.fecha_out)) {
    next.fecha_out = addDays(next.fecha_in, next.noches);
  }
  if (next.fecha_in && next.fecha_out && next.fecha_out <= next.fecha_in) {
    next.fecha_out = null;
    next.noches = entities.noches ?? null;
  }
  if (next.adultos != null && next.total_personas == null) next.total_personas = next.adultos + (next.ninos ?? 0);
  if (entities.adultos != null && entities.total_personas == null) next.total_personas = entities.adultos + (next.ninos ?? 0);
  const invalidates = changes.some((c) => QUOTE_FIELDS.includes(c.field));
  if (invalidates) {
    next.precio_cotizado = null;
    next.anticipo = null;
    next.saldo = null;
  }
  return { context: next, changes, invalidates };
}

export function computeMissing(ctx) {
  const missing = [];
  if (!ctx.fecha_in) missing.push('fecha_in');
  if (!ctx.total_personas) missing.push('total_personas');
  return missing;
}

/** Copia sin PII para evidencia. */
export function sanitizeContext(ctx) {
  const c = { ...ctx };
  if (c.nombre) c.nombre = '[NOMBRE]';
  return c;
}
