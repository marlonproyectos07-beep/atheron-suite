// ATH-STAGING-RECOVERY-007 — QA SINTÉTICO (paso 9) y LIMPIEZA (paso 10). Solo para el staging NUEVO, tras R1–R7 verificados.
// Crea reservas FICTICIAS (cliente «QA-RECOVERY-…», excluidas de todo KPI por el modelo del tablero) y comprueba que las reglas
// de disponibilidad responden como se espera. Lo que ocurre dentro de Odoo (automatizaciones, bloqueos) SOLO puede verificarse
// contra Odoo Enterprise 19 real: aquí se prueba la mecánica (precondiciones, bitácora, limpieza), no la regla de negocio.
// Precondición dura: la automatización anti-solapamiento (equivalente a la guardia 189) debe existir ACTIVA.
import { READ_CTX, WRITE_CTX, BlockedError } from './recovery-lib.mjs';
import { requireOverlapGuard } from './guard.mjs';
import { findOne } from './connect.mjs';

export const QA_PREFIX = 'QA-RECOVERY-';

/** Escenarios: unidad, resultado esperado y por qué. `expect:'ok'` = debe crearse; `expect:'fail'` = Odoo debe rechazarla. */
export const SCENARIOS = Object.freeze([
  { id: 'Q1', unit: '301', expect: 'ok', why: 'reserva base en 301 una noche' },
  { id: 'Q2', unit: '301', expect: 'fail', why: 'misma unidad y noche: anti-solapamiento' },
  { id: 'Q3', unit: 'CASA COMPLETA', expect: 'fail', why: 'Casa Completa no puede reservarse si una habitación ya está ocupada esa noche' },
  { id: 'Q4', unit: '201', expect: 'ok', why: 'otra habitación la misma noche no se ve afectada' },
]);

const trim = (e) => String(e?.diagnostic?.message || e?.message || e).slice(0, 160);

export async function runQA(ctx, { date }) {
  const { ex, write, journal, log } = ctx;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new BlockedError('indica la fecha de QA (YYYY-MM-DD), lejana y sin reservas reales');
  const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); const out = next.toISOString().slice(0, 10);
  const guard = await requireOverlapGuard(ex);
  if (!guard.ok) throw new BlockedError(`la guardia anti-solapamiento no está activa (${guard.detail}); no se crea ninguna reserva de QA`);
  const need = ['x_hotel_unit_id', 'x_checkin', 'x_checkout', 'x_reservation_status'];
  const have = new Set((await ex('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', 'in', need]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
  if (need.some((n) => !have.has(n))) throw new BlockedError('faltan campos de sale.order (R2)');

  const results = [];
  let partner = null;
  if (write) {
    const name = `${QA_PREFIX}${Date.now()}`;
    const intent = journal.append({ op: 'INTENT', layer: 'QA', model: 'res.partner', key: name, domain: [['name', '=', name]] });
    partner = await ex('res.partner', 'create', [{ name }], { context: WRITE_CTX });
    journal.append({ op: 'CREATE', layer: 'QA', model: 'res.partner', key: name, id: partner, ref: intent.seq });
  }
  for (const s of SCENARIOS) {
    const unitId = await findOne(ex, 'x_hotel_unit', [['x_name', '=', s.unit]]);
    if (!unitId) { results.push({ ...s, got: 'sin unidad', ok: false }); continue; }
    if (!write) { results.push({ ...s, got: 'dry-run', ok: null }); log.add('QA?', 'sale.order', `${s.id} ${s.unit} ${date}`); continue; }
    const key = `${s.id} ${s.unit} ${date}`;
    const intent = journal.append({ op: 'INTENT', layer: 'QA', model: 'sale.order', key, domain: [['partner_id', '=', partner], ['x_hotel_unit_id', '=', unitId]] });
    let got = 'ok'; let id = null;
    try { id = await ex('sale.order', 'create', [{ partner_id: partner, x_hotel_unit_id: unitId, x_checkin: date, x_checkout: out, x_reservation_status: 'confirmed' }], { context: WRITE_CTX }); }
    catch (e) { got = 'fail'; log.add('QA-RECHAZO', 'sale.order', key, { note: trim(e) }); }
    if (id) journal.append({ op: 'CREATE', layer: 'QA', model: 'sale.order', key, id, ref: intent.seq });
    results.push({ ...s, got, ok: got === s.expect });
  }
  return { date, guard, results, ok: write ? results.every((r) => r.ok) : null };
}

/** Limpieza: deshace lo creado por QA. Si Odoo no deja borrar una orden confirmada, la deja CANCELADA y la reporta (residuo etiquetado QA). */
export async function cleanupQA(ctx, rollbackFn) {
  const res = await rollbackFn({ ex: ctx.ex, write: ctx.write, journal: ctx.journal, log: ctx.log, layer: 'QA' });
  const residue = [];
  if (ctx.write && res.ERROR) {
    for (const e of ctx.journal.pending({ layer: 'QA' }).filter((x) => x.model === 'sale.order' && x.op === 'CREATE')) {
      try { await ctx.ex('sale.order', 'write', [[e.id], { x_reservation_status: 'cancelled' }], { context: WRITE_CTX }); residue.push(e.key); } catch { residue.push(`${e.key} (no se pudo cancelar)`); }
    }
  }
  return { ...res, residue };
}
