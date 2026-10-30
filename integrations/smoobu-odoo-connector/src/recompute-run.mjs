import { createHash } from 'node:crypto';
import { runRecomputePrecheck, evaluateGates, EXPECTED_PENDING_IDS } from './recompute-precheck.mjs';
import { GONE_IDS, OFFER_301, NIGHT } from './recovery-check.mjs';

/**
 * ATH-DEV-020 FASE 3 (condicional). Reevalua TODAS las puertas justo antes; si falta una, DETIENE SIN ESCRIBIR.
 * Una unica ejecucion de la accion 1493 (writer.runUpdateAvailabilitiesOnce). Despues verifica y no reintenta.
 */
const sha = (t) => createHash('sha256').update(JSON.stringify(t)).digest('hex').slice(0, 16);

export async function snapshot(reader) {
  const rows = await reader.searchRead('x_availability', [['x_active', 'in', [true, false]]], ['id', 'x_booked', 'x_total_units', 'x_to_recompute'], { order: 'id' });
  const others = rows.filter((r) => !EXPECTED_PENDING_IDS.includes(r.id)).map((r) => [r.id, r.x_booked, r.x_total_units, Boolean(r.x_to_recompute)]);
  const target = rows.filter((r) => EXPECTED_PENDING_IDS.includes(r.id)).map((r) => ({ id: r.id, booked: r.x_booked, total: r.x_total_units, pending: Boolean(r.x_to_recompute) }));
  const counts = {};
  for (const [k, m] of Object.entries({ saleOrders: 'sale.order', partners: 'res.partner', mailMail: 'mail.mail', slots: 'planning.slot', calendarLeaves: 'resource.calendar.leaves' })) counts[k] = await reader.searchCount(m, []);
  const feeds = (await reader.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role']], ['id', 'res_id', 'file_size', 'write_date'], { order: 'id' })).map((f) => [f.id, f.res_id, f.file_size, f.write_date]);
  const gone = await reader.searchRead('planning.slot', [['id', 'in', GONE_IDS]], ['id']);
  const marker = await reader.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['index_content', 'ilike', 'ATH-DEV-018 PRUEBA P0']], ['id']);
  return { availabilityRows: rows.length, pendingTotal: rows.filter((r) => r.x_to_recompute).length, target, othersDigest: sha(others), counts, feedsDigest: sha(feeds), feedCount: feeds.length, slotsGone: gone.length === 0, icalMarkerAbsent: marker.length === 0 };
}

export async function runRecomputeExecute({ reader, writer }) {
  const report = { phase: 'ATH-DEV-020', result: null, writes: 0 };
  const pre = await runRecomputePrecheck({ odoo: reader });
  const ev = evaluateGates(pre);
  report.gates = ev.gates; report.allGatesProven = ev.allGatesProven;
  if (!pre.steps.every((s) => s.status === 'OK') || !ev.allGatesProven) { report.result = 'DETENIDO'; report.note = 'alguna puerta no demostrada: sin escrituras'; return report; }
  if (!writer) { report.result = 'DETENIDO'; report.note = 'sin autorizacion de escritura: sin escrituras'; return report; }

  report.before = await snapshot(reader);
  const t = report.before.target;
  if (!(t.length === 2 && t.every((r) => r.pending) && report.before.pendingTotal === 2)) { report.result = 'DETENIDO'; report.note = 'estado previo inesperado: sin escrituras'; return report; }

  report.writes = 1; // se cuenta antes de enviar: un fallo ambiguo no autoriza un segundo intento
  try { report.runResult = typeof (await writer.runUpdateAvailabilitiesOnce()); } catch (e) { report.runError = { code: e.code ?? e.message, httpStatus: e.status ?? null }; }

  report.after = await snapshot(reader);
  const a = report.after, b = report.before;
  const n15 = a.target.find((r) => r.id === 1171), n16 = a.target.find((r) => r.id === 1172);
  report.verification = {
    row1171BookedZeroNoPending: n15?.booked === 0 && n15?.pending === false,
    row1172BookedZeroNoPending: n16?.booked === 0 && n16?.pending === false,
    noPendingAnywhere: a.pendingTotal === 0,
    otherAvailabilityRowsUnchanged: a.othersDigest === b.othersDigest && a.availabilityRows === b.availabilityRows,
    slotsStillAbsent: a.slotsGone, icalMarkerAbsent: a.icalMarkerAbsent, feedsUnchanged: a.feedsDigest === b.feedsDigest && a.feedCount === b.feedCount,
    countsUnchanged: JSON.stringify(a.counts) === JSON.stringify(b.counts),
    night: NIGHT, offer: OFFER_301,
  };
  report.result = Object.values(report.verification).every((v) => v === true || typeof v === 'string' || typeof v === 'number') ? 'RECUPERACION_COMPLETA' : 'REQUIERE_REVISION';
  if (report.runError) report.result = 'REQUIERE_REVISION';
  return report;
}
