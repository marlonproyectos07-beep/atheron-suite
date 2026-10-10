// R5 — reserva directa: las 24 acciones «HOTEL v1 — …» (CONFIRMAR, HOLD, CHECKIN…, cotizar, motor tarifario, motor de inventario,
// precio congelado, capacidad extra, vencer HOLDs). El código sale del respaldo del repo (ir-actions-server-hotel.json) y se copia
// TAL CUAL (SHA-256 verificado). Se excluyen las «ROLLBACK COPY …». Este paso crea SOLO las acciones; las automatizaciones que las
// disparan (p. ej. anti-doble-reserva) llegan en R4 con el dump y se crean inactivas.
import { readBackup, sha256, findOldIdLiterals, fieldTokens, tryExtract, EXTRACT_DIR, READ_CTX } from '../recovery-lib.mjs';
import { txt } from '../pure.mjs';
import { adaptActionRefs, hardcodedIds, classifyOta } from '../scope.mjs';
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

/**
 * Plan de las 24 acciones. El código se copia del respaldo, con UNA adaptación mecánica: las llamadas a otras acciones por id numérico
 * del staging viejo (`browse(1914)`…) pasan a búsqueda por nombre+modelo (ver scope.adaptActionRefs). `sha` es la huella del código
 * YA ADAPTADO (lo que se instala y se verifica); `sha_original` la del respaldo. Lo que aún tenga ids duros, o sea OTA, no se crea.
 */
export function plan(extractDir = null) {
  const all = readBackup('ir-actions-server-hotel.json');
  const byId = new Map(all.map((a) => [a.id, a]));
  // ATH-020: si el volcado del 7-oct (extracto/cierre) trae la MISMA acción (nombre + modelo), su código manda: es posterior al respaldo del 30-sep y R4 instala esa misma
  // versión. Sin esto, R4 y R5 crearían la misma acción con dos códigos distintos y R5 quedaría en DIFF. Lo que el volcado no trae sale del respaldo, como antes.
  const dump = new Map((extractDir ? (tryExtract('server_actions.json', extractDir) ?? []) : []).filter((a) => a.model && a.code != null).map((a) => [`${a.model}::${txt(a.name)}`, a]));
  const resolve = (id) => { const a = byId.get(id); return a && a.name.startsWith('HOTEL v1 —') && MODEL_BY_DISPLAY[a.model_id?.[1]] ? { name: a.name, model: MODEL_BY_DISPLAY[a.model_id[1]] } : null; };
  return all.filter((a) => a.name.startsWith('HOTEL v1 —') && !a.name.startsWith('ROLLBACK COPY')).map((a) => {
    const model = MODEL_BY_DISPLAY[a.model_id?.[1]] ?? null; const d = model ? dump.get(`${model}::${a.name}`) : null; const src = d ? d.code : a.code;
    const ad = adaptActionRefs(src, resolve);
    return {
      name: a.name, model, state: a.state, code: ad.code, sha: sha256(ad.code), sha_original: sha256(src), source: d ? 'dump' : 'respaldo',
      adapted: ad.adapted, old_ids: findOldIdLiterals(ad.code), hard_ids: hardcodedIds(ad.code), ota: classifyOta({ name: a.name, model, code: ad.code }),
      tokens: fieldTokens(ad.code), display_model: a.model_id?.[1],
    };
  });
}

export const inputs = (ctx) => { plan(ctx?.extractDir ?? EXTRACT_DIR); };

export async function run(ctx) {
  const { ex, ensure, log } = ctx;
  for (const a of plan(ctx.extractDir ?? EXTRACT_DIR)) {
    if (!a.model) { log.add('BLOQUEA', 'ir.actions.server', a.name, { note: `modelo "${a.display_model}" sin correspondencia técnica` }); continue; }
    const mid = await findOne(ex, 'ir.model', [['model', '=', a.model]]);
    if (!mid) { log.add('FALTA', 'ir.model', a.model, { note: `para "${a.name}" (R1)` }); continue; }
    if (a.ota.ota) { log.add('EXCLUYE_OTA', 'ir.actions.server', a.name, { note: a.ota.reasons.join('; ') }); continue; }
    if (a.hard_ids.length) { log.add('ID_DURO', 'ir.actions.server', a.name, { note: `ids numéricos escritos a mano tras la adaptación: ${a.hard_ids.slice(0, 6).join(',')}` }); continue; }
    if (a.adapted.length) log.add('ADAPTA', 'ir.actions.server', a.name, { note: `referencias por id → por nombre: ${a.adapted.map((x) => `${x.id}→«${x.name}»`).join(' · ')}` });
    if (a.old_ids.length) log.add('REVISAR', 'ir.actions.server', a.name, { note: `números iguales a ids del staging viejo: ${a.old_ids.join(',')}` });
    await ensure('ir.actions.server', [['name', '=', a.name], ['model_id', '=', mid]], { name: a.name, model_id: mid, state: a.state || 'code', code: a.code }, `${a.name} [sha ${a.sha.slice(0, 8)}]`, { compareFields: ['code', 'state'] });
  }
}

export async function verify(ctx) {
  const checks = [];
  for (const a of plan(ctx.extractDir ?? EXTRACT_DIR)) {
    if (!a.model) { checks.push({ name: a.name, ok: false, blocked: true }); continue; }
    if (a.ota.ota || a.hard_ids.length) { checks.push({ name: `${a.name} (${a.ota.ota ? 'OTA' : 'ids duros'})`, ok: false, blocked: true }); continue; }
    const mid = await findOne(ctx.ex, 'ir.model', [['model', '=', a.model]]);
    const r = mid ? await ctx.ex('ir.actions.server', 'search_read', [[['name', '=', a.name], ['model_id', '=', mid]]], { fields: ['code'], limit: 2, context: READ_CTX }) : [];
    checks.push({ name: a.name, ok: r.length === 1 && sha256(r[0].code) === a.sha });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
