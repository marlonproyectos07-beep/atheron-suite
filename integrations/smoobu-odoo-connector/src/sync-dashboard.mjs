import { ConnectorError } from './errors.mjs';
import { STATUS } from './sync-intent.mjs';
import { maskSmoobu } from './public-report.mjs';

/**
 * ATH-DEV-120 — Tablero del modo semiautomatico. PUBLICO (repositorio publico): solo IDs enmascarados, habitacion,
 * fechas, codigos y CONTEOS. Nunca nombres, importes ni datos de pagos mas alla de su referencia interna y estado.
 */
export const PAYMENT_PENDING_STATES = Object.freeze(['draft', 'in_process']);

/** Pagos registrados en Odoo que aun no estan confirmados (solo lectura). */
export async function readPendingPayments(odoo, { companyId = 5, limit = 200 } = {}) {
  const rows = await odoo.searchRead('account.payment', [['state', 'in', PAYMENT_PENDING_STATES], ['company_id', '=', companyId]], ['id', 'name', 'date', 'state'], { limit, order: 'date desc' });
  if (!Array.isArray(rows)) throw new ConnectorError('ODOO_RESPONSE_INVALID');
  if (rows.length >= limit) throw new ConnectorError('ODOO_PAYMENT_LIMIT');
  return rows;
}

export function buildDashboard({ report, plan, run = null, pendingPayments = [] }) {
  const per = report.perReservation ?? [];
  const row = (r) => ({ ref: maskSmoobu(r.smoobuId), unit: r.unit, arrival: r.arrival, departure: r.departure });
  const ops = plan.ops ?? [];
  return {
    received: per.filter((r) => r.smoobuStatus === 'ACTIVE').length,
    drafts: {
      existing: per.filter((r) => r.verdict === 'MATCH_DRAFT').map(row),
      toCreate: ops.filter((o) => o.op === 'CREATE_ORDER' && o.status !== STATUS.BLOQUEADO).map((o) => ({ ...row(o), status: o.status })),
    },
    approvalsPending: (run?.approvalsPending ?? ops.filter((o) => o.status === STATUS.REQUIERE_APROBACION).map((o) => ({ ...row(o), op: o.op, guards: o.guards }))),
    conflicts: [
      ...per.filter((r) => r.verdict === 'CONFLICT' || r.verdict === 'AMBIGUOUS').map((r) => ({ ...row(r), reason: r.reason })),
      ...ops.filter((o) => o.status === STATUS.BLOQUEADO).map((o) => ({ ...row(o), reason: o.guards.join(',') })),
    ],
    paymentsReportedNotConfirmed: pendingPayments.map((p) => ({ ref: p.name, date: p.date, state: p.state })),
    run: run ? { halted: run.halted ?? null, results: (run.results ?? []).map((x) => ({ ...row(x), op: x.op, result: x.result, code: x.code ?? null })), writes: run.writes ?? 0 } : null,
  };
}

export function renderDashboard(d, { title = 'Tablero semiautomatico Smoobu -> Odoo' } = {}) {
  const t = (head, rows) => (rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)] : ['(ninguno)']);
  return [
    `## ${title}`, '',
    `Reservas vigentes recibidas: **${d.received}** | Borradores existentes: **${d.drafts.existing.length}** | Por crear: **${d.drafts.toCreate.length}** | Aprobaciones pendientes: **${d.approvalsPending.length}** | Conflictos: **${d.conflicts.length}** | Pagos sin confirmar: **${d.paymentsReportedNotConfirmed.length}**`, '',
    '### Borradores por crear', ...t(['Reserva', 'Hab.', 'Llegada', 'Salida', 'Estado'], d.drafts.toCreate.map((r) => [r.ref, r.unit, r.arrival, r.departure, r.status])), '',
    '### Aprobaciones pendientes', ...t(['Reserva', 'Operacion', 'Hab.', 'Llegada', 'Motivo', 'Token para aprobar'], d.approvalsPending.map((r) => [r.ref, r.op, r.unit, r.arrival, (r.guards ?? []).join(', '), r.token ? `\`${r.token}\`` : ''])), '',
    '### Conflictos y bloqueos', ...t(['Reserva', 'Hab.', 'Llegada', 'Motivo'], d.conflicts.map((r) => [r.ref, r.unit, r.arrival, r.reason])), '',
    '### Pagos registrados sin confirmar', ...t(['Pago', 'Fecha', 'Estado'], d.paymentsReportedNotConfirmed.map((p) => [p.ref, p.date, p.state])), '',
    ...(d.run ? ['### Ejecucion', `Parada: ${d.run.halted ?? 'ninguna'} | Escrituras: ${d.run.writes}`, ...t(['Reserva', 'Operacion', 'Resultado', 'Codigo'], d.run.results.map((r) => [r.ref, r.op, r.result, r.code ?? '']))] : []),
    '',
  ].join('\n');
}
