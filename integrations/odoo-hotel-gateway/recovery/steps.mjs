// ATH-STAGING-RECOVERY-007 — ejecución de una capa con las reglas del runbook: guardia -> prerrequisitos verificados -> run -> verify.
// Nunca continúa tras una verificación fallida: devuelve STOP con el motivo. Sin efectos al importar.
import * as r1 from './layers/r1.mjs'; import * as r2 from './layers/r2.mjs'; import * as r3 from './layers/r3.mjs'; import * as r4 from './layers/r4.mjs';
import * as r5 from './layers/r5.mjs'; import * as r6 from './layers/r6.mjs'; import * as r7 from './layers/r7.mjs';
import { BlockedError } from './recovery-lib.mjs';
import { runGuard } from './guard.mjs';

export const LAYERS = Object.freeze({ R1: r1, R2: r2, R3: r3, R4: r4, R5: r5, R6: r6, R7: r7 });
export const ORDER = Object.freeze(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
// DIFF = lo preexistente no coincide con lo esperado: una persona decide (aceptar o --force-diff). Nunca se avanza en silencio.
const BLOCKING_ACTIONS = new Set(['BLOQUEA', 'FALTA', 'OMITE', 'DEP_FALTA', 'AMBIGUO', 'ERROR', 'DIFF']);

/** Verificación de solo lectura de una capa; un BlockedError (p. ej. falta el extracto) cuenta como NO verificada. */
export async function verifyLayer(ctx, name) {
  try { const v = await LAYERS[name].verify(ctx); return { layer: name, ...v, error: null }; }
  catch (e) { if (e instanceof BlockedError) return { layer: name, ok: false, checks: [], error: e.message }; throw e; }
}

/**
 * Corre UNA capa. Orden: (1) guardia, (2) todas las capas anteriores deben verificar OK (solo lectura), (3) run,
 * (4) verify de la capa (solo con --apply). Devuelve {status, ...}; status ∈ OK | DRY_RUN | PARTIAL | BLOCKED | STOP_GUARD | STOP_PREREQ.
 */
export async function executeLayer(ctx, name, { skipGuard = false } = {}) {
  if (!LAYERS[name]) throw new Error(`capa desconocida: ${name}`);
  if (!skipGuard) {
    const g = await runGuard({ ex: ctx.ex, cfg: ctx.cfg, env: ctx.env, journal: ctx.journal });
    if (!g.ok) return { status: 'STOP_GUARD', guard: g };
  }
  const prev = ORDER.slice(0, ORDER.indexOf(name));
  if (ctx.write) {
    for (const p of prev) {
      const v = await verifyLayer(ctx, p);
      if (!v.ok) return { status: 'STOP_PREREQ', layer: p, detail: v.error ?? v.checks.filter((c) => !c.ok).map((c) => c.name).slice(0, 8) };
    }
  }
  try { await LAYERS[name].run(ctx); } catch (e) { if (e instanceof BlockedError) return { status: 'BLOCKED', message: e.message, log: ctx.log.entries }; throw e; }
  const blockers = ctx.log.entries.filter((e) => BLOCKING_ACTIONS.has(e.action));
  if (!ctx.write) return { status: 'DRY_RUN', blockers, log: ctx.log.entries };
  const verify = await verifyLayer(ctx, name);
  const status = verify.ok && blockers.length === 0 ? 'OK' : 'PARTIAL';
  return { status, verify, blockers, log: ctx.log.entries };
}
