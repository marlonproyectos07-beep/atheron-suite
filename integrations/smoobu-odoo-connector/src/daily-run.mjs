import { runReconcileIds } from './reconcile-ids-run.mjs';
import { resolveWindow } from './window.mjs';
import { toPublicReport, sensitiveValues, assertPublicSafe } from './public-report.mjs';
import { WRITES_ENABLED } from './live-reconcile.mjs';
import { RELEASE_UNLOCKED } from './odoo-facts.mjs';

/**
 * ATH-DEV-108 — Ejecucion DIARIA de la conciliacion Smoobu -> Odoo por IDs. SOLO LECTURA.
 *
 * Reutiliza `runReconcileIds` (Smoobu: solo GET; Odoo: solo fields_get/search_read) y anade:
 *  - ventana automatica: desde HOY (fecha de Bogota, UTC-5) durante `days` noches (1..120);
 *  - resumen diario ENMASCARADO (solo lo que ya trae el informe publico: IDs con 4 digitos, habitacion, fechas, codigos);
 *  - fallo seguro: credenciales rechazadas, API incompleta, paginacion defectuosa o red -> codigo de salida distinto de 0
 *    y categoria explicita, sin detalle de negocio;
 *  - barrera de privacidad sobre TODO lo que se imprime (informe y resumen).
 * Nunca escribe: ni el cliente de Odoo ni el de Smoobu exponen metodos de escritura, y aqui se comprueba ademas que
 * WRITES_ENABLED y RELEASE_UNLOCKED sigan en false antes de leer nada.
 */
export const DAILY_DEFAULT_DAYS = 90;
export const DAILY_MAX_DAYS = 120;
const BOGOTA_OFFSET_HOURS = -5;
const CHANNELS = Object.freeze({ 7208046: 'BOOKING', 7208051: 'AIRBNB', 7192171: 'DIRECTA' });

export const EXIT = Object.freeze({ OK: 0, FAILED: 1, CONFIG: 2, PRIVACY: 3, SAFETY: 4 });

const iso = (d) => d.toISOString().slice(0, 10);

/** Fecha de hoy en Bogota y ventana [hoy, hoy + days - 1] (noches inclusive). */
export function dailyWindowEnv(now = new Date(), days = DAILY_DEFAULT_DAYS) {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > DAILY_MAX_DAYS) { const e = new Error('DAILY_DAYS_INVALID'); e.code = 'DAILY_DAYS_INVALID'; throw e; }
  const bogota = new Date(now.getTime() + BOGOTA_OFFSET_HOURS * 3600000);
  const from = iso(bogota);
  const to = iso(new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate() + n - 1)));
  return { RECONCILE_FROM: from, RECONCILE_TO: to };
}

/** Categoria de un fallo a partir de su codigo (solo codigos; nunca cuerpos de respuesta). */
export function classifyFailure(code) {
  const c = String(code ?? 'UNKNOWN');
  if (/_AUTH_REJECTED$/.test(c)) return 'CREDENCIALES_RECHAZADAS';
  if (/_CONFIG_INVALID$|^CONFIG_|_ENV_MISSING$|^WINDOW_|^DAILY_/.test(c)) return 'CONFIGURACION';
  if (/PAGINATION|INCOMPLETE|_LIMIT$|FIELDS_MISSING|RESPONSE_INVALID/.test(c)) return 'API_INCOMPLETA';
  if (/TIMEOUT|NETWORK|UPSTREAM_UNAVAILABLE/.test(c)) return 'RED_O_SERVICIO';
  if (/READ_ONLY_VIOLATION/.test(c)) return 'SEGURIDAD';
  return 'OTRO';
}

const brief = (r) => ({ ref: r.smoobuRef, unit: r.unit, arrival: r.arrival, departure: r.departure, channel: CHANNELS[r.channelId] ?? 'OTRO' });

/** Resumen diario a partir del informe PUBLICO (ya enmascarado). Puro. */
export function buildDailySummary(pub, { at }) {
  const per = pub.perReservation ?? [];
  const by = (v) => per.filter((r) => r.verdict === v);
  const alertsTotal = Object.values(pub.alertCounts ?? {}).reduce((a, b) => a + b, 0);
  const overbooking = [
    ...(pub.overbookingWatch?.entries ?? []).filter((e) => e.status === 'OVERBOOKING_ALERT').map((e) => ({ ref: e.smoobuRef, unit: e.unit, arrival: e.arrival, source: 'VIGILANCIA' })),
    ...(pub.overbookingInList ?? []).map((e) => ({ ref: e.smoobuRef, unit: e.unit, arrival: e.arrival, source: 'LISTADO' })),
  ];
  const summary = {
    at, result: 'OK', window: pub.window, summary: pub.summary, alertCounts: pub.alertCounts ?? null,
    missing: by('MISSING_IN_ODOO').map(brief),
    conflicts: by('CONFLICT').map((r) => ({ ...brief(r), reason: r.reason })),
    ambiguous: by('AMBIGUOUS').map((r) => ({ ...brief(r), reason: r.reason })),
    drafts: by('MATCH_DRAFT').map((r) => ({ ...brief(r), reason: r.reason })),
    withAlerts: per.filter((r) => (r.alerts ?? []).length).map((r) => ({ ...brief(r), alerts: r.alerts })),
    overbooking,
    smoobuOverbooking: (pub.smoobuOverbooking ?? []).length,
    errors: [],
    safety: { writesEnabled: pub.safety?.writesEnabled ?? null, releaseUnlocked: pub.safety?.releaseUnlocked ?? null, odooWrites: pub.reads?.odoo?.writes ?? null },
  };
  if (summary.missing.length || summary.conflicts.length || summary.ambiguous.length || overbooking.length || summary.smoobuOverbooking || alertsTotal) summary.result = 'ATENCION';
  return summary;
}

const row = (cells) => `| ${cells.join(' | ')} |`;

/** Markdown para el resumen del job de GitHub. Solo datos del resumen enmascarado. */
export function renderMarkdown(s) {
  const lines = [`## Conciliacion Smoobu -> Odoo (solo lectura) — ${s.result}`, '', `Fecha: ${s.at}`];
  if (s.result === 'FALLO') {
    lines.push('', `**Fallo seguro**: ${s.failure.category} (\`${s.failure.code}\`${s.failure.httpStatus ? `, HTTP ${s.failure.httpStatus}` : ''}). No se escribio nada.`);
    return `${lines.join('\n')}\n`;
  }
  lines.push(`Ventana: ${s.window.from} -> ${s.window.to} (${s.window.nights} noches)`, '', row(['Veredicto', 'Reservas']), row(['---', '---']));
  for (const [k, v] of Object.entries(s.summary ?? {})) lines.push(row([k, String(v)]));
  if (s.alertCounts) { lines.push('', row(['Aviso', 'Reservas']), row(['---', '---'])); for (const [k, v] of Object.entries(s.alertCounts)) lines.push(row([k, String(v)])); }
  const table = (title, items, extra) => {
    if (!items.length) return;
    lines.push('', `### ${title} (${items.length})`, row(['Reserva', 'Hab.', 'Llegada', 'Salida', 'Canal', extra ?? '']), row(['---', '---', '---', '---', '---', '---']));
    for (const i of items) lines.push(row([i.ref, i.unit, i.arrival, i.departure ?? '', i.channel ?? i.source ?? '', extra === 'Avisos' ? i.alerts.join(', ') : (i.reason ?? '')]));
  };
  table('Faltan en Odoo', s.missing);
  table('Conflictos', s.conflicts, 'Motivo');
  table('Ambiguas', s.ambiguous, 'Motivo');
  table('Borradores sin turno', s.drafts, 'Motivo');
  table('Con avisos de importes', s.withAlerts, 'Avisos');
  table('Alertas de sobreventa', s.overbooking, 'Origen');
  lines.push('', `Seguridad: writesEnabled=${s.safety.writesEnabled}, releaseUnlocked=${s.safety.releaseUnlocked}, escrituras en Odoo=${s.safety.odooWrites}.`);
  return `${lines.join('\n')}\n`;
}

/**
 * Orquesta una ejecucion diaria. Devuelve { exitCode, stdout (objeto imprimible), markdown, report (publico o null) }.
 * `secrets` solo se usan para la barrera de privacidad (nunca se imprimen).
 */
export async function runDaily({ smoobu, odoo, env = {}, now = new Date(), watchIds = [], secrets = [] }) {
  const at = now.toISOString();
  if (WRITES_ENABLED !== false || RELEASE_UNLOCKED !== false) {
    const s = { at, result: 'FALLO', failure: { category: 'SEGURIDAD', code: 'WRITE_SWITCH_ON', httpStatus: null } };
    return { exitCode: EXIT.SAFETY, stdout: s, markdown: renderMarkdown(s), report: null };
  }
  let window;
  try {
    const wEnv = env.RECONCILE_FROM || env.RECONCILE_TO ? { RECONCILE_FROM: env.RECONCILE_FROM, RECONCILE_TO: env.RECONCILE_TO } : dailyWindowEnv(now, env.RECONCILE_DAYS ?? DAILY_DEFAULT_DAYS);
    window = resolveWindow(wEnv);
  } catch (e) {
    const s = { at, result: 'FALLO', failure: { category: 'CONFIGURACION', code: e.code ?? 'WINDOW_ERROR', httpStatus: null } };
    return { exitCode: EXIT.CONFIG, stdout: s, markdown: renderMarkdown(s), report: null };
  }
  let out;
  try {
    out = await runReconcileIds({ smoobu, odoo, window, watchIds });
  } catch (e) {
    const s = { at, result: 'FALLO', failure: { category: classifyFailure(e.code), code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null }, writes: 0 };
    return { exitCode: EXIT.FAILED, stdout: s, markdown: renderMarkdown(s), report: null };
  }
  const pub = { at, result: 'CONCILIACION_POR_IDS_EN_MEMORIA', ...toPublicReport(out) };
  const summary = buildDailySummary(pub, { at });
  const markdown = renderMarkdown(summary);
  const text = JSON.stringify(pub) + JSON.stringify(summary) + markdown;
  const guard = assertPublicSafe(text, { identifiers: sensitiveValues(out), secrets });
  if (!guard.safe) {
    const s = { at, result: 'FALLO', failure: { category: 'PRIVACIDAD', code: 'PRIVACY_GUARD_TRIPPED', httpStatus: null }, hits: guard.hits };
    return { exitCode: EXIT.PRIVACY, stdout: s, markdown: renderMarkdown(s), report: null };
  }
  return { exitCode: EXIT.OK, stdout: summary, markdown, report: pub };
}
