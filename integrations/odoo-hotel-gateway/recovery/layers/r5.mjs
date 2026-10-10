// R5 — reserva directa: las 24 acciones «HOTEL v1 — …» (CONFIRMAR, HOLD, CHECKIN…, cotizar, motor tarifario, motor de inventario,
// precio congelado, capacidad extra, vencer HOLDs). El código sale del respaldo del repo (ir-actions-server-hotel.json) y se copia
// TAL CUAL (SHA-256 verificado). Se excluyen las «ROLLBACK COPY …». Este paso crea SOLO las acciones; las automatizaciones que las
// disparan (p. ej. anti-doble-reserva) llegan en R4 con el dump y se crean inactivas.
import { readBackup, sha256, findOldIdLiterals, fieldTokens, READ_CTX } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';

export const meta = { id: 'R5', title: 'Acciones de reserva directa (HOTEL v1)', critical: true, needs: 'R1 + R2 aplicados (modelos y campos que el código usa)' };

// Nombre mostrado en el respaldo -> modelo técnico. Evidencia: acciones de ventana 1910/1911/1913 (res_model) y el campo
// sale.order.x_hotel_quote_id (relation x_hotel_quote). Si el destino no tiene el modelo, la acción se omite con aviso.
export const MODEL_BY_DISPLAY = Object.freeze({
  'Sales Order': 'sale.order',
  'Hotel v1 — Propiedad': 'x_hotel_property',
  'Hotel v1 — Tarifa': 'x_hotel_rate',
  'Hotel v1 — Cotización (registro auditable)': 'x_hotel_quote',
});

export function plan() {
  const acts = readBackup('ir-actions-server-hotel.json').filter((a) => a.name.startsWith('HOTEL v1 —') && !a.name.startsWith('ROLLBACK COPY'));
  return acts.map((a) => ({
    name: a.name, model: MODEL_BY_DISPLAY[a.model_id?.[1]] ?? null, state: a.state, code: a.code, sha: sha256(a.code),
    old_ids: findOldIdLiterals(a.code), tokens: fieldTokens(a.code), display_model: a.model_id?.[1],
  }));
}

export const inputs = () => { plan(); };

export async function run(ctx) {
  const { ex, ensure, log } = ctx;
  for (const a of plan()) {
    if (!a.model) { log.add('BLOQUEA', 'ir.actions.server', a.name, { note: `modelo "${a.display_model}" sin correspondencia técnica` }); continue; }
    const mid = await findOne(ex, 'ir.model', [['model', '=', a.model]]);
    if (!mid) { log.add('FALTA', 'ir.model', a.model, { note: `para "${a.name}" (R1)` }); continue; }
    if (a.old_ids.length) log.add('REVISAR', 'ir.actions.server', a.name, { note: `números iguales a ids del staging viejo: ${a.old_ids.join(',')}` });
    await ensure('ir.actions.server', [['name', '=', a.name], ['model_id', '=', mid]], { name: a.name, model_id: mid, state: a.state || 'code', code: a.code }, `${a.name} [sha ${a.sha.slice(0, 8)}]`, { compareFields: ['code', 'state'] });
  }
}

export async function verify(ctx) {
  const checks = [];
  for (const a of plan()) {
    if (!a.model) { checks.push({ name: a.name, ok: false, blocked: true }); continue; }
    const mid = await findOne(ctx.ex, 'ir.model', [['model', '=', a.model]]);
    const r = mid ? await ctx.ex('ir.actions.server', 'search_read', [[['name', '=', a.name], ['model_id', '=', mid]]], { fields: ['code'], limit: 2, context: READ_CTX }) : [];
    checks.push({ name: a.name, ok: r.length === 1 && sha256(r[0].code) === a.sha });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
