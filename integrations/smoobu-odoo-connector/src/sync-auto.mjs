import { ConnectorError } from './errors.mjs';
import { OPS, STATUS, CASA_UNITS } from './sync-intent.mjs';
import { semiautoPlan, limitsFromEnv, killState } from './sync-semiauto.mjs';
import { applyPlan } from './sync-apply.mjs';
import { validateWrite } from './sync-write-guard.mjs';
import { addDays } from './window.mjs';
import { maskSmoobu } from './public-report.mjs';
import { auditSyncWrites } from './sync-latch.mjs';

/**
 * ATH-DEV-125 — SINCRONIZACION PROGRAMADA (incremental por referencia unica de Smoobu).
 *  - Solo crea: contacto + pedido en BORRADOR para reservas vigentes que aun no tienen pedido (MISSING_IN_ODOO).
 *    Lo ya sincronizado aparece como MATCH/MATCH_DRAFT y no se toca: la referencia SMOOBU-<id> hace la sincronizacion
 *    incremental e idempotente.
 *  - Nunca: confirmar, cancelar, modificar pedidos existentes, pagos, facturas (escritor restringido + lista blanca).
 *  - Lote: SYNC_MAX_OPS (1..10), recortado al tope de la fase actual AUTO_PHASE_MAX_OPS (hoy 1) por ejecucion.
 *  - Apagado: sin SYNC_ENABLED=true no arranca; SYNC_KILL=1 lo detiene antes de cada operacion.
 *  - ATH-DEV-129: cupo diario persistente (3/dia, leido de Odoo) y apagado automatico (shutdownReason) ante errores,
 *    duplicados, cambios inesperados o escrituras parciales.
 *  - ATH-DEV-130: el apagado NO deshabilita el workflow: bloquea la ESCRITURA de forma persistente (src/sync-latch.mjs) y la
 *    vigilancia en sombra sigue corriendo. Solo gerencia lo desbloquea.
 *  - Los borradores NO crean turnos en Planning (Odoo los crea al confirmar, automatizacion 151): el tablero de ocupacion
 *    de este modulo muestra las cinco habitaciones fisicas con lo confirmado, los borradores y lo pendiente.
 */
export const AUTO_METHODS = Object.freeze(new Set(['res.partner.create', 'sale.order.create', 'sale.order.message_post']));
export const AUTO_MAX_OPS_CAP = 10;
/** ATH-DEV-128 — Tope FIJO de la fase de arranque: una reserva por ejecucion, diga lo que diga la variable. Subirlo exige PR. */
export const AUTO_PHASE_MAX_OPS = 1;
export const WRITES_PER_CREATE = 3;
/**
 * ATH-DEV-129 — CUPO DIARIO PERSISTENTE: como mucho 3 reservas nuevas por dia de Bogota, sumando TODAS las ejecuciones.
 * El contador no vive en GitHub Actions (que no guarda estado entre ejecuciones ni tras reinicios): se LEE de Odoo, contando
 * los pedidos con la nota interna "ATH-SYNC | clave ... | CREATE_ORDER" escrita desde las 00:00 de Bogota (05:00 UTC).
 * Si no se puede leer el contador, no se escribe (error -> apagado).
 */
export const AUTO_DAILY_MAX = 3;
export const DAILY_READ_LIMIT = 100;
export const dayStartUtc = (today) => `${today} 05:00:00`;
const SYNC_CREATE_NOTE = [['model', '=', 'sale.order'], ['message_type', '=', 'comment'], ['body', 'ilike', 'ATH-SYNC | clave'], ['body', 'ilike', '| CREATE_ORDER']];

export async function readDailyCreates(reader, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today ?? ''))) throw new ConnectorError('CUPO_DIARIO_FECHA_INVALIDA');
  const rows = await reader.searchRead('mail.message', [...SYNC_CREATE_NOTE, ['date', '>=', dayStartUtc(today)]], ['res_id'], { limit: DAILY_READ_LIMIT });
  if (!Array.isArray(rows) || rows.length >= DAILY_READ_LIMIT) throw new ConnectorError('CUPO_DIARIO_NO_VERIFICABLE');
  return new Set(rows.map((r) => r.res_id)).size;
}
/** Total historico de pedidos creados por la sincronizacion (solo para comprobar que el contador encuentra las notas). */
export async function readTotalCreates(reader) { return reader.searchCount('mail.message', SYNC_CREATE_NOTE); }

/**
 * ATH-DEV-129 — APAGADO AUTOMATICO. Precondiciones que indican un CAMBIO INESPERADO o un DUPLICADO: detienen la ejecucion
 * entera y el workflow se deshabilita a si mismo. Las de identidad (nombre ambiguo, solo coincide el nombre) no son un
 * fallo: la reserva queda pendiente de una persona, se avisa y no consume el cupo de la ejecucion.
 */
export const DUPLICATE_PRECONDITIONS = Object.freeze(new Set(['PEDIDO_YA_EXISTE', 'CONTACTOS_DUPLICADOS']));
export const HUMAN_REVIEW_PRECONDITIONS = Object.freeze(new Set(['NOMBRE_NO_IDENTIFICABLE', 'IDENTIDAD_AMBIGUA', 'COINCIDENCIA_SOLO_POR_NOMBRE', 'SIN_ID_SMOOBU']));
export function haltOnPrecondition(code) {
  if (DUPLICATE_PRECONDITIONS.has(code)) return 'DUPLICADO_DETECTADO';
  if (HUMAN_REVIEW_PRECONDITIONS.has(code)) return null;
  return 'CAMBIO_INESPERADO'; // precio, fechas, habitacion, canal, huesped, estado, noches ocupadas, lectura incompleta...
}
/** Veredictos del conciliador que significan pedidos duplicados para una misma reserva: no se escribe nada. */
export const DUPLICATE_REASONS = Object.freeze(new Set(['VARIOS_PEDIDOS_CON_EL_MISMO_ID', 'PEDIDO_COMPARTIDO_POR_VARIAS_RESERVAS', 'PEDIDO_REFERENCIA_VARIAS_RESERVAS']));
export const duplicatesIn = (report) => (report?.perReservation ?? []).filter((r) => r.verdict === 'AMBIGUOUS' && DUPLICATE_REASONS.has(r.reason));

export function maxOpsFromEnv(env = {}) {
  if (env.SYNC_MAX_OPS == null || env.SYNC_MAX_OPS === '') return AUTO_PHASE_MAX_OPS;
  const n = Number(env.SYNC_MAX_OPS);
  if (!Number.isInteger(n) || n < 1 || n > AUTO_MAX_OPS_CAP) throw new ConnectorError('SYNC_MAX_OPS_INVALID');
  return Math.min(n, AUTO_PHASE_MAX_OPS);
}

/** Escritor restringido de la sincronizacion programada: solo crear contacto, crear pedido y la nota; tope por lote. */
export function autoWriter(inner, { maxOps }) {
  const max = maxOps * WRITES_PER_CREATE; let n = 0;
  return {
    get writes() { return inner.writes ?? n; }, simulated: inner.simulated === true, maxWrites: max,
    async execute(model, method, params) {
      if (!AUTO_METHODS.has(`${model}.${method}`)) throw new ConnectorError('SYNC_WRITE_AUTO_METHOD_FORBIDDEN');
      validateWrite(model, method, params);
      if (n >= max) throw new ConnectorError('SYNC_WRITE_AUTO_BUDGET');
      n += 1;
      return inner.execute(model, method, params);
    },
  };
}

/** Plan automatico: solo CREATE_ORDER puede quedar LISTO; todo lo demas se muestra como pendiente y NUNCA se ejecuta aqui. */
export function autoPlan(plan, { limits }) {
  const semi = semiautoPlan(plan, { limits });
  return { ...semi, ops: semi.ops.map((o) => (o.op === OPS.CREATE_ORDER || o.status !== STATUS.LISTO ? o : { ...o, status: STATUS.REQUIERE_APROBACION })) };
}

export async function runAuto({ plan, report = null, env = {}, isKilled = () => false, reader, writer, smoobu, journal, lock, today }) {
  const off = killState(env);
  if (off) return { halted: off, results: [], writes: 0, plan };
  const limits = limitsFromEnv(env); const phaseMax = maxOpsFromEnv(env);
  const auto = autoPlan(plan, { limits });
  // duplicados ya presentes en Odoo para una reserva de la ventana: no se escribe nada hasta que una persona lo revise
  if (duplicatesIn(report).length) return { halted: 'DUPLICADO_DETECTADO', results: [], writes: 0, plan: auto, limits, maxOps: 0 };
  // ATH-DEV-130: cerrojo en Odoo. Restos de una escritura parcial o duplicados creados por la sincronizacion = no se escribe
  const audit = await auditSyncWrites(reader);
  if (!audit.ok) return { halted: 'AUDITORIA_ESCRITURAS', audit, results: [], writes: 0, plan: auto, limits, maxOps: 0 };
  // cupo diario persistente (leido de Odoo): lote = min(tope de fase, lo que queda del dia)
  const used = await readDailyCreates(reader, today);
  const daily = { used, max: AUTO_DAILY_MAX, remaining: Math.max(0, AUTO_DAILY_MAX - used) };
  if (daily.remaining === 0) return { halted: 'CUPO_DIARIO_AGOTADO', results: [], writes: 0, plan: auto, limits, maxOps: 0, daily };
  const maxOps = Math.min(phaseMax, daily.remaining);
  // sin aprobaciones: confirmar, cancelar o modificar no se ejecutan nunca desde la sincronizacion programada
  const res = await applyPlan({ plan: auto, reader, writer: autoWriter(writer, { maxOps }), smoobu, journal, lock, approvals: new Set(), maxOps, today, shouldStop: isKilled, preconditionUsesSlot: false, haltOnPrecondition });
  return { ...res, plan: auto, limits, maxOps, daily };
}

/** Paradas que deben avisar (fallan el job, GitHub notifica y se BLOQUEA la escritura de forma persistente: ATH-DEV-130). */
export const ALERT_HALTS = /AMBIGUO|VERIFICACION|FALLO_PARCIAL|RECUPERACION|PRIVACIDAD|SYNC_WRITE|DUPLICADO|CAMBIO_INESPERADO|LECTURA|ODOO_|SMOOBU_|LOCK|AUDITORIA/;
/** Resultados por operacion que exigen apagar la sincronizacion. */
export const SHUTDOWN_RESULTS = Object.freeze(new Set(['AMBIGUA', 'VERIFICACION_FALLIDA', 'RECHAZADA_POR_ODOO']));

/**
 * ATH-DEV-129 — ¿Hay que APAGAR la sincronizacion? Devuelve el motivo o null. Paradas normales (cupo diario agotado,
 * interruptores apagados) NO apagan: son el funcionamiento esperado.
 */
export function shutdownReason({ run, report }) {
  if (run?.halted && ALERT_HALTS.test(run.halted)) return run.halted;
  const bad = (run?.results ?? []).find((r) => SHUTDOWN_RESULTS.has(r.result));
  if (bad) return `${bad.result}${bad.code ? `_${bad.code}` : ''}`;
  if (duplicatesIn(report).length) return 'DUPLICADO_DETECTADO';
  return null;
}

/** Alertas enmascaradas para anotaciones de GitHub (::warning:: / ::error::). */
export function alertsFrom({ run, report }) {
  const out = [];
  if (run.halted && ALERT_HALTS.test(run.halted)) out.push({ level: 'error', text: `Sincronizacion detenida: ${run.halted}` });
  for (const r of run.results ?? []) if (['AMBIGUA', 'VERIFICACION_FALLIDA', 'RECHAZADA_POR_ODOO'].includes(r.result)) out.push({ level: 'error', text: `${maskSmoobu(r.smoobuId)} ${r.op}: ${r.result} ${r.code ?? ''}`.trim() });
  // ATH-DEV-128: una creacion planificada que no supera la validacion previa (duplicado, precio, fechas, estado...) se avisa
  for (const r of run.results ?? []) if (r.result === 'PRECONDICION_FALLIDA') out.push({ level: 'warning', text: `${maskSmoobu(r.smoobuId)} ${r.op}: no se escribio (${r.code})` });
  for (const r of report.perReservation ?? []) {
    if (r.verdict === 'CONFLICT' || r.verdict === 'AMBIGUOUS') out.push({ level: 'warning', text: `${maskSmoobu(r.smoobuId)} ${r.unit} ${r.arrival}: ${r.verdict} ${r.reason}` });
    if ((r.overbookingWith ?? []).length || r.manualReview) out.push({ level: 'warning', text: `${maskSmoobu(r.smoobuId)} ${r.unit} ${r.arrival}: SOBREVENTA` });
  }
  // ATH-DEV-132: conflictos conocidos del plan (pedido facturado, sobreventa, ambigua, noches ocupadas...). Solo AVISAN:
  // no requieren escritura, no paran la vigilancia y no abren bloqueo (shutdownReason no los mira).
  for (const o of run.plan?.ops ?? []) {
    if (o.status !== STATUS.BLOQUEADO) continue;
    out.push({ level: 'warning', text: `${maskSmoobu(o.smoobuId)} ${o.unit} ${o.arrival}: BLOQUEADO ${(o.guards ?? []).join(',') || 'SIN_MOTIVO'}` });
  }
  const seen = new Set();
  return out.filter((a) => { const k = `${a.level}|${a.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Seccion "Alertas" del resumen del job (mismas alertas que las anotaciones de GitHub). */
export function renderAlerts(alerts) {
  const icon = { error: 'ERROR', warning: 'AVISO', notice: 'NOTA' };
  return ['### Alertas', '', ...(alerts.length ? alerts.map((a) => `- **${icon[a.level] ?? a.level}** ${a.text}`) : ['(ninguna)']), ''].join('\n');
}

/* ---------------- tablero de ocupacion (5 habitaciones fisicas) ---------------- */

/** Codigos de celda (prioridad de mayor a menor). */
export const CELL = Object.freeze({ CONFLICTO: 'X', PENDIENTE: 'P', BORRADOR: 'B', CONFIRMADA: 'C', LIBRE: '.' });
const RANK = { X: 4, P: 3, B: 2, C: 1, '.': 0 };

/**
 * Tablero de ocupacion: filas = las cinco habitaciones fisicas (Casa Completa NO es una fila: una reserva de Casa marca las
 * cinco habitaciones con su codigo y prefijo "K"). Columnas = noches desde `from`. Puro y sin datos personales.
 */
export function buildOccupancyBoard({ report, plan, from, nights = 14 }) {
  const days = Array.from({ length: nights }, (_, i) => addDays(from, i));
  const grid = Object.fromEntries(CASA_UNITS.map((u) => [u, days.map(() => ({ code: CELL.LIBRE, casa: false }))]));
  const opBy = new Map((plan?.ops ?? []).map((o) => [o.smoobuId, o]));
  // el codigo refleja la OCUPACION (veredicto); una operacion pendiente o bloqueada sobre un pedido existente (rellenar
  // datos, pedido facturado) no cambia su ocupacion. Solo una reserva SIN pedido usa el estado de su creacion.
  const codeFor = (r) => {
    const op = opBy.get(r.smoobuId);
    if (r.verdict === 'CONFLICT' || r.verdict === 'AMBIGUOUS') return CELL.CONFLICTO;
    if (r.verdict === 'MISSING_IN_ODOO') return op?.status === STATUS.BLOQUEADO ? CELL.CONFLICTO : CELL.PENDIENTE;
    if (r.verdict === 'MATCH_DRAFT') return CELL.BORRADOR;
    if (r.verdict === 'MATCH' || r.verdict === 'ROOM_MOVED' || r.verdict === 'DAYUSE_OK') return CELL.CONFIRMADA;
    return null;
  };
  for (const r of report.perReservation ?? []) {
    if (r.smoobuStatus !== 'ACTIVE' && r.verdict !== 'CONFLICT') continue;
    const code = codeFor(r); if (!code) continue;
    const units = r.unit === 'CASA' ? CASA_UNITS : [r.unit];
    days.forEach((d, i) => {
      if (!(d >= r.arrival && d < r.departure)) return;
      for (const u of units) {
        const cell = grid[u]?.[i]; if (!cell) continue;
        if (RANK[code] > RANK[cell.code]) cell.code = code;
        if (r.unit === 'CASA') cell.casa = true;
      }
    });
  }
  return { from, days, rows: CASA_UNITS.map((u) => ({ unit: u, cells: grid[u].map((c) => (c.casa ? `K${c.code}` : c.code)) })) };
}

export function renderOccupancyBoard(b) {
  const head = ['Hab.', ...b.days.map((d) => d.slice(5).replace('-', '/'))];
  return [
    '### Ocupacion (5 habitaciones fisicas; Casa Completa = prefijo K en las cinco)',
    `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`,
    ...b.rows.map((r) => `| ${r.unit} | ${r.cells.join(' | ')} |`),
    '', 'C confirmada · B borrador · P pendiente (por crear o por aprobar) · X conflicto/bloqueo · . libre', '',
  ].join('\n');
}
