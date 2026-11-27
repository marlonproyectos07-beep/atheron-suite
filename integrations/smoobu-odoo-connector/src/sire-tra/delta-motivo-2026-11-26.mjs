import { NS, REASONS } from './manifest.mjs';

/**
 * Cambio minimo del formulario de registro (26/11/2026): anadir la opcion 'Trabajo' a "Motivo principal del viaje".
 *  - Las 7 opciones existentes conservan id y texto. Solo 'Otro' cambia de posicion para seguir siendo la ultima
 *    (secuencia +1).
 *  - 'Trabajo' se crea sin marcar como correcta ni por defecto: el formulario no preselecciona respuestas.
 *  - No toca respuestas ya recibidas.
 * planMotivo: solo lecturas; bloquea si las opciones actuales no son exactamente las esperadas (deriva).
 * applyMotivo: una sola escritura sobre la pregunta (crear 'Trabajo' + secuencia de 'Otro').
 * revertMotivo: devuelve 'Otro' a su secuencia y borra 'Trabajo' SOLO si ninguna respuesta lo usa. Solo con orden expresa.
 */
export const MOTIVO_DELTA_ID = 'tra-motivo-trabajo-2026-11-26';
export const MOTIVO_NEW = 'Trabajo';
export const MOTIVO_BASE = Object.freeze(REASONS.filter((r) => r !== MOTIVO_NEW));
export const MOTIVO_TARGET = REASONS;

export class MotivoError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }

async function readQuestion(odoo) {
  const [d] = await odoo.searchRead('ir.model.data', [['module', '=', NS], ['name', '=', 'q_p_reason']], ['res_id']);
  if (!d) return { qid: null, answers: [] };
  const answers = await odoo.searchRead('survey.question.answer', [['question_id', '=', d.res_id]], ['id', 'value', 'sequence', 'is_correct'], { order: 'sequence, id' });
  return { qid: d.res_id, answers };
}

export async function planMotivo(odoo) {
  const { qid, answers } = await readQuestion(odoo);
  const plan = { id: MOTIVO_DELTA_ID, qid, status: null, blocked: null, change: null, backup: { delta: MOTIVO_DELTA_ID, takenAt: new Date().toISOString(), qid, answers: answers.map(({ id, value, sequence }) => ({ id, value, sequence })) } };
  if (!qid) { plan.blocked = 'PREGUNTA_NO_INSTALADA'; return plan; }
  const values = answers.map((a) => a.value);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (same(values, MOTIVO_TARGET)) { plan.status = 'ya_aplicado'; return plan; }
  if (!same(values, MOTIVO_BASE)) { plan.blocked = 'DERIVA_OPCIONES'; return plan; }
  const otro = answers[answers.length - 1];
  if (otro.value !== 'Otro') { plan.blocked = 'DERIVA_OPCIONES'; return plan; }
  if (answers.some((a, i) => i > 0 && a.sequence <= answers[i - 1].sequence)) { plan.blocked = 'SECUENCIAS_NO_ORDENADAS'; return plan; }
  plan.status = 'pendiente';
  plan.change = { createValue: MOTIVO_NEW, createSequence: otro.sequence, otroId: otro.id, otroSequence: otro.sequence + 1 };
  return plan;
}

export async function applyMotivo(odoo, plan) {
  if (!plan || plan.id !== MOTIVO_DELTA_ID) throw new MotivoError('PLAN_REQUIRED');
  if (plan.blocked) throw new MotivoError('PLAN_BLOCKED', plan.blocked);
  if (plan.status !== 'pendiente') return { id: MOTIVO_DELTA_ID, applied: [] };
  const c = plan.change;
  await odoo.write('survey.question', [plan.qid], { suggested_answer_ids: [[0, 0, { value: c.createValue, sequence: c.createSequence }], [1, c.otroId, { sequence: c.otroSequence }]] });
  return { id: MOTIVO_DELTA_ID, applied: [`answer:${c.createValue}@${c.createSequence}`, `answer:${c.otroId}:sequence=${c.otroSequence}`] };
}

/** Comprobacion posterior. Con el respaldo previo, ademas exige que las 7 opciones anteriores sigan con su id y texto. */
export async function verifyMotivo(odoo, backup = null) {
  const plan = await planMotivo(odoo);
  const { answers } = await readQuestion(odoo);
  const trabajo = answers.find((a) => a.value === MOTIVO_NEW);
  const keptIds = !backup || backup.answers.every((b) => answers.some((a) => a.id === b.id && a.value === b.value));
  return { ok: plan.status === 'ya_aplicado' && !plan.blocked && keptIds && !!trabajo && trabajo.is_correct !== true, keptIds, order: answers.map((a) => a.value), trabajoId: trabajo?.id ?? null };
}

/** Reversion (solo con orden expresa): exige que nadie haya respondido 'Trabajo'; no toca ninguna otra opcion. */
export async function revertMotivo(odoo, backup) {
  if (!backup || backup.delta !== MOTIVO_DELTA_ID) throw new MotivoError('BACKUP_REQUIRED');
  const { qid, answers } = await readQuestion(odoo);
  if (qid !== backup.qid) throw new MotivoError('PREGUNTA_DISTINTA');
  const trabajo = answers.find((a) => a.value === MOTIVO_NEW);
  const otro = backup.answers.find((a) => a.value === 'Otro');
  if (!trabajo || !otro) throw new MotivoError('REVERT_NOT_AT_TARGET');
  const used = await odoo.searchRead('survey.user_input.line', [['suggested_answer_id', '=', trabajo.id]], ['id'], { limit: 1 });
  if (used.length) throw new MotivoError('TRABAJO_YA_RESPONDIDO');
  await odoo.write('survey.question', [qid], { suggested_answer_ids: [[2, trabajo.id, 0], [1, otro.id, { sequence: otro.sequence }]] });
  return { id: MOTIVO_DELTA_ID, reverted: [`answer:${trabajo.id}:borrada`, `answer:${otro.id}:sequence=${otro.sequence}`] };
}
