import { parseReferences } from './reference-parse.mjs';

/**
 * ATH-DEV-130 — BLOQUEO PERSISTENTE DE ESCRITURA (pestillo) tras un fallo.
 *
 * Si la sincronizacion programada falla, el job `apagado` del workflow abre una incidencia de GitHub titulada
 * `BLOQUEO-ESCRITURA-SYNC ...` (autor: github-actions[bot]). Mientras exista una incidencia de bloqueo con numero MAYOR que
 * el reconocido por gerencia en la variable `SYNC_DESBLOQUEO` (`DESBLOQUEO-<numero>`), la sincronizacion corre SIEMPRE EN
 * SOMBRA: sigue leyendo, avisando y mostrando el tablero, pero no puede crear pedidos.
 *  - Ni reiniciar, ni relanzar, ni la ejecucion programada, ni SYNC_ENABLED/SYNC_KILL/SYNC_MAX_OPS/SYNC_ARM quitan el
 *    bloqueo: solo lo quita `SYNC_DESBLOQUEO`, cuya edicion exige la confirmacion de acceso (2FA) de gerencia.
 *  - Cerrar o editar la incidencia NO desbloquea. Solo cuentan las incidencias del bot (nadie puede falsificar un desbloqueo;
 *    una incidencia de otra persona no desbloquea nada).
 *  - Si no se puede comprobar (sin token, error de red, respuesta rara o lista truncada): se trata como BLOQUEADO.
 * Segundo cerrojo, en Odoo (no depende de GitHub): `auditSyncWrites` detecta restos de una escritura parcial (contacto
 * SMOOBU-<id> sin pedido) o duplicados entre los pedidos creados por la sincronizacion; mientras existan, no se escribe.
 */
export const LATCH_TITLE = 'BLOQUEO-ESCRITURA-SYNC';
export const LATCH_CREATOR = 'github-actions[bot]';
export const LATCH_PAGE = 100;
export const ackFrom = (v) => { const m = /^DESBLOQUEO-(\d{1,9})$/.exec(String(v ?? '').trim()); return m ? Number(m[1]) : 0; };

export async function readWriteLatch({ repo, token, ack, fetchImpl = globalThis.fetch } = {}) {
  const closed = (reason) => ({ latched: true, reason, pending: [], ack: ackFrom(ack) });
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return closed('BLOQUEO_NO_VERIFICABLE');
  let rows;
  try {
    const url = `https://api.github.com/repos/${repo}/issues?state=all&creator=${encodeURIComponent(LATCH_CREATOR)}&per_page=${LATCH_PAGE}`;
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return closed('BLOQUEO_NO_VERIFICABLE');
    rows = await res.json();
  } catch { return closed('BLOQUEO_NO_VERIFICABLE'); }
  if (!Array.isArray(rows) || rows.length >= LATCH_PAGE) return closed('BLOQUEO_NO_VERIFICABLE');
  const latches = rows.filter((i) => !i.pull_request && i.user?.login === LATCH_CREATOR && String(i.title ?? '').startsWith(LATCH_TITLE)).map((i) => Number(i.number)).filter(Number.isInteger);
  const pending = latches.filter((n) => n > ackFrom(ack)).sort((a, b) => a - b);
  return { latched: pending.length > 0, reason: pending.length ? 'BLOQUEO_POR_FALLO_ANTERIOR' : null, pending, ack: ackFrom(ack) };
}

/* ---------------- cerrojo en Odoo: restos de escrituras parciales o duplicadas ---------------- */

export const AUDIT_LIMIT = 2000;
const NOTE_DOMAIN = [['model', '=', 'sale.order'], ['message_type', '=', 'comment'], ['body', 'ilike', 'ATH-SYNC | clave'], ['body', 'ilike', '| CREATE_ORDER']];
const SMOOBU_REF = /^SMOOBU-(\d+)$/;

/** Solo lecturas. Devuelve { ok, problems: [{ code, smoobuId }] }; si una lectura sale truncada, falla cerrado. */
export async function auditSyncWrites(reader) {
  const read = async (model, domain, fields) => {
    const rows = await reader.searchRead(model, domain, fields, { limit: AUDIT_LIMIT });
    if (!Array.isArray(rows) || rows.length >= AUDIT_LIMIT) return null;
    return rows;
  };
  const partners = await read('res.partner', [['ref', '=ilike', 'SMOOBU-%']], ['id', 'ref']);
  const orders = await read('sale.order', [['x_pms_reference', 'ilike', 'SMOOBU-']], ['id', 'state', 'x_pms_reference']);
  const notes = await read('mail.message', NOTE_DOMAIN, ['res_id']);
  if (!partners || !orders || !notes) return { ok: false, problems: [{ code: 'AUDITORIA_NO_VERIFICABLE', smoobuId: null }] };
  const active = new Map(); // smoobuId -> pedidos no cancelados que lo referencian
  for (const o of orders) {
    if (o.state === 'cancel') continue;
    for (const id of parseReferences(o.x_pms_reference).smoobu) active.set(id, [...(active.get(id) ?? []), o.id]);
  }
  const problems = [];
  // contacto creado por la sincronizacion (ref SMOOBU-<id>) sin ningun pedido: escritura parcial
  for (const p of partners) {
    const m = SMOOBU_REF.exec(String(p.ref ?? '').trim()); if (!m) continue;
    const anyOrder = orders.some((o) => parseReferences(o.x_pms_reference).smoobu.includes(m[1]));
    if (!anyOrder) problems.push({ code: 'CONTACTO_SIN_PEDIDO', smoobuId: Number(m[1]) });
  }
  // pedidos creados por la sincronizacion: su reserva debe tener UN solo pedido vigente
  const created = new Set(notes.map((n) => n.res_id));
  for (const o of orders) {
    if (!created.has(o.id)) continue;
    for (const id of parseReferences(o.x_pms_reference).smoobu) if ((active.get(id) ?? []).length > 1) problems.push({ code: 'PEDIDO_DUPLICADO', smoobuId: Number(id) });
  }
  const seen = new Set();
  const uniq = problems.filter((p) => { const k = `${p.code}:${p.smoobuId}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ok: uniq.length === 0, problems: uniq };
}
